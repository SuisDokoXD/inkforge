import { useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, BookOpen, Menu, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { chapterApi } from '@renderer/lib/api';
import { AnimatedDialog } from '@renderer/components/AnimatedDialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button, IconButton } from '@renderer/components/ui';
import { fadeOnly, fadeSlideUp } from '@renderer/lib/motion-tokens';
import { capabilities, clearApiKey, loadSavedApiKey, saveApiKey, type Book, type Draft, type DraftStorage } from './platform';
import { openWorkspaceDraftStorage, openWorkspaceStorage } from './workspace-storage';
import { advisorContext, createAdvisorMemoryApi, emptyAdvisorMemory, type AdvisorMemory } from './advisor-memory';
import { SaveQueue } from './save-queue';
import { createRecoveryJournal } from './recovery-journal';
import { SharedBookshelf } from './SharedBookshelf';
import { SharedWritingEditor } from './SharedWritingEditor';
import { MobileSyncDialog } from './MobileSyncDialog';


type AdvisorChunk =
  | { type: 'delta'; text: string }
  | { type: 'done'; reason?: string }
  | { type: 'error'; message: string };

async function* streamAdvisor(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  question: string;
  excerpt: string;
  signal: AbortSignal;
  context: ReturnType<typeof advisorContext>;
}): AsyncGenerator<AdvisorChunk> {
  const endpoint = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: options.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        model: options.model,
        stream: true,
        max_tokens: 700,
        messages: [
          { role: 'system', content: '你是可选的写作背景顾问。提供具体背景线索，区分事实与推测，询问作者年代和地域。不评价文笔，不改写正文。' },
          ...options.context,
          { role: 'user', content: `${options.question || '请提供一个可用的背景补充方向。'}\n章节节选：\n${options.excerpt}` },
        ],
      }),
    });
  } catch (error) {
    if (options.signal.aborted) return;
    yield { type: 'error', message: '模型请求失败，请检查网络、服务地址和权限。' };
    return;
  }
  if (!response.ok || !response.body) {
    yield { type: 'error', message: `模型服务返回 ${response.status}，请检查服务地址和权限。` };
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;
  let finishReason: string | undefined;
  const consumeEvent = function* (event: string): Generator<AdvisorChunk> {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
    if (!data) return;
    if (data === '[DONE]') { sawDone = true; return; }
    try {
      const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> };
      const choice = payload.choices?.[0];
      if (choice?.delta?.content) yield { type: 'delta', text: choice.delta.content };
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    } catch {
      yield { type: 'error', message: '模型返回了无法解析的流式数据。' };
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const event of events) {
        for (const chunk of consumeEvent(event)) {
          if (chunk.type === 'error') { yield chunk; return; }
          yield chunk;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const chunk of consumeEvent(buffer)) {
        if (chunk.type === 'error') { yield chunk; return; }
        yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!sawDone) {
    yield { type: 'error', message: '连接已结束，但未确认输出完整。' };
    return;
  }
  yield { type: 'done', reason: finishReason };
}

export function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({});
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState('正在加载');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [mobileSyncOpen, setMobileSyncOpen] = useState(false);
  const reduceMotion = useReducedMotion() === true;
  const pageMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const [sidebar, setSidebar] = useState(false);
  const [advisor, setAdvisor] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [question, setQuestion] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [memory, setMemory] = useState<AdvisorMemory>(emptyAdvisorMemory);
  const [memoryReady, setMemoryReady] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [clearMemoryConfirm, setClearMemoryConfirm] = useState(false);
  const [deleteChapterId, setDeleteChapterId] = useState<string | null>(null);
  const [deletingChapter, setDeletingChapter] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashChapters, setTrashChapters] = useState<Awaited<ReturnType<typeof chapterApi.trashList>>>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const recoveryJournal = useRef<ReturnType<typeof createRecoveryJournal> | null>(null);
  if (!recoveryJournal.current) recoveryJournal.current = createRecoveryJournal();
  const queue = useRef<SaveQueue | null>(null);
  const storageRef = useRef<DraftStorage | null>(null);
  const latest = useRef<Draft | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const advisorController = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMemory(emptyAdvisorMemory()); setMemoryReady(false); setSummaryDraft(''); setQuestion(''); setOutput(''); setClearMemoryConfirm(false);
    if (!activeId) return;
    void openWorkspaceStorage().then(storage => createAdvisorMemoryApi(storage).get(activeId)).then(value => {
      if (!cancelled) { setMemory(value); setSummaryDraft(value.summary); setMemoryReady(true); }
    }).catch(() => { if (!cancelled) setError('顾问记忆读取失败，正文仍可继续编辑。'); });
    return () => { cancelled = true; };
  }, [activeId]);

  async function changeMemory(clear = false) {
    if (!activeId || running || memoryBusy) return;
    const chapterId = activeId;
    setMemoryBusy(true);
    try {
      const api = createAdvisorMemoryApi(await openWorkspaceStorage());
      const next = clear ? await api.clear(chapterId) : await api.setSummary(chapterId, summaryDraft);
      if (latest.current?.id === chapterId) { setMemory(next); setSummaryDraft(next.summary); setClearMemoryConfirm(false); }
    } catch { setError('顾问记忆保存失败，请重试。'); }
    finally { setMemoryBusy(false); }
  }

  async function persist(draft: Draft) {
    if (!queue.current) throw new Error('存储尚未就绪');
    await queue.current.save(draft);
    if (!mounted.current) return;
    if (latest.current?.id === draft.id && latest.current.updatedAt === draft.updatedAt) {
      let warning = '';
      try {
        recoveryJournal.current?.clear(draft.id);
        const remaining = recoveryJournal.current?.read();
        if (remaining?.invalidIds.length) warning = '检测到无法解析的本机恢复日志，原记录未删除；请先备份应用数据。';
        else if (remaining?.drafts.length) warning = `有 ${remaining.drafts.length} 条恢复稿尚未写入本机数据库；最新内容仍保留在恢复日志中。`;
      } catch { warning = '正文已保存，但本机恢复记录未能清理或读取。'; }
      setStatus('已保存');
      setError(warning);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const storage = await openWorkspaceDraftStorage();
        if (capabilities.nativeSQLite) {
          try {
            const savedKey = await loadSavedApiKey();
            if (savedKey) { setApiKey(savedKey); setRememberApiKey(true); }
          } catch { setError('已保存的 API Key 无法解密；本地书稿仍可使用，请检查后重新填写密钥。'); }
        }
        storageRef.current = storage;
        queue.current = new SaveQueue(storage);
        let loadedBooks = await storage.loadBooks();
        const journal = recoveryJournal.current ?? createRecoveryJournal();
        for (const draft of journal.read().drafts) {
          if (!loadedBooks.some(book => book.id === draft.bookId)) {
            const fallback: Book = { id: draft.bookId, title: '我的书稿', updatedAt: draft.updatedAt };
            try {
              await storage.saveBook(fallback);
              loadedBooks = [...loadedBooks, fallback];
            } catch {
              // Keep the recovery journal intact; a later launch can retry once storage is available.
            }
          }
        }
        const saved = (await Promise.all(loadedBooks.map(book => storage.loadDrafts(book.id)))).flat();
        const remainingRecovery = journal.read();
        if (mounted.current) {
          if (remainingRecovery.invalidIds.length) {
            setError('检测到无法解析的本机恢复日志，原记录未删除；请先备份应用数据。');
          } else if (remainingRecovery.drafts.length) {
            setError(`有 ${remainingRecovery.drafts.length} 条恢复稿尚未写入本机数据库；最新内容仍保留在恢复日志中。`);
          }
          setBooks(loadedBooks);
          setChapterCounts(Object.fromEntries(loadedBooks.map(book => [book.id, saved.filter(draft => draft.bookId === book.id).length])));
          setActiveBookId(null);
          setDrafts([]);
          setActiveId(null);
          latest.current = null;
          setReady(true);
          setStatus(remainingRecovery.drafts.length ? '恢复稿待保存' : '已保存');
        }
      } catch { setError('无法打开本地存储，请保留应用数据后重试。'); setStatus('加载失败'); }
    })();
    const flush = () => {
      if (latest.current) void persist(latest.current).catch(() => {
        if (mounted.current) { setError('保存失败，恢复草稿仍在本机，请重试。'); setStatus('保存失败'); }
      });
    };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', flush);
    const listener = Capacitor.isNativePlatform()
      ? NativeApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) flush(); })
      : null;
    return () => {
      flush();
      mounted.current = false;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', flush);
      if (listener) void listener.then(handle => handle.remove());
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => document.documentElement.style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`);
    resize(); viewport?.addEventListener('resize', resize);
    return () => viewport?.removeEventListener('resize', resize);
  }, []);

  const activeBook = books.find(book => book.id === activeBookId) ?? null;
  const active = drafts.find(draft => draft.id === activeId) ?? null;

  async function openBook(book: Book) {
    if (running) return;
    if (latest.current) {
      try { await persist(latest.current); }
      catch { setError('当前章节保存失败，仍留在本章以免丢失内容。'); return; }
    }
    const nextDrafts = await storageRef.current?.loadDrafts(book.id) ?? [];
    setChapterCounts(counts => ({ ...counts, [book.id]: nextDrafts.length }));
    setActiveBookId(book.id);
    setTrashOpen(false);
    setTrashChapters([]);
    setDrafts(nextDrafts);
    setActiveId(nextDrafts[0]?.id ?? null);
    latest.current = nextDrafts[0] ?? null;
    setOutput('');
    setSidebar(false);
    setStatus('已保存');
  }

  function createChapter() {
    if (!activeBook || !ready || running) return;
    const draft: Draft = { id: crypto.randomUUID(), bookId: activeBook.id, title: `第 ${drafts.length + 1} 章`, text: '', updatedAt: Date.now() };
    setDrafts(items => [...items, draft]);
    setChapterCounts(counts => ({ ...counts, [activeBook.id]: drafts.length + 1 }));
    setActiveId(draft.id);
    latest.current = draft;
    update(draft);
    setSidebar(false);
  }

  function update(draft: Draft) {
    // Synchronous recovery journal survives process loss before the native write finishes.
    const nextDraft = {
      ...draft,
      updatedAt: Math.max(draft.updatedAt, (drafts.find(item => item.id === draft.id)?.updatedAt ?? 0) + 1),
    };
    latest.current = nextDraft;
    try { recoveryJournal.current?.write(nextDraft); }
    catch { setError('恢复草稿写入失败，请立即保存或导出正文。'); }
    setDrafts(items => {
      let found = false;
      const next = items.map(item => {
        if (item.id !== nextDraft.id) return item;
        found = true;
        return nextDraft;
      });
      return found ? next : [...next, nextDraft];
    });
    setStatus('保存中');
    void persist(nextDraft).catch(() => { setError('保存失败，恢复草稿仍在本机，请重试。'); setStatus('保存失败'); });
  }

  function select(draft: Draft) {
    if (running) return;
    latest.current = draft; setActiveId(draft.id); setSidebar(false); setOutput(''); setStatus('已保存');
  }

  async function moveChapterToTrash() {
    const targetId = deleteChapterId;
    const bookId = activeBookId;
    if (!targetId || !bookId || deletingChapter || running) return;
    setDeletingChapter(true);
    try {
      if (latest.current) {
        await persist(latest.current);
        await queue.current?.flush();
      }
      await chapterApi.delete({ id: targetId });
      recoveryJournal.current?.clear(targetId);
      const remaining = await storageRef.current?.loadDrafts(bookId) ?? [];
      setDrafts(remaining);
      setChapterCounts(counts => ({ ...counts, [bookId]: remaining.length }));
      if (activeId === targetId) {
        const next = remaining[0] ?? null;
        latest.current = next;
        setActiveId(next?.id ?? null);
        setStatus('已保存');
      }
      setDeleteChapterId(null);
    } catch {
      setError('移入回收站失败，章节内容仍保留在当前书稿中。');
    } finally {
      setDeletingChapter(false);
    }
  }

  async function openTrash() {
    if (!activeBookId) return;
    setTrashOpen(true);
    setTrashLoading(true);
    setError('');
    try { setTrashChapters(await chapterApi.trashList({ projectId: activeBookId })); }
    catch { setError('无法读取回收站，请重试。'); }
    finally { setTrashLoading(false); }
  }

  async function restoreTrashChapter(id: string) {
    const projectId = activeBookId;
    if (!projectId || trashBusyId || running) return;
    setTrashBusyId(id);
    setError('');
    try {
      await chapterApi.trashRestore({ id });
      const [remaining, trashed] = await Promise.all([
        storageRef.current?.loadDrafts(projectId) ?? Promise.resolve([]),
        chapterApi.trashList({ projectId }),
      ]);
      setDrafts(remaining);
      setChapterCounts(counts => ({ ...counts, [projectId]: remaining.length }));
      setTrashChapters(trashed);
    } catch {
      setError('恢复章节失败；章节仍保留在回收站中，请重试。');
    } finally { setTrashBusyId(null); }
  }

  async function permanentlyDeleteTrashChapter() {
    const id = permanentDeleteId;
    if (!id || !activeBookId || trashBusyId) return;
    setTrashBusyId(id);
    setError('');
    try {
      await chapterApi.trashDestroy({ id });
      recoveryJournal.current?.clear(id);
      setTrashChapters(items => items.filter(item => item.id !== id));
      setPermanentDeleteId(null);
    } catch {
      setError('永久删除失败，章节仍保留在回收站中，请重试。');
    } finally { setTrashBusyId(null); }
  }

  async function emptyTrash() {
    const projectId = activeBookId;
    if (!projectId || emptyingTrash) return;
    setEmptyingTrash(true);
    setError('');
    try {
      await chapterApi.trashEmpty({ projectId });
      let cleanupFailed = false;
      for (const draft of recoveryJournal.current?.read().drafts.filter(item => item.bookId === projectId) ?? []) {
        try { recoveryJournal.current?.clear(draft.id); }
        catch { cleanupFailed = true; }
      }
      setTrashChapters([]);
      setEmptyTrashConfirm(false);
      setError(cleanupFailed ? '回收站已清空，但本机恢复日志未能完全清理。' : '');
    } catch {
      setError('清空回收站失败，章节仍保留，请重试。');
    } finally { setEmptyingTrash(false); }
  }

  async function ask() {
    if (!active || running || !memoryReady || memoryBusy) return;
    const chapterId = active.id;
    if (!model.trim() || !apiKey.trim()) { setError('请填写模型名称和 API Key。'); return; }
    if (rememberApiKey) {
      try { await saveApiKey(apiKey); }
      catch { setError('API Key 无法保存到本机安全存储，未发送请求。'); return; }
    }
    try { if (new URL(baseUrl).protocol !== 'https:') throw new Error(); }
    catch { setError('模型服务地址必须是有效的 HTTPS 地址。'); return; }
    const request = ++generation.current;
    const controller = new AbortController();
    advisorController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(new Error('request-timeout')), 60_000);
    setRunning(true); setOutput(''); setError('');
    try {
      let complete = false;
      let answer = '';
      const prompt = question.trim() || '请提供一个可用的背景补充方向。';
      for await (const chunk of streamAdvisor({ baseUrl, apiKey, model, question: prompt, context: advisorContext(memory), excerpt: active.text.slice(-3000), signal: controller.signal })) {
        if (request !== generation.current) break;
        if (chunk.type === 'error') throw new Error(chunk.message);
        if (chunk.type === 'delta') { answer += chunk.text; setOutput(answer); }
        if (chunk.type === 'done') {
          complete = true;
          if (chunk.reason === 'length') throw new Error('输出达到长度上限，以上内容不完整。');
        }
      }
      if (!complete) throw new Error('连接已结束，但未确认输出完整。');
      if (!answer.trim()) throw new Error('模型返回空建议，未保存对话。');
      if (controller.signal.aborted || request !== generation.current) return;
      const nextMemory = await createAdvisorMemoryApi(await openWorkspaceStorage()).append(chapterId, prompt, answer);
      if (latest.current?.id === chapterId && request === generation.current) { setMemory(nextMemory); setOutput(''); setQuestion(''); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '模型请求失败');
      else if (controller.signal.reason instanceof Error && controller.signal.reason.message === 'request-timeout') setError('模型请求超时，请检查网络后重试。');
    } finally {
      window.clearTimeout(timeout);
      if (advisorController.current === controller) advisorController.current = null;
      if (request === generation.current) setRunning(false);
    }
  }

  function cancelAdvisor() {
    generation.current += 1;
    advisorController.current?.abort(new Error('request-cancelled'));
    advisorController.current = null;
    setRunning(false);
  }

  async function reloadBookshelfAfterSync() {
    const storage = storageRef.current ?? await openWorkspaceDraftStorage();
    const nextBooks = await storage.loadBooks();
    const booksWithChapters = await Promise.all(nextBooks.map(async book => ({
      book,
      chapters: await storage.loadDrafts(book.id),
    })));
    setBooks(nextBooks);
    setChapterCounts(Object.fromEntries(booksWithChapters.map(item => [item.book.id, item.chapters.length])));
  }

  return <div className="mobile-workspace">
    <header className="app-toolbar">
      {activeBook && <IconButton disabled={running || memoryBusy} aria-label="返回书架" title="返回书架" variant="ghost" onClick={() => {
        if (latest.current) void persist(latest.current).then(() => { setActiveBookId(null); setDrafts([]); setActiveId(null); setSidebar(false); setAdvisor(false); setTrashOpen(false); setTrashChapters([]); }).catch(() => setError('当前章节保存失败，暂不能返回书架。'));
        else { setActiveBookId(null); setDrafts([]); setActiveId(null); setSidebar(false); setAdvisor(false); setTrashOpen(false); setTrashChapters([]); }
      }}><ArrowLeft size={20} /></IconButton>}
      {activeBook && <IconButton aria-label="打开章节列表" title="章节列表" aria-pressed={sidebar} variant={sidebar ? 'accentSoft' : 'ghost'} onClick={() => setSidebar(!sidebar)}><Menu size={20} /></IconButton>}
      <BookOpen size={20} /><strong>{activeBook?.title ?? 'InkForge 书架'}</strong>
      <span className="environment">{capabilities.nativeSQLite ? '本机 SQLite' : '浏览器预览 · 本地存储'}</span>
      {capabilities.lanSync && !activeBook && <Button type="button" className="sync-toggle" aria-label="跨设备同步" title="跨设备同步" variant="secondary" size="sm" disabled={!ready} onClick={() => setMobileSyncOpen(true)}><RefreshCw size={17} /><span>同步</span></Button>}
      {activeBook && <Button className="advisor-toggle" aria-pressed={advisor} variant={advisor ? 'accentSoft' : 'secondary'} size="sm" onClick={() => setAdvisor(!advisor)}><Sparkles size={17} />顾问</Button>}
    </header>
    <AnimatePresence initial={false}>
      {error && <motion.div key="app-error" className="error" role="alert" variants={pageMotion} initial="initial" animate="animate" exit="exit">{error}<IconButton aria-label="关闭提示" title="关闭提示" variant="ghost" size="sm" onClick={() => setError('')}><X size={18} /></IconButton></motion.div>}
    </AnimatePresence>
    <div className="workspace-body">
      {sidebar && <button className="drawer-backdrop" aria-label="关闭章节列表" onClick={() => setSidebar(false)} />}
      {activeBook && <aside className={`chapter-sidebar ${sidebar ? 'open' : ''}`}>
        <div className="section-heading">
          <strong>{trashOpen ? '回收站' : '章节'}</strong>
          {trashOpen
            ? <IconButton type="button" variant="ghost" aria-label="返回章节列表" title="返回章节列表" onClick={() => setTrashOpen(false)}><ArrowLeft size={20} /></IconButton>
            : <IconButton type="button" variant="ghost" disabled={!ready || running} aria-label="新建章节" title="新建章节" onClick={createChapter}><Plus size={20} /></IconButton>}
        </div>
        {!trashOpen ? <>
          <nav aria-label="章节">{drafts.map(draft => <div className={`chapter-row ${draft.id === activeId ? 'selected' : ''}`} key={draft.id}>
            <Button type="button" variant="ghost" disabled={running} aria-pressed={draft.id === activeId} className="chapter-select" onClick={() => select(draft)}>{draft.title}</Button>
            {draft.id === activeId && <IconButton type="button" variant="ghost" className="chapter-delete" disabled={running} aria-label={`将${draft.title}移入回收站`} title="移入回收站" onClick={() => setDeleteChapterId(draft.id)}><Trash2 size={17} /></IconButton>}
          </div>)}</nav>
          <Button type="button" variant="ghost" className="trash-toggle" onClick={() => void openTrash()}><Trash2 size={16} /><span>回收站</span></Button>
          <p className="sidebar-status">{drafts.length} 章 · 自动保存</p>
        </> : <>
          {trashChapters.length > 0 && <div className="trash-actions">
            <span>{trashChapters.length} 章</span>
            <Button type="button" variant="danger" size="sm" disabled={emptyingTrash || !!trashBusyId} onClick={() => setEmptyTrashConfirm(true)}>清空</Button>
          </div>}
          {trashLoading
            ? <p className="trash-empty-state" role="status">正在读取回收站…</p>
            : trashChapters.length === 0
              ? <p className="trash-empty-state" role="status">回收站为空。</p>
              : <nav aria-label="回收站章节">{trashChapters.map(chapter => <div className="trash-row" key={chapter.id}>
                <span className="trash-row-title" title={chapter.title}>{chapter.title}</span>
                <Button type="button" variant="secondary" size="sm" disabled={!!trashBusyId || running} onClick={() => void restoreTrashChapter(chapter.id)}>恢复</Button>
                <Button type="button" variant="danger" size="sm" className="trash-delete" disabled={!!trashBusyId || running} aria-label={`永久删除${chapter.title}`} onClick={() => setPermanentDeleteId(chapter.id)}>删除</Button>
              </div>)}</nav>}
        </>}
      </aside>}
      <AnimatePresence mode="wait" initial={false}>
        {activeBook ? <motion.main key={`writing-${activeBook.id}`} className="writing-pane" variants={pageMotion} initial="initial" animate="animate" exit="exit">
          {active ? <SharedWritingEditor key={active.id} draft={active} status={status} onChange={update}
            onSave={() => {
              const current = latest.current?.id === active.id ? latest.current : active;
              void persist(current).catch(() => setError('保存失败，请重试。'));
            }}
            onBeforeSnapshot={async () => {
              if (!latest.current || latest.current.id !== active.id) throw new Error('章节已切换');
              await persist(latest.current);
              await queue.current?.flush();
            }}
            onRestored={response => {
              const restored = { ...active, text: response.chapterContent, updatedAt: Date.now() };
              latest.current = restored;
              setDrafts(items => items.map(item => item.id === restored.id ? restored : item));
              recoveryJournal.current?.clear(active.id);
              setStatus('已保存');
            }} /> : <div className="empty-state"><BookOpen size={32} /><h1>{ready ? '开始第一章' : '正在打开本地书稿'}</h1><p>为《{activeBook.title}》新建章节。</p><Button variant="primary" disabled={!ready} onClick={createChapter}><Plus size={18} />新建章节</Button></div>}
        </motion.main> : <motion.div key="bookshelf" className="flex min-h-0 min-w-0 flex-1" variants={pageMotion} initial="initial" animate="animate" exit="exit">
          <SharedBookshelf onOpen={async project => {
            const book: Book = { id: project.id, title: project.name, updatedAt: Date.now() };
            setBooks(items => [...items.filter(item => item.id !== book.id), book]);
            await openBook(book);
          }} />
        </motion.div>}
      </AnimatePresence>
      {advisor && activeBook && <aside className="advisor-pane" aria-label="背景顾问">
        <div className="section-heading"><strong>背景顾问</strong><button aria-label="关闭顾问" onClick={() => setAdvisor(false)}><X size={20} /></button></div>
        <p className="note">请求会发送本章末尾最多 3000 字。浏览器预览不会保存密钥。</p>
        <label>章节背景<textarea disabled={!memoryReady || running || memoryBusy} maxLength={2000} value={summaryDraft} onChange={event => setSummaryDraft(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          <button disabled={!memoryReady || running || memoryBusy} onClick={() => void changeMemory()}>保存背景</button>
          <button disabled={!memoryReady || running || memoryBusy} onClick={() => setClearMemoryConfirm(value => !value)}>清空本章记忆</button>
          {clearMemoryConfirm && <button disabled={memoryBusy} onClick={() => void changeMemory(true)}>确认清空</button>}
        </div>
        <label>服务地址<input disabled={running} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></label>
        <label>模型<input disabled={running} value={model} onChange={e => setModel(e.target.value)} /></label>
        <label>API Key<input disabled={running} autoComplete="off" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} /></label>
        {capabilities.nativeSQLite && <label className="checkbox-label"><input type="checkbox" checked={rememberApiKey} onChange={event => { setRememberApiKey(event.target.checked); if (!event.target.checked) void clearApiKey(); }} />在本机安全存储</label>}
        <label>补充问题<textarea value={question} onChange={e => setQuestion(e.target.value)} /></label>
        {running ? <button onClick={cancelAdvisor}>停止生成</button> : <button disabled={!active || !memoryReady || memoryBusy} onClick={() => void ask()}>获取背景补充</button>}
        <div className="advisor-history">{memory.turns.map(turn => <section key={turn.id} className="border-t border-ink-700 py-3">
          <p className="text-xs text-ink-400">{turn.question}</p><div className="advisor-output">{turn.answer}</div>
        </section>)}</div>
        <div className="advisor-output" aria-live="polite">{output}</div>
      </aside>}
    </div>
    <AnimatedDialog open={deleteChapterId !== null} onClose={() => { if (!deletingChapter) setDeleteChapterId(null); }} ariaLabel="确认移入回收站"
      panelClassName="max-h-[calc(100dvh-32px)] w-full max-w-[420px] overflow-auto">
      <div className="chapter-delete-dialog">
        <h2>将章节移入回收站？</h2>
        <p>章节正文和顾问记忆会保留在回收站中，可之后恢复。</p>
        <div>
          <Button type="button" variant="secondary" disabled={deletingChapter} onClick={() => setDeleteChapterId(null)}>取消</Button>
          <Button type="button" variant="danger" className="danger-action" disabled={deletingChapter} onClick={() => void moveChapterToTrash()}>{deletingChapter ? '正在处理…' : '移入回收站'}</Button>
        </div>
      </div>
    </AnimatedDialog>
    <AnimatedDialog open={permanentDeleteId !== null} onClose={() => { if (!trashBusyId) setPermanentDeleteId(null); }} ariaLabel="确认永久删除章节"
      panelClassName="max-h-[calc(100dvh-32px)] w-full max-w-[420px] overflow-auto">
      <div className="chapter-delete-dialog">
        <h2>永久删除章节？</h2>
        <p>将永久删除《{trashChapters.find(item => item.id === permanentDeleteId)?.title ?? '此章节'}》及其正文、版本备份与顾问记忆，无法恢复。</p>
        <div>
          <Button type="button" variant="secondary" disabled={!!trashBusyId} onClick={() => setPermanentDeleteId(null)}>取消</Button>
          <Button type="button" variant="danger" className="danger-action" disabled={!!trashBusyId} onClick={() => void permanentlyDeleteTrashChapter()}>{trashBusyId === permanentDeleteId ? '正在删除…' : '永久删除'}</Button>
        </div>
      </div>
    </AnimatedDialog>
    <AnimatedDialog open={emptyTrashConfirm} onClose={() => { if (!emptyingTrash) setEmptyTrashConfirm(false); }} ariaLabel="确认清空回收站"
      panelClassName="max-h-[calc(100dvh-32px)] w-full max-w-[420px] overflow-auto">
      <div className="chapter-delete-dialog">
        <h2>清空回收站？</h2>
        <p>将永久删除本作品回收站中的 {trashChapters.length} 个章节及其正文、版本备份和顾问记忆，无法恢复。</p>
        <div>
          <Button type="button" variant="secondary" disabled={emptyingTrash} onClick={() => setEmptyTrashConfirm(false)}>取消</Button>
          <Button type="button" variant="danger" className="danger-action" disabled={emptyingTrash} onClick={() => void emptyTrash()}>{emptyingTrash ? '正在清空…' : '清空回收站'}</Button>
        </div>
      </div>
    </AnimatedDialog>
    {capabilities.lanSync && <MobileSyncDialog open={mobileSyncOpen} onClose={() => setMobileSyncOpen(false)} onSynced={reloadBookshelfAfterSync} />}
  </div>;
}
