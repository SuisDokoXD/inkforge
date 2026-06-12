import { randomUUID } from "crypto";
import {
  cleanupOrphanRelationships,
  deleteNovelCharacter,
  getChapter,
  getNovelCharacterById,
  getProject,
  insertNovelCharacter,
  listNovelCharacters,
  readChapterFile,
  updateNovelCharacter,
} from "@inkforge/storage";
import type {
  NovelCharacterCreateInput,
  NovelCharacterDeleteInput,
  NovelCharacterExtractCandidate,
  NovelCharacterExtractInput,
  NovelCharacterExtractRelation,
  NovelCharacterExtractResponse,
  NovelCharacterGetInput,
  NovelCharacterImportCandidatesInput,
  NovelCharacterImportCandidatesResponse,
  NovelCharacterListInput,
  NovelCharacterRecord,
  NovelCharacterUpdateInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { checkAchievementsAndNotify } from "./achievement-service";
import {
  pickProviderKey,
  reportProviderKeyResult,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";

const CHARACTER_EXTRACT_SYSTEM_PROMPT = [
  "你是小说人物档案整理助手。",
  "任务：从用户给出的章节正文中识别值得加入人物库的角色。",
  "只提取正文里真实出现或被明确提到的人物，不要提取地点、组织、物品、旁白称谓或作者。",
  "如果同一人物有别名或称呼，合并到 aliases。",
  "同时识别人物之间已经被正文明确表达的关系，例如师徒、亲属、雇佣、敌对、暗恋、同伴、上下级。",
  "不要编造正文没有支撑的设定；无法确定的字段留短。",
  "输出严格 JSON，不要 Markdown 代码块、不要解释，结构如下：",
  '{"characters":[{"name":"姓名","aliases":["别名"],"persona":"性格/口吻，40字以内","backstory":"已知身份、关系、经历，120字以内","evidence":"支撑判断的原文短句，60字以内","confidence":0.0}],"relationships":[{"sourceName":"人物A","targetName":"人物B","label":"关系","evidence":"支撑判断的原文短句，60字以内","confidence":0.0}]}',
  "必须以 { 开头，以 } 结尾；不要输出任何 JSON 之外的文字。",
].join("\n");

const CHARACTER_EXTRACT_REPAIR_SYSTEM_PROMPT = [
  "你是 JSON 修复器。",
  "用户会给你一段上一次模型返回的人物识别结果。",
  "你的任务是把它改写成严格 JSON，不新增原文没有支持的人物或关系。",
  "只输出一个 JSON 对象，不要 Markdown 代码块、不要解释。",
  "结构必须是：",
  '{"characters":[{"name":"姓名","aliases":["别名"],"persona":"性格/口吻","backstory":"身份/经历","evidence":"原文依据","confidence":0.0}],"relationships":[{"sourceName":"人物A","targetName":"人物B","label":"关系","evidence":"原文依据","confidence":0.0}]}',
  "如果原结果里没有可用人物，输出 {\"characters\":[],\"relationships\":[]}。",
].join("\n");

function normalizeText(input: string, max = 500): string {
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function chapterTextForPrompt(content: string): string {
  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .trim();
  if (normalized.length <= 12_000) return normalized;
  return [
    normalized.slice(0, 8_000),
    "\n\n【中间部分已省略】\n\n",
    normalized.slice(-4_000),
  ].join("");
}

function buildCharacterExtractUserPrompt(params: {
  chapterTitle: string;
  content: string;
  existingNames: string[];
  maxCandidates: number;
}): string {
  const lines: string[] = [];
  lines.push(`【章节标题】${params.chapterTitle}`);
  lines.push("");
  lines.push("【已在人物库中的角色】");
  lines.push(
    params.existingNames.length > 0
      ? params.existingNames.slice(0, 80).join("、")
      : "（暂无）",
  );
  lines.push("");
  lines.push(`【最多返回】${params.maxCandidates} 个候选人物`);
  lines.push("");
  lines.push("【章节正文】");
  lines.push(params.content);
  lines.push("");
  lines.push("请返回还值得加入人物库的角色；如果没有新角色，返回 {\"characters\":[]}。");
  return lines.join("\n");
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("模型没有返回人物识别内容，请换一个模型服务或稍后重试。");
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidates = [
    trimmed,
    fenced?.[1],
    findBalancedJsonSlice(trimmed, "{", "}"),
    findBalancedJsonSlice(trimmed, "[", "]"),
    (() => {
      const first = trimmed.indexOf("{");
      const last = trimmed.lastIndexOf("}");
      return first >= 0 && last > first ? trimmed.slice(first, last + 1) : undefined;
    })(),
    (() => {
      const first = trimmed.indexOf("[");
      const last = trimmed.lastIndexOf("]");
      return first >= 0 && last > first ? trimmed.slice(first, last + 1) : undefined;
    })(),
  ].filter((x): x is string => Boolean(x && x.trim()));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(stripJsonTrailingCommas(candidate));
      } catch {
        /* try next candidate */
      }
    }
  }
  throw new Error("模型返回的格式不对，暂时没有读出可用的人物清单。");
}

function findBalancedJsonSlice(
  text: string,
  open: "{" | "[",
  close: "}" | "]",
): string | undefined {
  const start = text.indexOf(open);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

function stripJsonTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, "$1");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? normalizeText(item, 40) : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeCandidate(raw: unknown): NovelCharacterExtractCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = normalizeText(String(obj.name ?? ""), 32);
  if (!name) return null;
  const confidence = Number(obj.confidence ?? 0.6);
  return {
    name,
    aliases: asStringArray(obj.aliases),
    persona: normalizeText(String(obj.persona ?? ""), 160),
    backstory: normalizeText(String(obj.backstory ?? ""), 500),
    evidence: normalizeText(String(obj.evidence ?? ""), 160),
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0.6,
  };
}

function normalizeRelation(raw: unknown): NovelCharacterExtractRelation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const sourceName = normalizeText(String(obj.sourceName ?? obj.source ?? ""), 32);
  const targetName = normalizeText(String(obj.targetName ?? obj.target ?? ""), 32);
  const label = normalizeText(String(obj.label ?? obj.relation ?? ""), 40);
  if (!sourceName || !targetName || !label || sourceName === targetName) return null;
  const confidence = Number(obj.confidence ?? 0.6);
  return {
    sourceName,
    targetName,
    label,
    evidence: normalizeText(String(obj.evidence ?? ""), 160),
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0.6,
  };
}

function parseCharacterExtractResult(
  raw: string,
  maxCandidates: number,
): {
  candidates: NovelCharacterExtractCandidate[];
  relationships: NovelCharacterExtractRelation[];
} {
  const parsed = extractJson(raw);
  const parsedObject =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const characterSource =
    Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsedObject.characters)
        ? (parsedObject.characters as unknown[])
        : Array.isArray(parsedObject.candidates)
          ? (parsedObject.candidates as unknown[])
          : [];
  const seen = new Set<string>();
  const candidates: NovelCharacterExtractCandidate[] = [];
  for (const item of characterSource) {
    const candidate = normalizeCandidate(item);
    if (!candidate) continue;
    const key = candidate.name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= maxCandidates) break;
  }

  const relationSource = Array.isArray(parsedObject.relationships)
    ? (parsedObject.relationships as unknown[])
    : Array.isArray(parsedObject.relations)
      ? (parsedObject.relations as unknown[])
      : [];
  const relationSeen = new Set<string>();
  const relationships: NovelCharacterExtractRelation[] = [];
  for (const item of relationSource) {
    const relation = normalizeRelation(item);
    if (!relation) continue;
    const key = `${relation.sourceName.toLocaleLowerCase()}\u0000${relation.targetName.toLocaleLowerCase()}\u0000${relation.label.toLocaleLowerCase()}`;
    if (relationSeen.has(key)) continue;
    relationSeen.add(key);
    relationships.push(relation);
  }

  return { candidates, relationships };
}

async function collectStreamText(input: {
  providerRecord: Parameters<typeof streamText>[0]["providerRecord"];
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  let accumulated = "";
  for await (const chunk of streamText(input)) {
    if (chunk.type === "delta" && chunk.textDelta) accumulated += chunk.textDelta;
    if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
  }
  return accumulated;
}

async function repairCharacterExtractJson(input: {
  providerRecord: Parameters<typeof streamText>[0]["providerRecord"];
  apiKey: string;
  model: string;
  rawOutput: string;
}): Promise<string> {
  return collectStreamText({
    providerRecord: input.providerRecord,
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt: CHARACTER_EXTRACT_REPAIR_SYSTEM_PROMPT,
    userMessage: [
      "请把下面的人物识别结果修复成规定 JSON。",
      "如果内容太乱无法判断，请输出空 characters 和 relationships。",
      "",
      "【待修复内容】",
      input.rawOutput.slice(0, 12_000),
    ].join("\n"),
    temperature: 0,
    maxTokens: 1800,
  });
}

function sourceTraits(
  candidate: NovelCharacterExtractCandidate,
  chapterId?: string,
): Record<string, unknown> {
  return {
    aliases: candidate.aliases,
    source: chapterId
      ? { kind: "chapter", chapterId, evidence: candidate.evidence }
      : { kind: "character-extract", evidence: candidate.evidence },
    confidence: candidate.confidence,
  };
}

export function createNovelCharacter(input: NovelCharacterCreateInput): NovelCharacterRecord {
  const ctx = getAppContext();
  const record = insertNovelCharacter(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    name: input.name,
    persona: input.persona ?? null,
    traits: input.traits ?? {},
    backstory: input.backstory ?? "",
    relations: input.relations ?? [],
    linkedTavernCardId: input.linkedTavernCardId ?? null,
  });
  try {
    checkAchievementsAndNotify(record.projectId, "character-create");
  } catch {
    /* do not block character creation on achievement bookkeeping */
  }
  return record;
}

export function updateNovelCharacterRecord(
  input: NovelCharacterUpdateInput,
): NovelCharacterRecord {
  const ctx = getAppContext();
  const { id, ...patch } = input;
  const record = updateNovelCharacter(ctx.db, { id, ...patch });
  try {
    checkAchievementsAndNotify(record.projectId, "character-update");
  } catch {
    /* do not block character updates on achievement bookkeeping */
  }
  return record;
}

export function getNovelCharacterRecord(
  input: NovelCharacterGetInput,
): NovelCharacterRecord | null {
  const ctx = getAppContext();
  return getNovelCharacterById(ctx.db, input.id);
}

export function listNovelCharacterRecords(
  input: NovelCharacterListInput,
): NovelCharacterRecord[] {
  const ctx = getAppContext();
  return listNovelCharacters(ctx.db, input.projectId);
}

export function deleteNovelCharacterRecord(
  input: NovelCharacterDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  // Look up project_id before delete to clean orphan polymorphic relationships.
  const existing = getNovelCharacterById(ctx.db, input.id);
  deleteNovelCharacter(ctx.db, input.id);
  if (existing) {
    cleanupOrphanRelationships(ctx.db, existing.projectId, "character", input.id);
  }
  return { id: input.id };
}

export async function extractNovelCharactersFromChapter(
  input: NovelCharacterExtractInput,
): Promise<NovelCharacterExtractResponse> {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.chapterId);
  if (!chapter || chapter.projectId !== input.projectId) {
    throw new Error("没有找到这篇章节。");
  }
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("没有找到当前项目。");

  const rawContent = readChapterFile(project.path, chapter.filePath);
  const content = chapterTextForPrompt(rawContent);
  if (content.replace(/\s+/g, "").length < 30) {
    throw new Error("这篇章节内容太少，暂时无法识别人物。");
  }

  const maxCandidates = Math.min(Math.max(input.maxCandidates ?? 8, 1), 12);
  const existingNames = listNovelCharacters(ctx.db, input.projectId).map((c) => c.name);
  const resolvedScene = resolveSceneBinding("analyze");
  const providerRecord = resolveProviderRecord(resolvedScene.providerId ?? undefined);
  if (!providerRecord) {
    throw new Error("还没有可用的模型服务，请先在设置里添加一个模型。");
  }
  const pickedKey = await pickProviderKey(providerRecord);
  if (!pickedKey) {
    throw new Error("当前模型服务缺少可用的访问密钥。");
  }

  const userMessage = buildCharacterExtractUserPrompt({
    chapterTitle: chapter.title,
    content,
    existingNames,
    maxCandidates,
  });

  let accumulated = "";
  try {
    accumulated = await collectStreamText({
      providerRecord,
      apiKey: pickedKey.apiKey,
      model: resolvedScene.model ?? providerRecord.defaultModel,
      systemPrompt: CHARACTER_EXTRACT_SYSTEM_PROMPT,
      userMessage,
      temperature: 0,
      maxTokens: 2200,
    });
    reportProviderKeyResult(pickedKey.keyId, true);
  } catch (error) {
    reportProviderKeyResult(pickedKey.keyId, false);
    throw error;
  }

  let parsed: {
    candidates: NovelCharacterExtractCandidate[];
    relationships: NovelCharacterExtractRelation[];
  };
  try {
    parsed = parseCharacterExtractResult(accumulated, maxCandidates);
  } catch (firstError) {
    const repaired = await repairCharacterExtractJson({
      providerRecord,
      apiKey: pickedKey.apiKey,
      model: resolvedScene.model ?? providerRecord.defaultModel,
      rawOutput: accumulated,
    });
    try {
      parsed = parseCharacterExtractResult(repaired, maxCandidates);
    } catch {
      throw new Error(
        firstError instanceof Error
          ? `${firstError.message} 已尝试自动修复，仍未成功；可以换一个模型或缩短章节后重试。`
          : "模型返回的格式不对，已尝试自动修复，仍未成功；可以换一个模型或缩短章节后重试。",
      );
    }
  }
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    candidates: parsed.candidates,
    relationships: parsed.relationships,
    providerId: providerRecord.id,
    model: resolvedScene.model ?? providerRecord.defaultModel,
  };
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function mergeRelations(
  current: NovelCharacterRecord["relations"],
  relation: { otherId: string; label: string },
): NovelCharacterRecord["relations"] {
  if (!relation.otherId || !relation.label.trim()) return current;
  const exists = current.some(
    (item) =>
      item.otherId === relation.otherId &&
      item.label.trim().toLocaleLowerCase() === relation.label.trim().toLocaleLowerCase(),
  );
  if (exists) return current;
  return [...current, { otherId: relation.otherId, label: relation.label.trim() }];
}

export function importNovelCharacterCandidates(
  input: NovelCharacterImportCandidatesInput,
): NovelCharacterImportCandidatesResponse {
  const existingCharacters = listNovelCharacterRecords({ projectId: input.projectId });
  const byName = new Map(existingCharacters.map((c) => [nameKey(c.name), c]));
  const created: NovelCharacterRecord[] = [];
  const skipped: NovelCharacterImportCandidatesResponse["skipped"] = [];

  for (const candidate of input.candidates) {
    const name = candidate.name.trim();
    if (!name) {
      skipped.push({ name: candidate.name, reason: "empty" });
      continue;
    }
    const key = nameKey(name);
    if (byName.has(key)) {
      skipped.push({ name, reason: "exists" });
      continue;
    }
    const record = createNovelCharacter({
      projectId: input.projectId,
      name,
      persona: candidate.persona,
      backstory: candidate.backstory || candidate.evidence,
      traits: sourceTraits(candidate, input.chapterId),
      relations: [],
    });
    created.push(record);
    byName.set(key, record);
  }

  const relationships: NovelCharacterImportCandidatesResponse["relationships"] = [];
  const updatedById = new Map(created.map((record) => [record.id, record]));
  for (const relation of input.relationships ?? []) {
    const source = byName.get(nameKey(relation.sourceName));
    const target = byName.get(nameKey(relation.targetName));
    if (!source || !target || source.id === target.id) continue;
    const nextRelations = mergeRelations(source.relations, {
      otherId: target.id,
      label: relation.label,
    });
    if (nextRelations === source.relations) continue;
    const updated = updateNovelCharacterRecord({
      id: source.id,
      relations: nextRelations,
    });
    byName.set(nameKey(updated.name), updated);
    if (updatedById.has(updated.id)) updatedById.set(updated.id, updated);
    relationships.push({
      sourceId: updated.id,
      targetId: target.id,
      label: relation.label.trim(),
    });
  }

  return {
    created: created.map((record) => updatedById.get(record.id) ?? record),
    skipped,
    relationships,
  };
}
