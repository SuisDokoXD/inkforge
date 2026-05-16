import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function plainTextToHtml(text: string): string {
  if (!text) return "<p></p>";
  return text
    .split(/\n\n+/)
    .map((para) => {
      const escaped = para
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const lines = escaped.split("\n").map((line) =>
        line.replace(/^( +)/, (m) => "\u3000".repeat(m.length)),
      );
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

function scrollCursorToCenter(editor: Editor): void {
  const { view } = editor;
  const coords = view.coordsAtPos(view.state.selection.from);
  const editorEl = view.dom.closest(".overflow-auto") ?? view.dom.parentElement;
  if (!editorEl) return;
  const rect = editorEl.getBoundingClientRect();
  const targetY = coords.top - rect.top - rect.height / 2;
  if (Math.abs(targetY) > 40) {
    editorEl.scrollBy({ top: targetY, behavior: "smooth" });
  }
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
}

export function NovelEditor(props: NovelEditorProps): JSX.Element {
  const {
    value, onChange, placeholder, autofocus, className,
    onEditorReady, autoIndent = true, typewriterMode = false,
    fontSize = 16, lineHeight = 2.0,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ history: { depth: 200 } })],
    content: plainTextToHtml(value),
    autofocus: autofocus ?? false,
    editorProps: {
      attributes: {
        class:
          className ??
          "prose prose-lg max-w-none focus:outline-none text-slate-100",
        spellcheck: "false",
        "data-placeholder": placeholder ?? "",
        style: `font-size:${fontSize}px;line-height:${lineHeight}`,
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
    onUpdate: ({ editor: ed }) => {
      const text = ed.getText().replace(/[\u00A0\u3000]/g, " ");
      onChange(text, ed.getHTML());
      if (typewriterMode) scrollCursorToCenter(ed);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentText = editor.getText().replace(/[\u00A0\u3000]/g, " ");
    if (value === currentText) return;
    if (editor.isFocused) return;
    editor.commands.setContent(plainTextToHtml(value), false);
  }, [editor, value]);

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