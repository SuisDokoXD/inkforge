// =============================================================================
// Skill 模板渲染引擎
// =============================================================================
// 把 Skill 的 prompt 字符串里 {{...}} 占位符替换为运行时值。
// 受 SillyTavern macros 启发，覆盖三类宏：
//   1. 上下文宏（既有）：
//        {{selection}} {{chapter.title}} {{chapter.text}}
//        {{character.name}} {{character.persona}}
//        {{context_before_N}} {{vars.<key>}}
//   2. 工具宏（本次新增）：
//        {{random:a,b,c}} {{roll:NdM}}
//        {{time}} {{date}} {{datetime}}
//        {{newline}} {{//任意注释}} {{pipe}}
//   3. 世界观 / 卡牌宏（未来 Phase 2/3）：
//        {{world.search:q}} {{world.entry:title}} {{card.active}} 等
//        ——由 skill-service 在调用本模块前预处理替换；本模块保持纯函数、无 I/O。
//
// 渲染策略：
//   - emptyOnMissing=true（默认）：未知占位符替换为空字符串
//   - strict=true：未知占位符抛 SkillRuntimeError（用于 UI 校验时定位笔误）
// =============================================================================

import { SkillRuntimeError } from "./errors";

// Token 解析结果。raw 保留原始 {{...}} 文本以便后续整段替换；
// key 是归一化标识；arg 为数字参数（context_before_N 专用）；
// argStr 为字符串参数（random/roll/comment 等冒号或 // 后的内容）。
export interface SkillTemplateToken {
  raw: string;
  key: string;
  arg?: number;
  argStr?: string;
  start: number;
  end: number;
}

// 渲染上下文。
// pipe/now/rng 三个新字段都可选：
//   - pipe：Skill 链式调用时上一节点的输出，供 {{pipe}} 使用
//   - now：可注入时钟，方便单测固化时间宏输出
//   - rng：可注入随机源，方便单测固化 random/roll 输出
export interface SkillTemplateContext {
  selection?: string;
  chapter: {
    title: string;
    text: string;
  };
  character?: {
    name?: string;
    persona?: string;
  };
  vars?: Record<string, string>;
  pipe?: string;
  now?: Date;
  rng?: () => number;
}

export interface SkillTemplateRenderOptions {
  strict?: boolean;
  emptyOnMissing?: boolean;
}

export interface SkillTemplateRenderResult {
  text: string;
  used: string[];
  missing: string[];
}

// 双花括号占位符匹配器。
// 用懒匹配避免 `{{a}}xxx{{b}}` 这类极端写法把中间内容吞掉；
// inner 不允许包含 `}`，符合一般宏的扁平语义。
const TOKEN_REGEX = /{{\s*([^}]+?)\s*}}/g;

// context_before_N 的 N 上限——避免一个占位符吃掉整章塞进 prompt 撑爆 LLM 上下文。
function clampContextSize(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const size = Math.floor(value);
  if (size < 1) return 0;
  if (size > 5000) return 5000;
  return size;
}

// 把 {{...}} 内部字符串拆成 key + 参数。
// 识别优先级：注释宏 → context_before_N 兼容老语法 → 冒号分隔参数 → 裸 key。
// 注释宏单独前置是因为 `//comment text` 里可能含冒号，要避免落到 colon 分支。
function parseInnerToken(inner: string): {
  key: string;
  arg?: number;
  argStr?: string;
} {
  if (inner.startsWith("//")) {
    return { key: "//", argStr: inner.slice(2) };
  }
  const ctxMatch = /^context_before_(\d+)$/i.exec(inner);
  if (ctxMatch) {
    return {
      key: "context_before_N",
      arg: clampContextSize(Number.parseInt(ctxMatch[1] ?? "0", 10)),
    };
  }
  const colonIdx = inner.indexOf(":");
  if (colonIdx > 0) {
    return {
      key: inner.slice(0, colonIdx).trim(),
      argStr: inner.slice(colonIdx + 1),
    };
  }
  return { key: inner };
}

// 扫整段 prompt 抓所有 {{...}} 成结构化 token 列表。
// 调用方拿到 token 列表后既能做替换，也能给 UI 提供自动补全 / 校验定位。
export function parseSkillTemplate(template: string): SkillTemplateToken[] {
  const text = String(template ?? "");
  const tokens: SkillTemplateToken[] = [];
  // 重置 lastIndex 以防外部异常中断导致 regex 状态残留
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const inner = (match[1] ?? "").trim();
    const parsed = parseInnerToken(inner);
    tokens.push({
      raw,
      key: parsed.key,
      arg: parsed.arg,
      argStr: parsed.argStr,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tokens;
}

// random:a,b,c —— 用提供的 RNG 从候选里挑一个；空候选返回空串。
// 候选用逗号切分并 trim，允许 "a, b, c" 这种带空格的写法。
function pickRandom(argStr: string, rng: () => number): string {
  const choices = argStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (choices.length === 0) return "";
  const idx = Math.floor(rng() * choices.length);
  // Math.floor + 浮点边界保险：极端 rng 返回 1.0 时回退到末位
  return choices[Math.min(idx, choices.length - 1)] ?? "";
}

// roll 解析骰子：dN 或 NdM；
// 硬上限：10 颗骰 × 1000 面，防止用户写 {{roll:1000d1000}} 把 prompt 撑成天书。
// 多骰返回点数和（最常见用法），非法表达式返回空串。
function rollDice(spec: string, rng: () => number): string {
  const match = /^\s*(\d*)d(\d+)\s*$/i.exec(spec);
  if (!match) return "";
  const count = Math.max(
    1,
    Math.min(Number.parseInt(match[1] || "1", 10) || 1, 10),
  );
  const sides = Math.min(Number.parseInt(match[2] ?? "0", 10) || 0, 1000);
  if (sides < 1) return "";
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(rng() * sides) + 1;
  }
  return String(total);
}

// 时间宏统一两位补零，避免不同地区显示差异导致 prompt 不可复现。
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// 把单个 token 翻成字符串值。
// 返回 undefined 表示"未知 key"，由上层统一走 missing 流程（决定是否抛 strict 错）。
function resolveTokenValue(
  token: SkillTemplateToken,
  ctx: SkillTemplateContext,
): string | undefined {
  // —— 既有上下文宏：保持完全兼容 ——
  if (token.key === "selection") return ctx.selection ?? "";
  if (token.key === "chapter.title") return ctx.chapter.title ?? "";
  if (token.key === "chapter.text") return ctx.chapter.text ?? "";
  if (token.key === "character.name") return ctx.character?.name ?? "";
  if (token.key === "character.persona") return ctx.character?.persona ?? "";
  if (token.key === "context_before_N") {
    const n = clampContextSize(token.arg ?? 0);
    if (n <= 0) return "";
    const chapterText = ctx.chapter.text ?? "";
    if (!chapterText) return "";
    return chapterText.slice(Math.max(0, chapterText.length - n));
  }
  if (token.key.startsWith("vars.")) {
    const key = token.key.slice(5);
    return key ? ctx.vars?.[key] ?? "" : "";
  }

  // —— 本次新增宏（SillyTavern 启发）——
  // 注释宏：永远擦除，用户可在 prompt 里写说明 / 临时禁用片段
  if (token.key === "//") return "";
  // 换行符宏：在 JSON 编辑器里手敲转义符容易出错，这个宏给一个明确换行入口
  if (token.key === "newline") return "\n";
  // 链式预留：上一步 Skill 的输出，配合 Phase 2 之后的 Skill pipeline
  if (token.key === "pipe") return ctx.pipe ?? "";
  // 候选随机：方便制造"随机情绪 / 随机天气 / 随机事件"等可控不确定性
  if (token.key === "random") {
    return pickRandom(token.argStr ?? "", ctx.rng ?? Math.random);
  }
  // 骰子：剧情判定、随机数值生成
  if (token.key === "roll") {
    return rollDice(token.argStr ?? "", ctx.rng ?? Math.random);
  }
  // 时间锚点：让 prompt 能明确"今天日期"，避免 LLM 自行编造
  const now = ctx.now ?? new Date();
  if (token.key === "time") return formatTime(now);
  if (token.key === "date") return formatDate(now);
  if (token.key === "datetime") return `${formatDate(now)} ${formatTime(now)}`;

  // 未识别：交给 missing 流程
  return undefined;
}

// 把 prompt 里的所有 {{...}} 一次性替换为运行时值。
// 实现细节：
//   - 用 split-join 而不是 String.replace 替换，避免值里出现的 `$1` `$&` 触发 regex 替换语义
//   - 对同一个 raw token 多处出现的情况，第一次 split-join 已经把所有 occurrence 处理完
//     后续循环里 split-join 找不到再分裂目标即等于 no-op，最终 used/missing 统计仍按出现次数正确累计
export function renderSkillTemplate(
  template: string,
  ctx: SkillTemplateContext,
  options: SkillTemplateRenderOptions = {},
): SkillTemplateRenderResult {
  const text = String(template ?? "");
  const tokens = parseSkillTemplate(text);
  const used: string[] = [];
  const missing: string[] = [];
  const emptyOnMissing = options.emptyOnMissing ?? true;

  let result = text;
  for (const token of tokens) {
    const value = resolveTokenValue(token, ctx);
    if (value === undefined) {
      missing.push(token.raw);
      if (emptyOnMissing) {
        result = result.split(token.raw).join("");
      }
      continue;
    }
    used.push(token.raw);
    result = result.split(token.raw).join(value);
  }

  if (options.strict && missing.length > 0) {
    throw new SkillRuntimeError(
      "template_missing_variable",
      `Missing template variables: ${missing.join(", ")}`,
    );
  }

  return {
    text: result,
    used,
    missing,
  };
}
