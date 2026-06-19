import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeEditorText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00A0\u3000]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function normalizePastedText(text: string): string {
  return normalizeEditorText(text)
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

function plainTextToHtml(text: string): string {
  if (!text) return "<p></p>";
  return normalizeEditorText(text)
    .split(/\n\n+/)
    .map((para) => {
      const escaped = escapeHtml(para);
      const lines = escaped.split("\n").map((line) =>
        line.replace(/^( +)/, (m) => "\u3000".repeat(m.length)),
      );
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

function scrollCursorToCenter(editor: Editor): void {
  try {
    const { view } = editor;
    const coords = view.coordsAtPos(view.state.selection.from);
    const editorEl = view.dom.closest(".overflow-auto") ?? view.dom.parentElement;
    if (!editorEl) return;
    const rect = editorEl.getBoundingClientRect();
    const targetY = coords.top - rect.top - rect.height / 2;
    if (Math.abs(targetY) > 40) {
      editorEl.scrollBy({ top: targetY, behavior: "smooth" });
    }
  } catch {
    // coordsAtPos can throw while IME composition or document replacement is in flight.
  }
}

function syncEditorDomState(editor: Editor): void {
  const dom = editor.view.dom;
  dom.dataset.empty = editor.isEmpty ? "true" : "false";
}

export interface NovelEditorProps {
  value: string;
  onChange: (plainText: string, html: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  className?: string;
  onEditorReady?: (editor: Editor | null) => void;
  autoIndent?: boolean;
  typewriterMode?: boolean;
  fontSize?: number;
  lineHeight?: number;
  spellcheck?: boolean;
}

export function NovelEditor(props: NovelEditorProps): JSX.Element {
  const {
    value, onChange, placeholder, autofocus, className,
    onEditorReady, autoIndent = true, typewriterMode = false,
    fontSize = 16, lineHeight = 2.0, spellcheck = true,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // 记录编辑器自己最近一次通过 onChange 发出的纯文本。下面 value→编辑器 的同步
  // 副作用用它识别"自己刚打的字回流"，从而跳过 setContent，避免把正在输入的
  // 内容（尤其中文 IME 合成中）清空——即用户反馈的"输入的字消失、刷新又出现"。
  const lastEmittedRef = useRef<string>(normalizeEditorText(value));

  const editor = useEditor({
    extensions: [StarterKit.configure({ history: { depth: 200 } })],
    content: plainTextToHtml(value),
    autofocus: autofocus ?? false,
    editorProps: {
      attributes: {
        class:
          className ??
          "prose prose-lg max-w-none focus:outline-none text-slate-100",
        spellcheck: spellcheck ? "true" : "false",
        "data-placeholder": placeholder ?? "",
        "data-empty": value.trim() ? "false" : "true",
        "aria-label": placeholder ?? "Novel editor",
        style: `font-size:${fontSize}px;line-height:${lineHeight}`,
      },
      transformPastedText(text) {
        return normalizePastedText(text);
      },
      handleTextInput(view, from, _to, text) {
        if (text !== " ") return false;
        const { state } = view;
        const $from = state.doc.resolve(from);
        const lineStart = $from.start();
        const before = state.doc.textBetween(lineStart, from);
        if (/^[\u3000]*$/.test(before)) {
          view.dispatch(state.tr.insertText("\u3000", from, from));
          return true;
        }
        return false;
      },
      handleKeyDown(view, event) {
        if (event.key !== "Enter" || !autoIndent) return false;
        if (event.shiftKey || event.ctrlKey || event.metaKey) return false;
        const { state } = view;
        const { $from } = state.selection;
        const tr = state.tr.split($from.pos);
        tr.insertText("\u3000\u3000");
        view.dispatch(tr);
        return true;
      },
    },
    onCreate: ({ editor: ed }) => {
      syncEditorDomState(ed);
    },
    onUpdate: ({ editor: ed }) => {
      syncEditorDomState(ed);
      const text = normalizeEditorText(ed.getText());
      lastEmittedRef.current = text;
      onChange(text, ed.getHTML());
      if (typewriterMode) scrollCursorToCenter(ed);
    },
  });

  useEffect(() => {
    if (!editor) return;
    // IME（中文/日文）合成途中绝不能 setContent，否则会打断合成、吞掉刚输入的字。
    if ((editor.view as { composing?: boolean }).composing) return;
    const normalizedValue = normalizeEditorText(value);
    // value 只是"编辑器自己刚发出的文本"回流时跳过：受控组件里这一步若照旧
    // setContent，会清掉用户正在输入的内容（表现为字消失、刷新才回来）。
    if (normalizedValue === lastEmittedRef.current) return;
    const currentText = normalizeEditorText(editor.getText());
    if (normalizedValue === currentText) return;
    // 走到这里才是真正的外部变更（切章 / 还原快照 / 技能写入 / 恢复草稿），需要回灌。
    editor.commands.setContent(plainTextToHtml(value), false);
    lastEmittedRef.current = normalizedValue;
    syncEditorDomState(editor);
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    dom.style.fontSize = `${fontSize}px`;
    dom.style.lineHeight = String(lineHeight);
    dom.setAttribute("spellcheck", spellcheck ? "true" : "false");
    dom.setAttribute("data-placeholder", placeholder ?? "");
    dom.setAttribute("aria-label", placeholder ?? "Novel editor");
  }, [editor, fontSize, lineHeight, placeholder, spellcheck]);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => { onEditorReady?.(null); };
  }, [editor, onEditorReady]);

  return (
    <div ref={containerRef}>
      <EditorContent editor={editor} />
    </div>
  );
}
