import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, SnapshotRestoreResponse } from '@inkforge/shared';
import type { Editor } from '@tiptap/react';
import '@tiptap/starter-kit';
import { NovelEditor, normalizeManualSelection } from '@inkforge/editor';
import { Archive, RotateCcw, RotateCw, Save } from 'lucide-react';
import { AnimatedDialog } from '@renderer/components/AnimatedDialog';
import { SnapshotMenu } from '@renderer/components/snapshot/SnapshotMenu';
import { EditorAppearanceMenu } from '@renderer/components/editor/EditorAppearanceMenu';
import { EditorInsertMenu } from '@renderer/components/editor/EditorInsertMenu';
import { IconButton } from '@renderer/components/ui';
import type { Draft } from './platform';

const appearanceKey = 'inkforge.mobile.editor-appearance';
type Appearance = Pick<AppSettings, 'editorFontSize' | 'editorLineHeight' | 'editorWidth' | 'typewriterMode' | 'spellcheck'>;
const defaults: Appearance = { editorFontSize: 18, editorLineHeight: 2, editorWidth: 'medium', typewriterMode: false, spellcheck: false };

function loadAppearance(): Appearance {
  try {
    const parsed = JSON.parse(localStorage.getItem(appearanceKey) ?? '{}');
    return {
      editorFontSize: typeof parsed.editorFontSize === 'number' ? Math.max(14, Math.min(24, parsed.editorFontSize)) : defaults.editorFontSize,
      editorLineHeight: typeof parsed.editorLineHeight === 'number' ? Math.max(1.5, Math.min(3, parsed.editorLineHeight)) : defaults.editorLineHeight,
      editorWidth: ['narrow', 'medium', 'wide'].includes(parsed.editorWidth) ? parsed.editorWidth : defaults.editorWidth,
      typewriterMode: parsed.typewriterMode === true,
      spellcheck: parsed.spellcheck === true,
    };
  } catch { return defaults; }
}

export function SharedWritingEditor({ draft, status, onChange, onSave, onBeforeSnapshot, onRestored }: {
  draft: Draft; status: string; onChange: (draft: Draft) => void; onSave: () => void;
  onBeforeSnapshot: () => Promise<void>;
  onRestored: (response: SnapshotRestoreResponse) => void;
}) {
  const editor = useRef<Editor | null>(null);
  const [appearance, setAppearance] = useState(loadAppearance);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [preferenceError, setPreferenceError] = useState('');
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  useEffect(() => {
    editor.current?.setEditable(!snapshotsOpen);
    if (!snapshotsOpen) return;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.snapshot-dialog button:not(:disabled)')?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [...document.querySelectorAll<HTMLElement>('.snapshot-dialog button:not(:disabled), .snapshot-dialog input:not(:disabled)')]
        .filter(element => element.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (!controls.includes(document.activeElement as HTMLElement) || document.activeElement === first)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (!controls.includes(document.activeElement as HTMLElement) || document.activeElement === last)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', trap, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', trap, true); };
  }, [snapshotsOpen]);
  const closeSnapshots = () => { if (!snapshotBusy) { setSnapshotsOpen(false); editor.current?.commands.focus(); } };
  const updateHistory = useCallback(() => {
    setHistory({ undo: editor.current?.can().undo() ?? false, redo: editor.current?.can().redo() ?? false });
  }, []);
  const ready = useCallback((next: Editor | null) => {
    editor.current?.off('transaction', updateHistory);
    editor.current = next;
    next?.on('transaction', updateHistory);
    updateHistory();
  }, [updateHistory]);
  const changeAppearance = (updates: Partial<AppSettings>) => {
    const next = { ...appearance, ...updates };
    setAppearance(next);
    try { localStorage.setItem(appearanceKey, JSON.stringify(next)); setPreferenceError(''); }
    catch { setPreferenceError('外观设置未能保存，下次打开将使用默认值。'); }
  };
  const insert = (content: string) => editor.current?.chain().focus().insertContent(content).run();
  const normalize = () => {
    const ed = editor.current;
    if (!ed) return;
    const { from, to, empty, $from } = ed.state.selection;
    const start = empty ? $from.start() : from;
    const end = empty ? $from.end() : to;
    const text = ed.state.doc.textBetween(start, end, '\n');
    ed.chain().focus().insertContentAt({ from: start, to: end }, normalizeManualSelection(text)).run();
  };
  return <div className="shared-writing-editor flex min-h-0 flex-1 flex-col bg-ink-900 text-ink-100">
    <div className="shared-editor-toolbar flex flex-wrap items-center gap-1 border-b border-ink-700 px-3 py-2">
      <input className="min-w-0 flex-1 bg-transparent text-sm font-medium" aria-label="章节标题" value={draft.title}
        onChange={event => onChange({ ...draft, title: event.target.value, updatedAt: Date.now() })} />
      <div className="flex items-center gap-1">
        <IconButton aria-label="撤销" title="撤销" variant="ghost" disabled={!history.undo} onClick={() => editor.current?.chain().focus().undo().run()}><RotateCcw className="h-4 w-4" /></IconButton>
        <IconButton aria-label="重做" title="重做" variant="ghost" disabled={!history.redo} onClick={() => editor.current?.chain().focus().redo().run()}><RotateCw className="h-4 w-4" /></IconButton>
        <EditorInsertMenu onInsertHeading={level => insert(`<p>${'#'.repeat(level)} </p>`)}
          onInsertSceneBreak={() => insert('<p>---</p><p></p>')} onInsertIndent={() => insert('　　')}
          onInsertTodo={() => insert('【待补：】')} onNormalizeSelection={normalize} />
        <EditorAppearanceMenu settings={appearance} onChange={changeAppearance} />
        <IconButton aria-label="章节版本备份" title="章节版本备份" variant="ghost" onClick={() => setSnapshotsOpen(true)}><Archive className="h-4 w-4" /></IconButton>
        <IconButton aria-label="保存正文" title="保存正文" variant="ghost" onClick={onSave}><Save className="h-4 w-4" /></IconButton>
      </div>
    </div>
    {preferenceError && <p role="alert" className="px-3 py-2 text-xs text-red-200">{preferenceError}</p>}
    <div className="shared-editor-scroll min-h-0 flex-1 overflow-auto px-4 py-6">
      <div className="mx-auto h-full" style={{ maxWidth: appearance.editorWidth === 'narrow' ? 640 : appearance.editorWidth === 'medium' ? 800 : 1080 }}>
        <NovelEditor key={draft.id} value={draft.text} onChange={text => onChange({ ...draft, text, updatedAt: Date.now() })}
          onEditorReady={ready} placeholder="开始写作……" className="mobile-editor" fontSize={appearance.editorFontSize}
          lineHeight={appearance.editorLineHeight} typewriterMode={appearance.typewriterMode} spellcheck={appearance.spellcheck} />
      </div>
    </div>
    <footer className="flex shrink-0 justify-between border-t border-ink-700 px-4 py-2 text-xs text-ink-400">
      <span>{Array.from(draft.text.replace(/\s/g, '')).length} 字</span><span role="status">{status}</span>
    </footer>
    <AnimatedDialog open={snapshotsOpen} onClose={closeSnapshots} ariaLabel="章节版本备份"
      panelClassName="snapshot-dialog max-h-[calc(100dvh-32px)] w-full max-w-[420px] overflow-auto">
      <SnapshotMenu chapterId={draft.id} projectId={draft.bookId} onBeforeSnapshotAction={onBeforeSnapshot}
        onRestored={onRestored} onClose={closeSnapshots} onBusyChange={setSnapshotBusy} />
    </AnimatedDialog>
  </div>;
}
