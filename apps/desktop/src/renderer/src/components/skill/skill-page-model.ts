import type {
  SkillDefinition,
  SkillOutputTarget,
  SkillScope,
  SkillTriggerDef,
  SkillTriggerType,
  SkillVariableDef,
} from "@inkforge/shared";

export const SCOPE_LABELS: Record<SkillScope, string> = {
  global: "全局",
  project: "项目",
  community: "社区",
};

export const OUTPUT_LABELS: Record<SkillOutputTarget, string> = {
  "ai-feedback": "只显示建议",
  "replace-selection": "改写并替换选区",
  "insert-after-selection": "插入到选区后",
  "append-chapter": "追加到章末",
};

export const OUTPUT_DESCRIPTIONS: Record<SkillOutputTarget, string> = {
  "ai-feedback": "结果进入右侧时间线，不直接改正文。适合审校、提醒、分析。",
  "replace-selection": "把选中的文字换成模型生成结果。适合润色、改写、翻译。",
  "insert-after-selection": "保留原文，把模型生成结果插在选区后面。适合扩写、补充说明。",
  "append-chapter": "把结果加到当前章节末尾。适合续写、章末总结。",
};

export const OUTPUT_EFFECTS: Record<SkillOutputTarget, string> = {
  "ai-feedback": "不改正文",
  "replace-selection": "会覆盖选区",
  "insert-after-selection": "保留原文并插入",
  "append-chapter": "加到当前章末",
};

export const TRIGGER_LABELS: Record<SkillTriggerType, string> = {
  selection: "选中文本",
  "every-n-chars": "每 N 字自动",
  "on-save": "章节保存",
  "on-chapter-end": "章节末尾",
  manual: "手动触发",
};

export const ALL_TRIGGERS: SkillTriggerType[] = [
  "selection",
  "every-n-chars",
  "on-save",
  "on-chapter-end",
  "manual",
];

export const TRIGGER_DESCRIPTIONS: Record<SkillTriggerType, string> = {
  selection: "选中一段文字后，在悬浮工具条里点这个指令。适合润色、改写、局部审校。",
  "every-n-chars": "写到一定字数后自动提醒。适合轻量检查，不建议用来长篇生成。",
  "on-save": "保存章节时自动运行。适合错别字、风格、伏笔提示。",
  "on-chapter-end": "光标在章节末尾时运行。适合续写建议、章末总结。",
  manual: "在编辑器工具栏手动运行。最稳妥，适合多数写作指令。",
};

const TRIGGER_USAGE: Record<SkillTriggerType, string> = {
  selection: "选中文本后可用",
  "every-n-chars": "写作中自动提醒",
  "on-save": "保存章节时自动检查",
  "on-chapter-end": "光标在章末时可用",
  manual: "编辑器工具栏手动运行",
};

export const PROMPT_TEMPLATES = [
  {
    name: "温柔润色",
    prompt: "请温柔润色以下选中文本，保留原意、语气和主要信息，只输出润色后的正文：\n\n{{selection}}",
  },
  {
    name: "散文细化",
    prompt:
      "请把以下文字改写得更像细腻的中文散文：保留原意，增加景物、感官和心绪层次；避免空泛形容词，只输出改写结果。\n\n{{selection}}",
  },
  {
    name: "续写一段",
    prompt:
      "请接着当前章节往下写一小段，保持人物口吻、叙事节奏和世界观一致，不要总结，不要解释。\n\n章节标题：{{chapter.title}}\n\n前文：\n{{context_before_1200}}",
  },
  {
    name: "审校建议",
    prompt:
      "请审校以下选中文本，指出最影响阅读的 3 个问题，并给出可直接修改的建议。不要重写全文。\n\n{{selection}}",
  },
];

export const CORE_PLACEHOLDERS = [
  { label: "选中文本", token: "{{selection}}", help: "用户当前框选的文字" },
  { label: "章节标题", token: "{{chapter.title}}", help: "当前章节名" },
  { label: "全文", token: "{{chapter.text}}", help: "当前章节全部正文" },
  { label: "前文 1200 字", token: "{{context_before_1200}}", help: "光标前的上下文" },
  { label: "角色名", token: "{{character.name}}", help: "当前关联角色" },
];

export const ADVANCED_MACROS = [
  { label: "随机词", token: "{{random:雨,雪,风}}" },
  { label: "掷骰结果", token: "{{roll:1d6}}" },
  { label: "今天日期", token: "{{date}}" },
  { label: "当前时间", token: "{{time}}" },
  { label: "日期和时间", token: "{{datetime}}" },
  { label: "换行", token: "{{newline}}" },
];

export interface EditorState {
  id: string | null;
  name: string;
  prompt: string;
  scope: SkillScope;
  output: SkillOutputTarget;
  enabled: boolean;
  triggers: SkillTriggerDef[];
  variables: SkillVariableDef[];
  temperature: string;
  maxTokens: string;
}

export function emptyEditorState(): EditorState {
  return {
    id: null,
    name: "新建指令",
    prompt: "",
    scope: "global",
    output: "ai-feedback",
    enabled: true,
    triggers: [
      { type: "manual", enabled: true },
    ],
    variables: [],
    temperature: "0.8",
    maxTokens: "400",
  };
}

export function skillToEditor(skill: SkillDefinition): EditorState {
  return {
    id: skill.id,
    name: skill.name,
    prompt: skill.prompt,
    scope: skill.scope,
    output: skill.output,
    enabled: skill.enabled,
    triggers: skill.triggers,
    variables: skill.variables ?? [],
    temperature: skill.binding.temperature?.toString() ?? "",
    maxTokens: skill.binding.maxTokens?.toString() ?? "",
  };
}

export function upsertTrigger(
  list: SkillTriggerDef[],
  type: SkillTriggerType,
  patch: Partial<SkillTriggerDef>,
): SkillTriggerDef[] {
  const idx = list.findIndex((t) => t.type === type);
  if (idx === -1) {
    return [...list, { type, enabled: true, ...patch }];
  }
  const next = [...list];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

export function removeTrigger(list: SkillTriggerDef[], type: SkillTriggerType): SkillTriggerDef[] {
  return list.filter((t) => t.type !== type);
}

export function describeTriggers(triggers: SkillTriggerDef[]): string {
  const enabled = triggers.filter((t) => t.enabled !== false);
  if (enabled.length === 0) return "尚未设置使用入口";
  return enabled.map((t) => describeTrigger(t)).join("、");
}

function describeTrigger(trigger: SkillTriggerDef): string {
  if (trigger.type === "every-n-chars") {
    return `每 ${trigger.everyNChars ?? 200} 字自动提醒`;
  }
  return TRIGGER_USAGE[trigger.type];
}
