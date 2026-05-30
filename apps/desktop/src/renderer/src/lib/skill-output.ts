// Skill 输出落地：把技能运行结果按 output target 写入 TipTap 编辑器。
// EditorPane（手动触发）与 SelectionToolbar（选中触发）共用，避免逻辑重复。
import type { Editor } from "@tiptap/react";
import type { SkillOutputTarget } from "@inkforge/shared";

export interface SkillApplyRange {
  from: number;
  to: number;
}

// 返回 true 表示已写入编辑器；返回 false 表示该输出走时间线（ai-feedback），由调用方处理。
// range 为选中触发时记录的原始选区；手动触发无选区时传 undefined（落到光标处 / 章末）。
export function applySkillOutputToEditor(
  editor: Editor | null,
  output: SkillOutputTarget,
  text: string,
  range?: SkillApplyRange,
): boolean {
  if (output === "ai-feedback") return false;
  const body = text.trim();
  if (!editor || !body) return false;

  if (output === "append-chapter") {
    // 追加到章末：跳到文末，空一行再插入。
    editor.chain().focus("end").insertContent(`\n\n${body}`).run();
    return true;
  }

  if (output === "replace-selection") {
    // 替换选中：有选区则定位后替换，无选区则落到当前光标处。
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    chain.insertContent(body).run();
    return true;
  }

  if (output === "insert-after-selection") {
    // 插入到选中之后：定位到选区末尾（无选区则当前位置），换行后插入。
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range.to);
    chain.insertContent(`\n${body}`).run();
    return true;
  }

  return false;
}
