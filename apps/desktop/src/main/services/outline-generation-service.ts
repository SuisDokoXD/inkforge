import { randomUUID } from "node:crypto";
import {
  deleteOutline,
  getProject,
  getSceneBinding,
  insertOutline,
  listOutlines,
  updateOutline,
  updateProjectMeta,
} from "@inkforge/storage";
import type {
  OutlineCardRecord,
  OutlineGenerateChaptersInput,
  OutlineGenerateChaptersResponse,
  OutlineGenerateMasterInput,
  OutlineGenerateMasterResponse,
  OutlineRefineInput,
  OutlineRefineResponse,
  OutlineUndoRefineInput,
  OutlineUndoRefineResponse,
  ProjectRecord,
  ProjectUpdateMetaInput,
  SceneKeyBasic,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { buildVoiceContext } from "./prompt-context/voice-profile-context";

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface MasterPromptArgs {
  name: string;
  synopsis: string;
  genre: string;
  subGenre: string;
  tags: string[];
  globalWorldview: string;
  voiceBlock: string;
}

function buildMasterOutlinePrompt(args: MasterPromptArgs): { system: string; user: string } {
  const tagLine = args.tags.length ? `标签：${args.tags.join("、")}` : "";
  const sub = args.subGenre ? `子类：${args.subGenre}` : "";
  const tail = [args.genre && `主类：${args.genre}`, sub, tagLine].filter(Boolean).join(" · ");
  return {
    system: [
      "你是一位中文小说总编，擅长把零散想法整理成可执行的长篇故事蓝图。",
      "输出一份总大纲，用纯文本分块，不要 Markdown 代码块，不要解释你的工作过程。",
      "必须包含以下块，每块都要具体，禁止空话：",
      "【核心钩子】一句话说明主角、欲望、阻力和代价，不超过 80 字。",
      "【主题气质】说明作品的情绪底色、散文/叙事比例、读者读完应留下的余味。",
      "【主要人物】3-6 人，每人写：姓名/身份/欲望/秘密或缺口/与主线关系。",
      "【背景与规则】写清地点、时代、社会气息、生活规则或超自然规则；如果用户没有填写背景，默认使用真实世界/当下社会，不要硬编架空世界观。",
      "【三幕推进】开端、发展、转折、低谷、高潮、收束各写 1-2 句，必须有事件因果。",
      "【关键场景】列 5-8 个可落笔场景，每个场景要有地点、人物动作和情绪变化。",
      "【伏笔与回收】列 4-6 条伏笔，每条写埋设位置和回收方式。",
      "【节奏分配】按章数区间给出开端/发展/转折/高潮/尾声的比例。",
      "如果是游记、散文、见闻或抒情作品，要把行踪、景物、心绪、回望纳入主线，不要只写抽象感悟。",
      "如果是现实题材或散文，背景可以是当下社会、几年前的社会、一次真实旅行、一个县城或一段家庭记忆；重点写时代细节、人物关系和现场感。",
      "整体 900-1400 字。每句话尽量含有具体名词、动作或场景，避免“成长、命运、救赎”等空泛词单独出现。",
    ].join("\n"),
    user: [
      `作品名：${args.name}`,
      tail,
      args.voiceBlock ? `\n${args.voiceBlock}\n` : "",
      args.globalWorldview.trim()
        ? `背景与时代语境（可选设定）：\n${args.globalWorldview.trim()}\n`
        : "背景与时代语境：未填写。默认按真实世界处理；若梗概或类型指向当下、近年或某个年代，请使用相应社会生活细节，不要虚构一套世界观。\n",
      "",
      "梗概：",
      args.synopsis || "（用户尚未填写。请基于作品名、类型、标签和背景语境，自行推导一个可执行的中等长度故事框架。）",
    ].filter(Boolean).join("\n"),
  };
}

function buildChapterOutlinesPrompt(
  project: ProjectRecord,
  targetCount: number,
  voiceBlock: string,
): { system: string; user: string } {
  return {
    system: [
      "你是一位中文小说编辑，根据总大纲将故事拆分为可直接写正文的章节大纲卡。",
      `输出严格的 JSON 数组（**不要**加 \`\`\`json 围栏，**不要**输出其他文字），共 ${targetCount} 项，按时间顺序：`,
      `  [{"title":"第1章 · 简短副标题","content":"本章功能：...\\n视角人物：...\\n开场落点：...\\n关键场景：...\\n冲突推进：...\\n情绪层次：...\\n结尾钩子：...\\n散文小节：## ... / ## ..."}, ...]`,
      "title 必须使用「第N章 · 副标题」，N 从 1 递增，不要写“第一章”混排。",
      "content 必须是 7-8 行结构化文本，每行用上面标签开头；每张卡 220-380 字。",
      "每张卡都要写清：谁在什么地点做什么、为什么做、遇到什么阻力、章末留下什么变化。",
      "关键场景必须可拍成画面；不要写“主角进一步成长”“矛盾加深”这种空句，除非后面接具体事件。",
      "如果作品偏散文/游记：每张卡都要给 2-4 个可用的 `## 小标题`，体现行踪、景物、心绪或回望。",
      "如果没有单独填写世界观，默认真实世界；现实散文可以用当下社会、几年前的社会、地方风物、人情关系作为背景推进。",
      "章节之间要有因果链：上一章的结尾钩子必须推动下一章的开场落点。",
      "禁止输出 JSON 以外的任何内容。",
    ].join("\n"),
    user: [
      `作品：${project.name}`,
      project.genre ? `类型：${project.genre}${project.subGenre ? " / " + project.subGenre : ""}` : "",
      project.tags.length ? `标签：${project.tags.join("、")}` : "",
      voiceBlock ? `\n${voiceBlock}\n` : "",
      project.synopsis.trim() ? `梗概：\n${project.synopsis.trim()}\n` : "",
      project.globalWorldview.trim()
        ? `背景与时代语境（可选设定）：\n${project.globalWorldview.trim()}\n`
        : "背景与时代语境：未填写。默认真实世界/当下社会；如果作品明显是回忆、纪实、游记或散文，请按具体年代、地点和社会氛围处理。\n",
      "",
      "总大纲：",
      project.masterOutline.trim() || "（无）",
      "",
      `请输出 ${targetCount} 章的大纲卡 JSON 数组。`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function buildRefineMasterPrompt(
  project: ProjectRecord,
  intent: string,
  voiceBlock: string,
): { system: string; user: string } {
  return {
    system: [
      "你是一位中文小说总编，根据用户的修改意图调整总大纲。",
      "保持原大纲的整体结构（核心钩子 / 主题气质 / 人物 / 世界规则 / 三幕推进 / 关键场景 / 伏笔 / 节奏），只在用户指出的方向上修改。",
      "修改后仍要具体可执行，保留地点、动作、阻力、伏笔回收；不要变成抽象总结。",
      "输出仅大纲文本本身，不要附加解释。",
    ].join("\n"),
    user: [
      `作品：${project.name}`,
      voiceBlock ? `\n${voiceBlock}\n` : "",
      "",
      "原总大纲：",
      project.masterOutline.trim() || "（空）",
      "",
      `修改意图：${intent.trim()}`,
      "",
      "请输出修改后的总大纲：",
    ].join("\n"),
  };
}

function buildRefineCardPrompt(
  card: OutlineCardRecord,
  intent: string,
  voiceBlock: string,
): { system: string; user: string } {
  return {
    system: [
      "你是一位中文小说编辑，根据用户的修改意图优化某一章的大纲卡。",
      "保持原章的位置与角色，仅按用户意图调整内容。",
      "输出仅大纲卡正文本身（不带 title），必须保留结构化行：本章功能 / 视角人物 / 开场落点 / 关键场景 / 冲突推进 / 情绪层次 / 结尾钩子 / 散文小节。",
      "每行都要具体可落笔，不要附加解释。",
    ].join("\n"),
    user: [
      `章节标题：${card.title}`,
      voiceBlock ? `\n${voiceBlock}\n` : "",
      "",
      "原章纲：",
      card.content.trim() || "（空）",
      "",
      `修改意图：${intent.trim()}`,
      "",
      "请输出修改后的章纲：",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function streamCollect(args: {
  providerRecord: ReturnType<typeof resolveProviderRecord>;
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; durationMs: number }> {
  if (!args.providerRecord) throw new Error("provider_not_configured");
  const start = Date.now();
  const stream = streamText({
    providerRecord: args.providerRecord,
    apiKey: args.apiKey,
    model: args.model ?? args.providerRecord.defaultModel,
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    temperature: args.temperature ?? 0.7,
    maxTokens: args.maxTokens ?? 1500,
  });
  let acc = "";
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) acc += chunk.textDelta;
    if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
  }
  return { text: acc.trim(), durationMs: Date.now() - start };
}

async function resolveProviderForScene(
  basicKey: SceneKeyBasic,
  explicit: { providerId?: string; model?: string },
): Promise<{
  providerRecord: NonNullable<ReturnType<typeof resolveProviderRecord>>;
  apiKey: string;
  model: string | undefined;
}> {
  // outline_generation/main_generation are basic keys even when the app is in
  // advanced routing mode. Always honor the basic binding before falling back.
  const ctx = getAppContext();
  let providerId = explicit.providerId;
  let model = explicit.model;
  if (!providerId) {
    const binding = getSceneBinding(ctx.db, "basic", basicKey);
    if (binding?.providerId) {
      providerId = binding.providerId;
      model = model ?? binding.model ?? undefined;
    }
  }
  const providerRecord = resolveProviderRecord(providerId);
  if (!providerRecord) throw new Error("provider_not_configured");
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) throw new Error("api_key_missing");
  return {
    providerRecord,
    apiKey,
    model: model ?? undefined,
  };
}

function parseOutlineCardsJson(raw: string): Array<{ title: string; content: string }> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  // Try to find a JSON array start if the model leaked a sentence before it.
  let candidate = cleaned;
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) candidate = cleaned.slice(start, end + 1);
  let arr: unknown;
  try {
    arr = JSON.parse(candidate);
  } catch {
    throw new Error("LLM output not valid JSON for chapter outlines");
  }
  if (!Array.isArray(arr)) throw new Error("LLM output not an array");
  return arr
    .map((item) => {
      const obj = item as Record<string, unknown>;
      const title = typeof obj.title === "string" ? obj.title.trim() : "";
      const content = typeof obj.content === "string" ? obj.content.trim() : "";
      return { title, content };
    })
    .filter((c) => c.title || c.content);
}

const REQUIRED_CARD_LABELS = [
  "本章功能",
  "视角人物",
  "开场落点",
  "关键场景",
  "冲突推进",
  "情绪层次",
  "结尾钩子",
];

function assertOutlineCardsUseful(cards: Array<{ title: string; content: string }>): void {
  const weak = cards.filter((card) => {
    const compactLength = Array.from(card.content).filter((ch) => /\S/.test(ch)).length;
    const labelHits = REQUIRED_CARD_LABELS.filter((label) => card.content.includes(label)).length;
    return compactLength < 120 || labelHits < 5;
  });
  if (weak.length > Math.max(1, Math.floor(cards.length * 0.25))) {
    throw new Error(
      "outline_cards_too_thin: 模型返回的大纲卡过薄，未达到可写正文的结构要求。请补充梗概、类型、背景语境后重新生成，或换用更强的 outline_generation 模型。",
    );
  }
}

function normalizeChapterCardTitle(rawTitle: string, index: number): string {
  const chapterNo = index + 1;
  const trimmed = rawTitle.trim();
  const withoutPrefix = trimmed
    .replace(
      /^第\s*[\d一二三四五六七八九十百千万两〇零]+\s*[章节回卷篇]\s*[·•.\-—:：、]?\s*/u,
      "",
    )
    .trim();
  const subtitle = (withoutPrefix || trimmed || `第${chapterNo}章`).slice(0, 80);
  if (/^第\s*[\d一二三四五六七八九十百千万两〇零]+\s*[章节回卷篇]\s*$/u.test(subtitle)) {
    return `第${chapterNo}章`;
  }
  return `第${chapterNo}章 · ${subtitle}`;
}

// ---------------------------------------------------------------------------
// Service exports
// ---------------------------------------------------------------------------

export function updateProjectCreativeMeta(input: ProjectUpdateMetaInput): ProjectRecord {
  const ctx = getAppContext();
  return updateProjectMeta(ctx.db, {
    id: input.projectId,
    synopsis: input.synopsis,
    genre: input.genre,
    subGenre: input.subGenre,
    tags: input.tags,
    globalWorldview: input.globalWorldview,
  });
}

export async function generateMasterOutline(
  input: OutlineGenerateMasterInput,
): Promise<OutlineGenerateMasterResponse> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");

  const synopsis = input.synopsis ?? project.synopsis;
  const genre = input.genre ?? project.genre;
  const subGenre = input.subGenre ?? project.subGenre;
  const tags = input.tags ?? project.tags;
  const globalWorldview = input.globalWorldview ?? project.globalWorldview;
  const voiceBlock = buildVoiceContext({
    db: ctx.db,
    projectId: project.id,
  }).before;

  if (!synopsis.trim() && !genre.trim() && tags.length === 0 && !globalWorldview.trim()) {
    throw new Error("metadata_empty: please fill synopsis, genre, tags, or background first");
  }

  const { providerRecord, apiKey, model } = await resolveProviderForScene("outline_generation", {
    providerId: input.providerId,
    model: input.model,
  });

  const { system, user } = buildMasterOutlinePrompt({
    name: project.name,
    synopsis,
    genre,
    subGenre,
    tags,
    globalWorldview,
    voiceBlock,
  });

  const { text, durationMs } = await streamCollect({
    providerRecord,
    apiKey,
    model,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.7,
    maxTokens: 1500,
  });

  // Persist (also write back the metadata if user changed via input)
  updateProjectMeta(ctx.db, {
    id: project.id,
    synopsis,
    genre,
    subGenre,
    tags,
    globalWorldview,
    masterOutline: text,
    // Reset undo snapshot on fresh generate
    preRefineMasterOutline: null,
  });

  return { projectId: project.id, masterOutline: text, durationMs };
}

export async function generateChapterOutlines(
  input: OutlineGenerateChaptersInput,
): Promise<OutlineGenerateChaptersResponse> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");
  if (!project.masterOutline.trim()) {
    throw new Error("master_outline_empty: generate master outline first");
  }

  const targetCount = Math.max(3, Math.min(50, input.targetCount ?? 12));

  const { providerRecord, apiKey, model } = await resolveProviderForScene("outline_generation", {
    providerId: input.providerId,
    model: input.model,
  });
  const voiceBlock = buildVoiceContext({
    db: ctx.db,
    projectId: project.id,
  }).before;
  const { system, user } = buildChapterOutlinesPrompt(project, targetCount, voiceBlock);

  const { text, durationMs } = await streamCollect({
    providerRecord,
    apiKey,
    model,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.7,
    maxTokens: 4000,
  });

  const cards = parseOutlineCardsJson(text);
  if (cards.length === 0) throw new Error("LLM returned zero outline cards");
  assertOutlineCardsUseful(cards);
  const normalizedCards = cards.map((card, index) => ({
    ...card,
    title: normalizeChapterCardTitle(card.title, index),
  }));

  // Re-splitting should refresh the plan without creating duplicate pending
  // cards for chapters that were already written from older outline cards.
  let reusableLinked: OutlineCardRecord[] = [];
  if (input.replaceExisting) {
    const existing = listOutlines(ctx.db, project.id);
    reusableLinked = existing
      .filter((c) => c.chapterId !== null)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    for (const c of existing.filter((c) => c.chapterId === null)) deleteOutline(ctx.db, c.id);
  }

  const existingProjectCards = listOutlines(ctx.db, project.id).filter((c) => c.chapterId === null);
  let nextInsertOrder = input.replaceExisting ? reusableLinked.length : existingProjectCards.length;
  const created: OutlineCardRecord[] = [];
  for (let i = 0; i < normalizedCards.length; i += 1) {
    const c = normalizedCards[i];
    const reusable = input.replaceExisting ? reusableLinked[i] : undefined;
    const record = reusable
      ? updateOutline(ctx.db, {
          id: reusable.id,
          title: c.title,
          content: c.content,
          status: "written",
          order: i,
        })
      : insertOutline(ctx.db, {
          id: randomUUID(),
          projectId: project.id,
          chapterId: null,
          title: c.title || `第${nextInsertOrder + 1}章`,
          content: c.content,
          status: "planned",
          order: input.replaceExisting ? i : nextInsertOrder,
        });
    created.push(record);
    if (!reusable) nextInsertOrder += 1;
  }

  return {
    projectId: project.id,
    cardIds: created.map((c) => c.id),
    durationMs,
  };
}

export async function refineOutline(
  input: OutlineRefineInput,
): Promise<OutlineRefineResponse> {
  const ctx = getAppContext();
  const intent = input.intent.trim().slice(0, 500);
  if (!intent) throw new Error("intent_empty");

  const { providerRecord, apiKey, model } = await resolveProviderForScene("outline_generation", {
    providerId: input.providerId,
    model: input.model,
  });

  if (input.target.kind === "master") {
    const project = getProject(ctx.db, input.target.projectId);
    if (!project) throw new Error("project_not_found");
    if (!project.masterOutline.trim()) throw new Error("master_outline_empty");

    const voiceBlock = buildVoiceContext({
      db: ctx.db,
      projectId: project.id,
    }).before;
    const { system, user } = buildRefineMasterPrompt(project, intent, voiceBlock);
    const { text, durationMs } = await streamCollect({
      providerRecord,
      apiKey,
      model,
      systemPrompt: system,
      userMessage: user,
      temperature: 0.7,
      maxTokens: 1500,
    });

    // Save snapshot for undo BEFORE writing new outline
    updateProjectMeta(ctx.db, {
      id: project.id,
      preRefineMasterOutline: project.masterOutline,
      masterOutline: text,
    });
    return { text, hasUndo: true, durationMs };
  }

  // card
  const row = ctx.db
    .prepare(
      `SELECT id, project_id, chapter_id, title, content, status, "order", created_at, updated_at
       FROM outline_cards WHERE id = ?`,
    )
    .get(input.target.cardId) as
    | {
        id: string;
        project_id: string;
        chapter_id: string | null;
        title: string;
        content: string;
        status: string;
        order: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) throw new Error("card_not_found");
  const card: OutlineCardRecord = {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    title: row.title,
    content: row.content,
    status: row.status,
    order: row.order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const voiceBlock = buildVoiceContext({
    db: ctx.db,
    projectId: card.projectId,
  }).before;
  const { system, user } = buildRefineCardPrompt(card, intent, voiceBlock);
  const { text, durationMs } = await streamCollect({
    providerRecord,
    apiKey,
    model,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.7,
    maxTokens: 1200,
  });

  updateOutline(ctx.db, { id: card.id, content: text });
  // Card-level undo handled by frontend (save previous content client-side); simpler.
  return { text, hasUndo: false, durationMs };
}

export function undoRefineMaster(input: OutlineUndoRefineInput): OutlineUndoRefineResponse {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");
  if (!project.preRefineMasterOutline) {
    return { projectId: project.id, masterOutline: project.masterOutline, restored: false };
  }
  const restored = project.preRefineMasterOutline;
  updateProjectMeta(ctx.db, {
    id: project.id,
    masterOutline: restored,
    preRefineMasterOutline: null,
  });
  return { projectId: project.id, masterOutline: restored, restored: true };
}
