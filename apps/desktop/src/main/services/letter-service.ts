import { randomUUID } from "crypto";
import type { BrowserWindow } from "electron";
import {
  ipcEventChannels,
  type CharacterLetterRecord,
  type CharacterLetterTone,
} from "@inkforge/shared";
import {
  deleteLetter as repoDeleteLetter,
  dismissLetter as repoDismissLetter,
  getNovelCharacterById,
  getProject,
  insertLetter,
  listChapters,
  listLetters as repoListLetters,
  listNovelCharacters,
  markLetterRead as repoMarkLetterRead,
  pinLetter as repoPinLetter,
  getAppSettings,
} from "@inkforge/storage";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  pickProviderKey,
  resolveProviderRecord,
  reportProviderKeyResult,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";
import { buildRagBlock } from "./rag-service";
import { checkAchievementsAndNotify } from "./achievement-service";

/* ============================================================
 * Prompt 拼装
 * ============================================================ */

const TONE_HINT: Record<CharacterLetterTone, string> = {
  grateful: "感激作者最近给的戏份 / 角色发展，温暖语气",
  complaint: "微微抱怨太久没出场或台词写得不顺，可以撒娇但不能愤怒",
  curious: "对剧情走向 / 自身命运充满好奇，提一两个问题",
  encouraging: "鼓励作者坚持写下去，可以像老朋友打气",
  neutral: "日常聊天的语气，分享自己最近在故事里看到、想到的事",
};

const LETTER_SYSTEM_PROMPT = [
  "你是小说里的虚构角色，正在以第一人称给作者（也就是创造你的那个人）写一封短信。",
  "不要旁白，不要解释你正在写信这件事，直接进入信的内容。",
  "",
  "输出严格 JSON，不要 Markdown 代码块、不要任何解释，结构如下：",
  '{"subject":"<≤16字主题>","body":"<200~360字的信件正文，第一人称>","tone":"<grateful|complaint|curious|encouraging|neutral>"}',
  "",
  "正文要求：",
  "- 用「我」自称，称呼作者为「你」",
  "- 必须体现自己的人设特点（性格、口吻、习惯）",
  "- 可以提及自己经历过的某段情节，但不要剧透未来",
  "- 不要使用 emoji",
  "- 不要逐字复述档案内容",
].join("\n");

interface BuildPromptParams {
  characterName: string;
  characterPersona: string;
  characterBackstory: string;
  recentChapterTitles: string[];
  recentChapterExcerpt: string;
  toneHint: string;
}

function buildLetterUser(p: BuildPromptParams): string {
  const lines: string[] = [];
  lines.push(`【你的人设】`);
  lines.push(`姓名：${p.characterName}`);
  if (p.characterPersona) lines.push(`性格：${p.characterPersona.slice(0, 400)}`);
  if (p.characterBackstory) lines.push(`背景：${p.characterBackstory.slice(0, 400)}`);
  lines.push("");
  lines.push(`【最近的章节】`);
  if (p.recentChapterTitles.length > 0) {
    lines.push(p.recentChapterTitles.map((t, i) => `${i + 1}. ${t}`).join("\n"));
  } else {
    lines.push("（暂无）");
  }
  lines.push("");
  lines.push(`【最近的故事节选】`);
  lines.push(p.recentChapterExcerpt || "（暂无）");
  lines.push("");
  lines.push(`【这次来信的语气】${p.toneHint}`);
  lines.push("");
  lines.push("现在请按规定的 JSON 结构输出这封信。");
  return lines.join("\n");
}

/* ============================================================
 * 解析 LLM 响应
 * ============================================================ */

function parseLetterJson(raw: string): {
  subject: string;
  body: string;
  tone: CharacterLetterTone;
} {
  const trimmed = raw.trim().replace(/^```json\s*|```$/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 尝试抽出第一个 JSON 对象片段
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("letter_response_not_json");
    parsed = JSON.parse(m[0]);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("letter_invalid");
  const obj = parsed as Record<string, unknown>;
  const subject = String(obj.subject ?? "").trim();
  const body = String(obj.body ?? "").trim();
  let tone = String(obj.tone ?? "neutral") as CharacterLetterTone;
  if (
    !["grateful", "complaint", "curious", "encouraging", "neutral"].includes(tone)
  ) {
    tone = "neutral";
  }
  if (!subject) throw new Error("letter_no_subject");
  if (body.length < 30) throw new Error("letter_body_too_short");
  return { subject, body, tone };
}

/* ============================================================
 * service entry: 生成、列表、标记
 * ============================================================ */

interface GenerateInput {
  projectId: string;
  characterId?: string;
  tone?: CharacterLetterTone;
  providerId?: string;
  model?: string;
}

const TONE_WEIGHTS: Array<[CharacterLetterTone, number]> = [
  ["grateful", 25],
  ["curious", 25],
  ["encouraging", 20],
  ["neutral", 20],
  ["complaint", 10],
];

function pickRandomTone(): CharacterLetterTone {
  const total = TONE_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [tone, w] of TONE_WEIGHTS) {
    r -= w;
    if (r <= 0) return tone;
  }
  return "neutral";
}

export async function generateLetter(
  input: GenerateInput,
  window: BrowserWindow | null,
): Promise<CharacterLetterRecord> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error(`project_not_found:${input.projectId}`);

  // 选角色
  let characterId = input.characterId;
  if (!characterId) {
    const chars = listNovelCharacters(ctx.db, input.projectId);
    if (chars.length === 0) {
      throw new Error("no_character_to_send_letter");
    }
    // 简单挑：随机一个；后续可改"最久没出场"
    characterId = chars[Math.floor(Math.random() * chars.length)].id;
  }
  const character = getNovelCharacterById(ctx.db, characterId);
  if (!character) throw new Error(`character_not_found:${characterId}`);

  // provider 解析（含 scene_binding 路由）
  const settings = getAppSettings(ctx.db);
  const fallbackProviderId = input.providerId ?? settings.activeProviderId ?? null;
  const resolvedScene = resolveSceneBinding("letter", {
    explicitProviderId: input.providerId ?? null,
  });
  const providerId = resolvedScene.providerId ?? fallbackProviderId;
  if (!providerId) throw new Error("no_active_provider");
  const providerRecord = resolveProviderRecord(providerId);
  if (!providerRecord) throw new Error(`provider_not_found:${providerId}`);
  const pickedKey = await pickProviderKey(providerRecord);
  if (!pickedKey) throw new Error(`no_api_key:${providerId}`);
  const model =
    input.model ?? resolvedScene.model ?? providerRecord.defaultModel;

  // 章节摘要：只用标题（避免读 fs 增加复杂度）
  const chapters = listChapters(ctx.db, input.projectId);
  const recent = chapters.slice(-5);
  const recentChapterTitles = recent.map((c) => c.title);
  const recentChapterExcerpt = recent
    .map((c) => `# ${c.title}（${c.wordCount} 字）`)
    .join("\n");

  const tone = input.tone ?? pickRandomTone();
  const baseUserMessage = buildLetterUser({
    characterName: character.name,
    characterPersona: character.persona ?? "",
    characterBackstory: character.backstory ?? "",
    recentChapterTitles,
    recentChapterExcerpt,
    toneHint: TONE_HINT[tone],
  });
  // letter 自带 character 信息，避免 RAG 重复人物；只查 world + research + samples
  const ragBlock = buildRagBlock(input.projectId, recentChapterExcerpt, {
    characters: false,
  });
  const userMessage = ragBlock ? `${ragBlock}\n${baseUserMessage}` : baseUserMessage;

  let accumulated = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let success = true;
  try {
    const stream = streamText({
      providerRecord,
      apiKey: pickedKey.apiKey,
      model,
      systemPrompt: LETTER_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.85,
      maxTokens: 700,
    });
    for await (const chunk of stream) {
      if (chunk.type === "delta" && chunk.textDelta) {
        accumulated += chunk.textDelta;
      } else if (chunk.type === "done") {
        const u = chunk.usage as
          | { tokensIn?: number; tokensOut?: number }
          | undefined;
        tokensIn = u?.tokensIn ?? tokensIn;
        tokensOut = u?.tokensOut ?? tokensOut;
      } else if (chunk.type === "error") {
        throw new Error(chunk.error ?? "unknown_error");
      }
    }
  } catch (error) {
    success = false;
    logger.warn("letter generate failed", error);
    throw error;
  } finally {
    reportProviderKeyResult(pickedKey.keyId, success);
  }

  const parsed = parseLetterJson(accumulated);

  const record = insertLetter(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    characterId,
    subject: parsed.subject,
    body: parsed.body,
    tone: parsed.tone,
    providerId,
    model,
    tokensIn,
    tokensOut,
  });

  // 派发到达事件
  if (window && !window.isDestroyed()) {
    try {
      window.webContents.send(ipcEventChannels.letterArrived, {
        projectId: input.projectId,
        letter: record,
      });
    } catch {
      /* ignore */
    }
  }
  // 顺便检查成就（first_letter_received / letters_pen_pal）
  try {
    checkAchievementsAndNotify(input.projectId, "letter-generate");
  } catch {
    /* ignore */
  }

  return record;
}

export function listLetters(
  projectId: string,
  options: { includeDismissed?: boolean; characterId?: string; limit?: number } = {},
): CharacterLetterRecord[] {
  const ctx = getAppContext();
  return repoListLetters(ctx.db, {
    projectId,
    includeDismissed: options.includeDismissed,
    characterId: options.characterId,
    limit: options.limit,
  });
}

export function markLetterRead(letterId: string, read: boolean): { letterId: string } {
  const ctx = getAppContext();
  repoMarkLetterRead(ctx.db, letterId, read);
  return { letterId };
}

export function pinLetter(letterId: string, pinned: boolean): { letterId: string } {
  const ctx = getAppContext();
  repoPinLetter(ctx.db, letterId, pinned);
  return { letterId };
}

export function dismissLetter(letterId: string): { letterId: string } {
  const ctx = getAppContext();
  repoDismissLetter(ctx.db, letterId);
  return { letterId };
}

export function deleteLetter(letterId: string): { letterId: string } {
  const ctx = getAppContext();
  repoDeleteLetter(ctx.db, letterId);
  return { letterId };
}
