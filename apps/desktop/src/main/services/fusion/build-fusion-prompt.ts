// =============================================================================
// 卡牌融合 · Prompt 构建
// =============================================================================
// 把 N 张源卡 + 用户 brief 拼装成一段结构化 user message。
// 与 LLM 实际调用解耦，便于单测：给定固定源卡与 brief，验证 prompt 文本逐字一致。
// =============================================================================

import type { WorldPackEntryRecord, WorldPackRecord } from "@inkforge/shared";

export const FUSION_SYSTEM_PROMPT = `你是一位资深小说世界观架构师。
任务：把用户提供的多张「世界观卡牌」按其要求融合为一张全新的卡牌。

强约束（必须遵守）：
- 输出**纯 JSON**，不要 markdown / code fence / 解释文字
- JSON 字段顺序固定：name, tagline, description, tags, entries
- entries 每项必含：category, title, content, aliases, keys
- aliases / keys / tags 必须是字符串数组，可以为空但不可省略字段
- content 写完整自洽的设定文本（不要"详见原卡"这种引用）

融合原则：
- 冲突时倾向用户 brief 偏好；brief 没说的就让最贴合主题的源卡占主导
- 同名概念合并去重，保留最具体的版本
- 删除明显矛盾或与新主题不符的边角条目`;

export interface FusionSource {
  pack: WorldPackRecord;
  entries: WorldPackEntryRecord[];
}

const MAX_CONTENT_CHARS = 400; // 单条 entry 在 prompt 中的截断长度

// 拼装融合 user message。源卡顺序保留入参顺序，便于用户写 brief 时引用"源卡 1/2/3"。
export function buildFusionPrompt(
  sources: FusionSource[],
  brief: string,
): string {
  const parts: string[] = [];
  parts.push(
    `# 用户融合要求\n${brief.trim() || "（用户未提供 brief，请综合所有源卡精华）"}`,
  );
  parts.push(`\n---\n`);
  sources.forEach((src, idx) => {
    parts.push(`# 源卡 ${idx + 1}：${src.pack.name}`);
    if (src.pack.tagline) parts.push(`> ${src.pack.tagline}`);
    if (src.pack.description) parts.push(src.pack.description);
    if (src.pack.tags.length > 0)
      parts.push(`标签：${src.pack.tags.join(" · ")}`);
    parts.push(``);
    if (src.entries.length === 0) {
      parts.push(`（无条目）`);
    } else {
      parts.push(`## 条目（共 ${src.entries.length} 条）`);
      for (const e of src.entries) {
        const trimmed =
          e.content.length > MAX_CONTENT_CHARS
            ? `${e.content.slice(0, MAX_CONTENT_CHARS)}…`
            : e.content;
        const aliasPart =
          e.aliases.length > 0 ? `（别名：${e.aliases.join(" / ")}）` : "";
        parts.push(`- **${e.title}**${aliasPart} [${e.category}]：${trimmed}`);
      }
    }
    parts.push(`\n---\n`);
  });
  parts.push(`# 输出
请按以下 JSON schema 严格输出（仅 JSON，无任何附加文字）：

{
  "name": "新卡名称",
  "tagline": "一句话副标题",
  "description": "三到六句长描述",
  "tags": ["主题标签", ...],
  "entries": [
    {
      "category": "类目名",
      "title": "条目标题",
      "content": "完整设定内容",
      "aliases": ["别名1", "别名2"],
      "keys": ["触发关键词1", "触发关键词2"]
    }
  ]
}`);
  return parts.join("\n");
}
