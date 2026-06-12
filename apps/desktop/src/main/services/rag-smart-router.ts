// =============================================================================
// RAG Smart Router（启发式快速过滤）
// =============================================================================
// 现有 buildRagBlock 已有"无 query → 空"的隐式 gate，但每次都会跑一次
// 中文 2-gram 窗口提取 + 多张表 LIKE 检索。对极短或纯标点的 prompt 来说，
// 这次往返其实没收益。本模块用纯启发式（不调 LLM）在更上层判一道：
//
//   - 文本去除空白后长度 < MIN_LEN → 跳过 RAG
//   - 仅符号 / 数字 → 跳过 RAG
//   - 含明显"指令噪声"（如 "继续写"、"扩展一下" 单独出现）→ 跳过
//
// 真要做 LLM 级路由（"判断本次是否需要检索"）需要每次多一次 cheap-model 调用，
// 在低速 LLM 场景反而拖慢。本启发式 0 token、毫秒级，能覆盖 80% 不需要 RAG 的场景。
//
// 调用方：
//   if (!shouldRunRag(prompt)) skip; else const block = buildRagBlock(...);
// =============================================================================

const MIN_LEN = 6;

// 纯标点/空白/数字字符集（中文标点 + ASCII 标点）；任何不在此集合的视为"信息字符"。
const NOISE_RE = /^[\s\p{P}\d]*$/u;

// 命中之一即认为是"短指令 prompt"，不需要 RAG。
const INSTRUCTION_NOISE_PHRASES = [
  "继续",
  "继续写",
  "接着写",
  "再写一段",
  "扩展",
  "扩展一下",
  "润色",
  "润色一下",
  "翻译",
  "总结",
  "再来",
  "重写",
  "改一下",
];

export function shouldRunRag(prompt: string | undefined | null): boolean {
  if (!prompt) return false;
  const text = prompt.trim();
  if (text.length < MIN_LEN) return false;
  if (NOISE_RE.test(text)) return false;
  // 仅当整段就是这几个短指令之一才跳过；如果是"继续写：xxx 故事"则不跳。
  if (INSTRUCTION_NOISE_PHRASES.includes(text)) return false;
  return true;
}

// 给 skill-service / autoWriter 调用：
//   const ragBlock = shouldRunRag(query) ? buildRagBlock(projectId, query) : "";
// 也可以直接调本模块的 maybeBuildRagBlock 短路版本。
export function maybeBuildRagBlock<T extends (...args: never[]) => string>(
  query: string | undefined | null,
  build: T,
  ...args: Parameters<T>
): string {
  if (!shouldRunRag(query)) return "";
  return build(...args);
}
