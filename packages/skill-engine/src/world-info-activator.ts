// =============================================================================
// World Info 自动注入引擎（v26：CCv3/SillyTavern 对齐升级版）
// =============================================================================
// 思路：调用方给一段"扫描文本"（用户选段 + 章节末若干字 + 现行 prompt）和
// 一组候选 WorldEntryRecord（项目自有 entries + 已插槽卡牌的 entries），
// activator 根据：
//   1) constant 标志位（必读设定，跳过命中检查）
//   2) 关键词命中（title ∪ aliases ∪ keys）
//   3) secondaryKeys + selectiveLogic 多关键词组合判定
//   4) caseSensitive 控制大小写敏感
//   5) probability 概率掷骰
//   6) tokenBudget 预算分配
// 挑出最该注入的若干条，按 position 分组拼成 before / after / at_depth 文本块。
//
// v26 起每条候选 entry 都产出一条 WorldInfoEntryTrace，存到 world_info_traces
// 表后给 UI 诊断面板可视化"为什么这条没生效"。
//
// 设计要点：
//   - 纯函数，无 I/O，无 DB 调用 —— 便于单测和未来在卡牌融合预览里复用
//   - 中文 includes 子串匹配，不做 word boundary（中文无词边界概念）
//   - 预算用"字符数 × 经验比"近似 token，避免引入 tokenizer 重依赖
//   - position=at_depth 暂作为 "after" 同义降级，等 chat-history 注入实装再分离
// =============================================================================

import type {
  WorldEntryPosition,
  WorldEntryRecord,
  WorldEntrySelectiveLogic,
  WorldInfoEntryTrace,
} from "@inkforge/shared";

export interface WorldInfoActivationInput {
  // 用于关键词扫描的文本。建议拼 [选段, 章节末300字, 渲染后的 prompt]。
  scanText: string;
  // 候选条目池（项目自有 + 卡牌注入；本模块不关心来源）。
  entries: WorldEntryRecord[];
  options?: WorldInfoActivationOptions;
}

export interface WorldInfoActivationOptions {
  // token 预算上限（粗略），超额按 updatedAt 降序保留最新条目，旧条目丢弃。
  tokenBudget?: number;
  // 中文字符 / token 经验比，调用方有更准估算可覆盖。
  approxCharsPerToken?: number;
  // 可注入的随机源，便于测试固化 probability 行为。
  rng?: () => number;
  // 调用方可传 entryId → packId 的映射表，让 trace 标注出条目来自哪张卡。
  // 项目自有 entries 不需要传；卡牌 entries 传了便于 UI 诊断面板分组显示。
  entryPackIdMap?: Record<string, string | null>;
}

export interface WorldInfoActivationResult {
  // 被实际注入的 entry id 列表（按拼接顺序），便于上层落 telemetry。
  activatedIds: string[];
  // 三个分组的拼接文本块。空块返回空字符串。
  before: string;
  after: string;
  atDepth: string;
  // 命中但因预算被裁掉的 entry id 列表（保留，便于上层老代码逐步迁移到 traces）。
  droppedIds: string[];
  // v26 · 完整诊断数据：每条候选 entry 一条 trace。
  traces: WorldInfoEntryTrace[];
  // v26 · 预算占用统计（字符数）；UI 面板可视化"已用 / 预算"。
  charsUsed: number;
  charBudget: number;
}

const DEFAULT_TOKEN_BUDGET = 1500;
const DEFAULT_CHARS_PER_TOKEN = 2;

// 合并 title + aliases + keys 成最终的主关键词集合（去重 + 过滤空串）。
// 顺序保留稳定：title 优先，便于"匹配最具体名"调试。
function collectPrimaryKeys(entry: WorldEntryRecord): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (k: string) => {
    const trimmed = k.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };
  if (entry.title) push(entry.title);
  for (const a of entry.aliases ?? []) push(a);
  for (const k of entry.keys ?? []) push(k);
  return out;
}

// 单条 entry 的格式化输出。
// 紧凑一行：- 标题（类目）：内容
// 选这种格式是因为 LLM 对短列表的吸收比对长段落好，且与现有 RAG block 风格一致。
function formatEntry(entry: WorldEntryRecord): string {
  const cat = entry.category ? `（${entry.category}）` : "";
  return `- ${entry.title}${cat}：${entry.content}`.trim();
}

// 给一组同位置 block 加节标题。空数组返回空串，避免 LLM 看到孤儿标题。
function wrapBlock(blocks: string[], header: string): string {
  if (blocks.length === 0) return "";
  return `${header}\n${blocks.join("\n")}`;
}

// 大小写感知的子串命中判定。
// caseSensitive=false 时双方都 lower-case 后再比；中文不受影响。
function isHit(scanText: string, key: string, caseSensitive: boolean): boolean {
  if (!scanText || !key) return false;
  if (caseSensitive) return scanText.includes(key);
  return scanText.toLowerCase().includes(key.toLowerCase());
}

// 算出哪些 key 命中了 scanText（用于 trace.matchedKeys 数组）。
function hitsOf(scanText: string, keys: string[], caseSensitive: boolean): string[] {
  return keys.filter((k) => isHit(scanText, k, caseSensitive));
}

// SillyTavern 风格的多关键词组合判定。
// 主 keys 至少命中一个，然后看 secondaryKeys 与 selectiveLogic 决定是否通过。
// 当 secondaryKeys 为空时，直接退化为"只看主 keys"（不应用 selective 规则）。
function applySelectiveLogic(
  primaryHits: number,
  secondaryHits: number,
  secondaryTotal: number,
  logic: WorldEntrySelectiveLogic,
): boolean {
  if (primaryHits <= 0) return false;
  if (secondaryTotal <= 0) return true;
  switch (logic) {
    case "and_any":
      return secondaryHits > 0;
    case "and_all":
      return secondaryHits === secondaryTotal;
    case "not_any":
      return secondaryHits === 0;
    case "not_all":
      return secondaryHits < secondaryTotal;
    default:
      return secondaryHits > 0; // 兜底退化为 and_any 行为
  }
}

// 核心入口：扫描 → constant 强通过 / 选择逻辑 → 概率筛 → 预算分配 → 按 position 分组拼接。
export function activateWorldInfo(
  input: WorldInfoActivationInput,
): WorldInfoActivationResult {
  const scanText = input.scanText ?? "";
  const rng = input.options?.rng ?? Math.random;
  const tokenBudget = input.options?.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const charsPerToken =
    input.options?.approxCharsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  const charBudget = Math.max(0, tokenBudget * charsPerToken);
  const packIdMap = input.options?.entryPackIdMap ?? {};

  // 1. 关键词命中 + selective 判定，产出"逻辑通过的候选 + 全量 trace 半成品"
  type Candidate = {
    entry: WorldEntryRecord;
    primaryHitKeys: string[];
    secondaryHitKeys: string[];
    logicPassed: boolean;
    constant: boolean;
  };
  const candidates: Candidate[] = [];
  for (const entry of input.entries ?? []) {
    const constant = !!entry.constant;
    const primaryKeys = collectPrimaryKeys(entry);
    const secondaryKeys = entry.secondaryKeys ?? [];
    const caseSensitive = !!entry.caseSensitive;

    if (constant) {
      // 永远通过逻辑判定；下游仍需过概率与预算
      candidates.push({
        entry,
        primaryHitKeys: [],
        secondaryHitKeys: [],
        logicPassed: true,
        constant: true,
      });
      continue;
    }

    // 没关键词 + 不是 constant → 直接判失败（旧行为兼容）
    if (primaryKeys.length === 0 || !scanText) {
      candidates.push({
        entry,
        primaryHitKeys: [],
        secondaryHitKeys: [],
        logicPassed: false,
        constant: false,
      });
      continue;
    }

    const primaryHitKeys = hitsOf(scanText, primaryKeys, caseSensitive);
    const secondaryHitKeys =
      secondaryKeys.length > 0
        ? hitsOf(scanText, secondaryKeys, caseSensitive)
        : [];
    const logic = entry.selectiveLogic ?? "and_any";
    const logicPassed = applySelectiveLogic(
      primaryHitKeys.length,
      secondaryHitKeys.length,
      secondaryKeys.length,
      logic,
    );
    candidates.push({
      entry,
      primaryHitKeys,
      secondaryHitKeys,
      logicPassed,
      constant: false,
    });
  }

  // 2. 概率掷骰：probability=100 时 short-circuit 跳过 RNG
  type Survived = Candidate & { rolled: number | null; passedProbability: boolean };
  const passedLogic: Survived[] = [];
  for (const c of candidates) {
    if (!c.logicPassed) {
      passedLogic.push({ ...c, rolled: null, passedProbability: false });
      continue;
    }
    const prob = Number.isFinite(c.entry.probability) ? c.entry.probability : 100;
    if (prob >= 100) {
      passedLogic.push({ ...c, rolled: null, passedProbability: true });
      continue;
    }
    if (prob <= 0) {
      passedLogic.push({ ...c, rolled: null, passedProbability: false });
      continue;
    }
    const rolled = rng() * 100;
    passedLogic.push({ ...c, rolled, passedProbability: rolled < prob });
  }

  // 3. 预算分配：先把"逻辑+概率都过"的按 updatedAt 倒序排，逐条累加字符数到 charBudget 截止
  //    constant 条目享受最高优先级（不被预算挤掉的优先级提升）。
  const eligible = passedLogic.filter((c) => c.logicPassed && c.passedProbability);
  eligible.sort((a, b) => {
    if (a.constant !== b.constant) return a.constant ? -1 : 1;
    return (b.entry.updatedAt ?? "").localeCompare(a.entry.updatedAt ?? "");
  });

  const injectedSet = new Set<string>();
  let usedChars = 0;
  const dropByBudgetSet = new Set<string>();
  for (const c of eligible) {
    const formatted = formatEntry(c.entry);
    if (usedChars + formatted.length > charBudget) {
      dropByBudgetSet.add(c.entry.id);
      continue;
    }
    injectedSet.add(c.entry.id);
    usedChars += formatted.length + 1; // +1 估算行分隔符
  }

  // 4. 按 position 分组拼接（保持 eligible 排序后的顺序进入 block）
  const beforeArr: string[] = [];
  const afterArr: string[] = [];
  const atDepthArr: string[] = [];
  for (const c of eligible) {
    if (!injectedSet.has(c.entry.id)) continue;
    const pos: WorldEntryPosition = c.entry.position ?? "before";
    const block = formatEntry(c.entry);
    if (pos === "after") afterArr.push(block);
    else if (pos === "at_depth") atDepthArr.push(block);
    else beforeArr.push(block);
  }

  // 5. 产出 traces：每条候选都产一条诊断记录
  const traces: WorldInfoEntryTrace[] = passedLogic.map((c) => {
    let droppedReason: WorldInfoEntryTrace["droppedReason"] = null;
    if (!c.logicPassed) droppedReason = "logic_failed";
    else if (!c.passedProbability) droppedReason = "prob_failed";
    else if (dropByBudgetSet.has(c.entry.id)) droppedReason = "budget_exceeded";
    return {
      entryId: c.entry.id,
      packId: packIdMap[c.entry.id] ?? null,
      title: c.entry.title,
      category: c.entry.category,
      matched: c.logicPassed,
      matchedKeys: c.primaryHitKeys,
      selectiveLogic: c.entry.selectiveLogic ?? "and_any",
      secondaryMatched: c.secondaryHitKeys,
      rolled: c.rolled,
      probability: Number.isFinite(c.entry.probability) ? c.entry.probability : 100,
      passedProbability: c.passedProbability,
      constant: c.constant,
      injected: injectedSet.has(c.entry.id),
      droppedReason,
      approxChars: formatEntry(c.entry).length,
    };
  });

  return {
    activatedIds: Array.from(injectedSet),
    droppedIds: Array.from(dropByBudgetSet),
    before: wrapBlock(beforeArr, "【相关设定】"),
    after: wrapBlock(afterArr, "【补充设定】"),
    atDepth: wrapBlock(atDepthArr, "【背景注入】"),
    traces,
    charsUsed: usedChars,
    charBudget,
  };
}
