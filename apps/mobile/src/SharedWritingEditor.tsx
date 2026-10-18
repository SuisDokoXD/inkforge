import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { AppSettings, SnapshotRestoreResponse } from '@inkforge/shared';
import type { Editor } from '@tiptap/react';
import '@tiptap/starter-kit';
import { NovelEditor, findTextMatches, normalizeManualSelection, type TextFindOptions } from '@inkforge/editor';
import { Archive, RotateCcw, RotateCw, Save, Search } from 'lucide-react';
import { AnimatedDialog } from '@renderer/components/AnimatedDialog';
import { SnapshotMenu } from '@renderer/components/snapshot/SnapshotMenu';
import { EditorAppearanceMenu } from '@renderer/components/editor/EditorAppearanceMenu';
import { EditorFindBar } from '@renderer/components/editor/EditorFindBar';
import { EditorInsertMenu } from '@renderer/components/editor/EditorInsertMenu';
import { ManualWritingCommandMenu } from '@renderer/components/editor/ManualWritingCommandMenu';
import { ManualWritingRhythmBar } from '@renderer/components/editor/ManualWritingRhythmBar';
import { Divider, IconButton } from '@renderer/components/ui';
import { fadeOnly, fadeSlideUp, successPulse } from '@renderer/lib/motion-tokens';
import { matchManualWritingShortcut, type ManualWritingCommandId } from '@renderer/lib/manual-writing-commands';
import { useDebouncedValue } from '@renderer/lib/use-debounced-value';
import {
  MANUAL_RHYTHM_ACTIVE_WINDOW_MS,
  addManualWritingBeat,
  buildManualWritingHandoffCapture,
  buildManualWritingResumeCue,
  completeManualWritingBeat,
  createDefaultManualWritingRhythmState,
  manualWritingRhythmStorageKey,
  moveManualWritingBeat,
  normalizeHandoffNote,
  parseManualWritingRhythmState,
  readManualWritingCue,
  removeManualWritingBeat,
  reopenManualWritingBeat,
  serializeManualWritingRhythmState,
  upsertManualWritingBeat,
  type ManualWritingRhythmState,
} from '@renderer/lib/manual-writing-rhythm';
import type { Draft } from './platform';

const appearanceKey = 'inkforge.mobile.editor-appearance';
const mobileWritingCommands: readonly ManualWritingCommandId[] = [
  'insert-heading-1', 'insert-heading-2', 'insert-scene-break', 'insert-indent', 'insert-todo',
  'normalize-selection', 'open-find',
];
type Appearance = Pick<AppSettings, 'editorFontSize' | 'editorLineHeight' | 'editorWidth' | 'typewriterMode' | 'spellcheck'>;
type FindMatch = { from: number; to: number; text: string };
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

function countWritingGraphemes(text: string): number {
  return Array.from(text.replace(/\s/g, '')).length;
}

function currentEditorLine(editor: Editor | null): number {
  if (!editor) return 1;
  return editor.state.doc.textBetween(0, editor.state.selection.from, '\n').split('\n').length;
}

export function SharedWritingEditor({ draft, status, onChange, onSave, onBeforeSnapshot, onRestored }: {
  draft: Draft; status: string; onChange: (draft: Draft) => void; onSave: () => void;
  onBeforeSnapshot: () => Promise<void>;
  onRestored: (response: SnapshotRestoreResponse) => void;
}) {
  const editor = useRef<Editor | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const jumpFindOnOpenRef = useRef(false);
  const previousContentRef = useRef(draft.text);
  const lastWritingTickRef = useRef<number | null>(null);
  const [appearance, setAppearance] = useState(loadAppearance);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [editorReady, setEditorReady] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findOptions, setFindOptions] = useState<TextFindOptions>({ caseSensitive: false, wholeWord: false });
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [findStatus, setFindStatus] = useState<string | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [rhythmState, setRhythmState] = useState<ManualWritingRhythmState>(() => createDefaultManualWritingRhythmState());
  const [sessionBaseGraphemes, setSessionBaseGraphemes] = useState(() => countWritingGraphemes(draft.text));
  const [activeDurationMs, setActiveDurationMs] = useState(0);
  const [rhythmNow, setRhythmNow] = useState(Date.now());
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const rhythmKey = manualWritingRhythmStorageKey(draft.bookId, draft.id);

  useEffect(() => {
    try { setRhythmState(parseManualWritingRhythmState(localStorage.getItem(rhythmKey))); }
    catch { setRhythmState(createDefaultManualWritingRhythmState()); }
    setSessionBaseGraphemes(countWritingGraphemes(draft.text));
    setActiveDurationMs(0);
    setRhythmNow(Date.now());
    previousContentRef.current = draft.text;
    lastWritingTickRef.current = null;
  }, [draft.id, draft.bookId, rhythmKey]);

  const persistManualRhythmState = useCallback((nextState: ManualWritingRhythmState) => {
    const normalized = createDefaultManualWritingRhythmState(nextState);
    setRhythmState(normalized);
    try {
      localStorage.setItem(rhythmKey, serializeManualWritingRhythmState(normalized));
      setPreferenceError('');
    } catch { setPreferenceError('写作接力未能保存到本机，请检查应用存储空间。'); }
  }, [rhythmKey]);

  useEffect(() => {
    if (draft.text === previousContentRef.current) return;
    const now = Date.now();
    previousContentRef.current = draft.text;
    lastWritingTickRef.current = now;
    setRhythmNow(now);
    const cue = readManualWritingCue(draft.text, currentEditorLine(editor.current));
    if (cue.text) {
      persistManualRhythmState(createDefaultManualWritingRhythmState({
        ...rhythmState,
        lastCueText: cue.text,
        lastLine: cue.line,
        lastUpdatedAt: now,
      }));
    }
  }, [draft.text, persistManualRhythmState, rhythmState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setRhythmNow(now);
      if (document.visibilityState === 'visible' && lastWritingTickRef.current !== null
        && now - lastWritingTickRef.current <= MANUAL_RHYTHM_ACTIVE_WINDOW_MS) {
        setActiveDurationMs(value => value + 1000);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [draft.id]);

  const closeSnapshots = () => { if (!snapshotBusy) { setSnapshotsOpen(false); editor.current?.commands.focus(); } };
  const updateHistory = useCallback(() => {
    setHistory({ undo: editor.current?.can().undo() ?? false, redo: editor.current?.can().redo() ?? false });
  }, []);
  const ready = useCallback((next: Editor | null) => {
    editor.current?.off('transaction', updateHistory);
    editor.current = next;
    setEditorReady(!!next);
    next?.on('transaction', updateHistory);
    updateHistory();
  }, [updateHistory]);
  const changeAppearance = (updates: Partial<AppSettings>) => {
    const next = { ...appearance, ...updates };
    setAppearance(next);
    try { localStorage.setItem(appearanceKey, JSON.stringify(next)); setPreferenceError(''); }
    catch { setPreferenceError('外观设置未能保存，下次打开将使用默认值。'); }
  };
  const insert = useCallback((content: string) => editor.current?.chain().focus().insertContent(content).run(), []);
  const normalize = useCallback(() => {
    const current = editor.current;
    if (!current) return;
    const { from, to, empty, $from } = current.state.selection;
    const start = empty ? $from.start() : from;
    const end = empty ? $from.end() : to;
    const text = current.state.doc.textBetween(start, end, '\n');
    current.chain().focus().insertContentAt({ from: start, to: end }, normalizeManualSelection(text)).run();
  }, []);
  const runWritingCommand = useCallback((id: ManualWritingCommandId) => {
    if (!editor.current) return;
    switch (id) {
      case 'insert-heading-1': insert('<p># </p>'); break;
      case 'insert-heading-2': insert('<p>## </p>'); break;
      case 'insert-scene-break': insert('<p>---</p><p></p>'); break;
      case 'insert-indent': insert('　　'); break;
      case 'insert-todo': insert('【待补：】'); break;
      case 'normalize-selection': normalize(); break;
      case 'open-find': setFindOpen(true); break;
      default: break;
    }
  }, [insert, normalize]);
  const findQuery = findText.trim();
  const findMatches = useMemo<FindMatch[]>(() => {
    const current = editor.current;
    if (!findOpen || !current || !findQuery) return [];
    const matches: FindMatch[] = [];
    current.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return true;
      for (const match of findTextMatches(node.text, findQuery, findOptions)) {
        matches.push({ from: pos + match.index, to: pos + match.index + match.length, text: match.text });
      }
      return true;
    });
    return matches;
  }, [draft.text, editorReady, findOpen, findOptions, findQuery, history.undo, history.redo]);

  const selectFindMatch = useCallback((index: number) => {
    const current = editor.current;
    if (!current || findMatches.length === 0) return;
    const nextIndex = ((index % findMatches.length) + findMatches.length) % findMatches.length;
    const match = findMatches[nextIndex];
    if (!match) return;
    current.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();
    setActiveFindIndex(nextIndex);
    setReplaceConfirm(false);
    setFindStatus(null);
    try {
      const coords = current.view.coordsAtPos(match.from);
      const scrollElement = current.view.dom.closest('.shared-editor-scroll') as HTMLElement | null;
      if (scrollElement) {
        const targetTop = coords.top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop - 100;
        scrollElement.scrollTo({ top: Math.max(0, targetTop), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    } catch { /* ignore coordinates while the editor is updating */ }
  }, [findMatches, reduceMotion]);

  const runFind = useCallback((backwards = false) => {
    if (!findQuery) return;
    if (findMatches.length === 0) { setFindStatus('未找到'); return; }
    const selection = editor.current?.state.selection;
    const selectedIndex = selection
      ? findMatches.findIndex(match => match.from === selection.from && match.to === selection.to)
      : -1;
    const baseIndex = selectedIndex >= 0 ? selectedIndex : activeFindIndex;
    selectFindMatch(selectedIndex >= 0 ? baseIndex + (backwards ? -1 : 1) : (backwards ? findMatches.length - 1 : 0));
  }, [activeFindIndex, findMatches, findQuery, selectFindMatch]);

  const replaceCurrentMatch = useCallback(() => {
    const current = editor.current;
    if (!current || findMatches.length === 0) { setFindStatus('没有可替换内容'); return; }
    const match = findMatches[Math.min(activeFindIndex, findMatches.length - 1)];
    if (!match) return;
    current.view.dispatch(current.state.tr.insertText(replaceText, match.from, match.to));
    current.commands.focus();
    setReplaceConfirm(false);
    setFindStatus('已替换 1 处');
  }, [activeFindIndex, findMatches, replaceText]);

  const replaceAllMatches = useCallback(() => {
    const current = editor.current;
    if (!current || findMatches.length === 0) { setFindStatus('没有可替换内容'); return; }
    if (findMatches.length > 1 && !replaceConfirm) {
      setReplaceConfirm(true);
      setFindStatus(`将替换 ${findMatches.length} 处`);
      return;
    }
    let transaction = current.state.tr;
    for (const match of [...findMatches].reverse()) transaction = transaction.insertText(replaceText, match.from, match.to);
    current.view.dispatch(transaction);
    current.commands.focus();
    setActiveFindIndex(0);
    setReplaceConfirm(false);
    setFindStatus(`已替换 ${findMatches.length} 处`);
  }, [findMatches, replaceConfirm, replaceText]);

  const closeFind = () => { setFindOpen(false); setReplaceConfirm(false); setFindStatus(null); };
  useEffect(() => {
    if (!findOpen) return;
    const frame = window.requestAnimationFrame(() => { findInputRef.current?.focus(); findInputRef.current?.select(); });
    return () => window.cancelAnimationFrame(frame);
  }, [findOpen]);
  useEffect(() => {
    setActiveFindIndex(0);
    setReplaceConfirm(false);
    setFindStatus(null);
  }, [findQuery, findOptions.caseSensitive, findOptions.wholeWord]);
  useEffect(() => {
    if (!findOpen || !editorReady || !jumpFindOnOpenRef.current) return;
    jumpFindOnOpenRef.current = false;
    if (findMatches.length > 0) selectFindMatch(0);
    else setFindStatus('未找到');
  }, [editorReady, findOpen, findMatches, selectFindMatch]);

  const insertParagraphBreak = (placement: 'before' | 'after') => {
    const current = editor.current;
    if (!current) return;
    const { state } = current;
    const depth = state.selection.$from.depth;
    if (depth <= 0) return;
    const insertPos = placement === 'before' ? state.selection.$from.before(depth) : state.selection.$from.after(depth);
    current.chain().focus().insertContentAt(insertPos, { type: 'paragraph' }).setTextSelection(insertPos + 1).run();
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && !event.altKey && !event.shiftKey && key === 's') {
        event.preventDefault();
        onSave();
        return;
      }
      if (modifier && !event.altKey && (key === 'f' || key === 'h')) {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      const current = editor.current;
      const target = event.target;
      const editorHasFocus = current?.view.hasFocus()
        || (!!current && target instanceof Node && current.view.dom.contains(target));
      if (!current || !editorHasFocus) return;
      if (modifier && !event.altKey && key === 'enter') {
        event.preventDefault();
        insertParagraphBreak(event.shiftKey ? 'before' : 'after');
        return;
      }
      const command = matchManualWritingShortcut(event);
      if (!command) return;
      if (command === 'open-command-menu') { event.preventDefault(); setCommandMenuOpen(true); return; }
      if (!mobileWritingCommands.includes(command)) return;
      event.preventDefault();
      runWritingCommand(command);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, runWritingCommand]);

  const debouncedText = useDebouncedValue(draft.text, 250);
  const currentGraphemes = useMemo(() => countWritingGraphemes(debouncedText), [debouncedText]);
  const sessionAddedGraphemes = Math.max(0, currentGraphemes - sessionBaseGraphemes);
  const resumeCue = useMemo(() => buildManualWritingResumeCue(rhythmState, rhythmNow), [rhythmState, rhythmNow]);
  const handleCaptureHandoff = () => {
    const capture = buildManualWritingHandoffCapture(draft.text, currentEditorLine(editor.current));
    if (!capture) { setPreferenceError('正文还没有可记录的位置。'); return; }
    persistManualRhythmState(createDefaultManualWritingRhythmState({
      ...rhythmState,
      handoffNote: capture.handoffNote,
      lastCueText: capture.cueText,
      lastLine: capture.line,
      lastUpdatedAt: capture.capturedAt,
    }));
    setRhythmNow(capture.capturedAt);
  };
  const handleInsertBeatTodo = (id: string) => {
    const beat = rhythmState.beatQueue.find(item => item.id === id && item.status === 'open');
    if (beat) insert(`【待补：${beat.text}】`);
  };
  const handleJumpToResumeCue = () => {
    if (!resumeCue) return;
    jumpFindOnOpenRef.current = true;
    setFindText(resumeCue.text);
    setFindOpen(true);
  };

  return <div className="shared-writing-editor flex min-h-0 flex-1 flex-col bg-ink-900 text-ink-100">
    <div className="shared-editor-toolbar flex flex-wrap items-center gap-1 border-b border-ink-700 px-3 py-2">
      <input className="min-w-0 flex-1 bg-transparent text-sm font-medium" aria-label="章节标题" value={draft.title}
        onChange={event => onChange({ ...draft, title: event.target.value, updatedAt: Date.now() })} />
      <div className="flex flex-wrap items-center gap-1">
        <IconButton aria-label="撤销" title="撤销" variant="ghost" disabled={!history.undo} onClick={() => editor.current?.chain().focus().undo().run()}><RotateCcw className="h-4 w-4" /></IconButton>
        <IconButton aria-label="重做" title="重做" variant="ghost" disabled={!history.redo} onClick={() => editor.current?.chain().focus().redo().run()}><RotateCw className="h-4 w-4" /></IconButton>
        <Divider orientation="vertical" className="mx-0.5 h-5 self-center" />
        <ManualWritingCommandMenu open={commandMenuOpen} disabled={!editorReady} focusMode={false}
          availability={{ hasEditor: editorReady, chapterMapCount: 0, revisionCount: 0, healthIssueCount: 0 }}
          supportedCommands={mobileWritingCommands} onOpenChange={setCommandMenuOpen} onRunCommand={runWritingCommand} />
        <EditorInsertMenu onInsertHeading={level => insert(`<p>${'#'.repeat(level)} </p>`)}
          onInsertSceneBreak={() => insert('<p>---</p><p></p>')} onInsertIndent={() => insert('　　')}
          onInsertTodo={() => insert('【待补：】')} onNormalizeSelection={normalize} />
        <EditorAppearanceMenu settings={appearance} onChange={changeAppearance} />
        <IconButton aria-label="查找和替换正文" title="查找和替换 · Ctrl+F" variant={findOpen ? 'accentSoft' : 'ghost'} aria-pressed={findOpen}
          onClick={() => setFindOpen(value => !value)}><Search className="h-4 w-4" /></IconButton>
        <IconButton aria-label="章节版本备份" title="章节版本备份" variant="ghost" onClick={() => setSnapshotsOpen(true)}><Archive className="h-4 w-4" /></IconButton>
        <IconButton aria-label="保存正文（Ctrl+S）" title="保存正文 · Ctrl+S" variant={status === '已保存' ? 'accentSoft' : 'ghost'} onClick={onSave}><Save className="h-4 w-4" /></IconButton>
      </div>
    </div>
    <AnimatePresence initial={false}>
      {preferenceError && <motion.p key="editor-warning" role="alert" className="px-3 py-2 text-xs text-red-200" variants={panelMotion} initial="initial" animate="animate" exit="exit">{preferenceError}</motion.p>}
    </AnimatePresence>
    <AnimatePresence initial={false}>
      {findOpen && <motion.div key="editor-find" variants={panelMotion} initial="initial" animate="animate" exit="exit">
        <EditorFindBar inputRef={findInputRef} findText={findText} setFindText={setFindText} replaceText={replaceText} setReplaceText={setReplaceText}
          options={findOptions} onOptionsChange={setFindOptions} matchCount={findMatches.length} activeIndex={Math.min(activeFindIndex, Math.max(0, findMatches.length - 1))}
          status={findStatus} replaceConfirm={replaceConfirm} runFind={runFind} onReplaceCurrent={replaceCurrentMatch} onReplaceAll={replaceAllMatches} onClose={closeFind} />
      </motion.div>}
    </AnimatePresence>
    <ManualWritingRhythmBar focusMode={false} sessionAddedGraphemes={sessionAddedGraphemes} activeDurationMs={activeDurationMs}
      sessionGoal={rhythmState.sessionGoal} beatQueue={rhythmState.beatQueue} handoffNote={rhythmState.handoffNote} resumeCue={resumeCue}
      onAddBeat={text => persistManualRhythmState(addManualWritingBeat(rhythmState, text))}
      onUpdateBeat={(id, text) => persistManualRhythmState(upsertManualWritingBeat(rhythmState, id, text))}
      onCompleteBeat={id => persistManualRhythmState(completeManualWritingBeat(rhythmState, id))}
      onReopenBeat={id => persistManualRhythmState(reopenManualWritingBeat(rhythmState, id))}
      onDeleteBeat={id => persistManualRhythmState(removeManualWritingBeat(rhythmState, id))}
      onMoveBeat={(id, direction) => persistManualRhythmState(moveManualWritingBeat(rhythmState, id, direction))}
      onInsertBeatTodo={handleInsertBeatTodo}
      onHandoffNoteChange={value => persistManualRhythmState(createDefaultManualWritingRhythmState({ ...rhythmState, handoffNote: normalizeHandoffNote(value) }))}
      onCaptureHandoff={handleCaptureHandoff}
      onSessionGoalChange={value => persistManualRhythmState(createDefaultManualWritingRhythmState({ ...rhythmState, sessionGoal: value }))}
      onJumpToResumeCue={handleJumpToResumeCue} />
    <div className="shared-editor-scroll min-h-0 flex-1 overflow-auto px-4 py-6">
      <div className="mx-auto h-full" style={{ maxWidth: appearance.editorWidth === 'narrow' ? 640 : appearance.editorWidth === 'medium' ? 800 : 1080 }}>
        <NovelEditor key={draft.id} value={draft.text} onChange={text => onChange({ ...draft, text, updatedAt: Date.now() })}
          onEditorReady={ready} placeholder="开始写作……" className="mobile-editor" fontSize={appearance.editorFontSize}
          lineHeight={appearance.editorLineHeight} typewriterMode={appearance.typewriterMode} spellcheck={appearance.spellcheck} />
      </div>
    </div>
    <footer className="flex shrink-0 justify-between border-t border-ink-700 px-4 py-2 text-xs text-ink-400">
      <span>{currentGraphemes} 字</span>
      <motion.span key={status} role="status" variants={reduceMotion ? fadeOnly : successPulse} initial="initial" animate="animate">{status}</motion.span>
    </footer>
    <AnimatedDialog open={snapshotsOpen} onClose={closeSnapshots} ariaLabel="章节版本备份"
      panelClassName="snapshot-dialog max-h-[calc(100dvh-32px)] w-full max-w-[420px] overflow-auto">
      <SnapshotMenu chapterId={draft.id} projectId={draft.bookId} onBeforeSnapshotAction={onBeforeSnapshot}
        onRestored={onRestored} onClose={closeSnapshots} onBusyChange={setSnapshotBusy} />
    </AnimatedDialog>
  </div>;
}
