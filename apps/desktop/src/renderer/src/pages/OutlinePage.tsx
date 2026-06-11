import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterRecord,
  OutlineCardRecord,
  ProjectRecord,
  SampleLibRecord,
} from "@inkforge/shared";
import {
  chapterApi,
  chapterGenApi,
  outlineApi,
  outlineGenApi,
  projectApi,
  sampleLibApi,
} from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useWritingFlowActions } from "../lib/use-writing-flow-actions";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { BulkChapterGenerator } from "../components/outline/BulkChapterGenerator";
import {
  ChapterDraftDialog,
  type ChapterDraftState,
} from "../components/outline/ChapterDraftDialog";
import { OutlineCardItem } from "../components/outline/OutlineCardItem";
import { OutlineStatusTile } from "../components/outline/OutlineStatusTile";
import { SampleReferencePicker } from "../components/SampleReferencePicker";
import {
  ProjectMetaDialog,
  type ProjectMetaDraft,
} from "../components/outline/ProjectMetaDialog";
import {
  countNonWhitespace,
  getCardQuality,
  getMetaCompleteness,
} from "../components/outline/outline-metrics";
import {
  AlertCircle,
  BookOpenCheck,
  ClipboardList,
  FileText,
  Layers3,
  Loader2,
  PenLine,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

export function OutlinePage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const outlineFocusCardId = useAppStore((s) => s.outlineFocusCardId);
  const setOutlineFocusCard = useAppStore((s) => s.setOutlineFocusCard);
  const queryClient = useQueryClient();
  const flowActions = useWritingFlowActions();
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const projectsQuery = useQuery({
    queryKey: ["projects-list-for-outline"],
    queryFn: () => projectApi.list(),
  });
  const project: ProjectRecord | undefined = useMemo(
    () => projectsQuery.data?.find((p) => p.id === projectId),
    [projectsQuery.data, projectId],
  );

  const cardsQuery = useQuery({
    queryKey: ["outline-cards", projectId],
    queryFn: () => projectId ? outlineApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const chaptersQuery = useQuery<ChapterRecord[]>({
    queryKey: ["chapters", projectId],
    queryFn: () => projectId ? chapterApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const sampleLibsQuery = useQuery<SampleLibRecord[]>({
    queryKey: ["sample-libs", projectId],
    queryFn: () => projectId ? sampleLibApi.list({ projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const outlineCards = useMemo(
    () => [...(cardsQuery.data ?? [])].sort((a, b) => a.order - b.order),
    [cardsQuery.data],
  );
  const chaptersById = useMemo(
    () => new Map((chaptersQuery.data ?? []).map((chapter) => [chapter.id, chapter])),
    [chaptersQuery.data],
  );
  const sampleLibs = sampleLibsQuery.data ?? [];

  const [metaOpen, setMetaOpen] = useState(false);
  const [metaDraft, setMetaDraft] = useState<ProjectMetaDraft>({
    synopsis: "", genre: "", subGenre: "", tags: "", globalWorldview: "",
  });
  const [busy, setBusy] = useState<null | "master" | "chapters" | "refine-master" | string /* refine-card-<id> */>(null);
  const [error, setError] = useState<string | null>(null);
  const [refineIntent, setRefineIntent] = useState("");
  const [cardRefineIntents, setCardRefineIntents] = useState<Record<string, string>>({});
  const [cardUndoSnapshots, setCardUndoSnapshots] = useState<Record<string, string>>({});
  const [genTargetCount, setGenTargetCount] = useState(12);
  const [chapterDraft, setChapterDraft] = useState<ChapterDraftState | null>(null);
  const [candidateCount, setCandidateCount] = useState<1 | 2 | 3>(1);
  const [cardFilter, setCardFilter] = useState<"all" | "unwritten" | "written">("all");
  const [cardSearch, setCardSearch] = useState("");
  const [selectedSampleLibIds, setSelectedSampleLibIds] = useState<string[]>([]);

  const outlineStats = useMemo(() => {
    const written = outlineCards.filter((c) => c.chapterId).length;
    const qualitySum = outlineCards.reduce((sum, card) => sum + getCardQuality(card).score, 0);
    return {
      total: outlineCards.length,
      written,
      unwritten: outlineCards.length - written,
      averageQuality: outlineCards.length ? Math.round(qualitySum / outlineCards.length) : 0,
    };
  }, [outlineCards]);
  const metaCompleteness = useMemo(() => getMetaCompleteness(project), [project]);

  const visibleCards = useMemo(() => {
    const keyword = cardSearch.trim().toLowerCase();
    return outlineCards.filter((card) => {
      if (cardFilter === "written" && !card.chapterId) return false;
      if (cardFilter === "unwritten" && card.chapterId) return false;
      if (!keyword) return true;
      return (
        card.title.toLowerCase().includes(keyword) ||
        card.content.toLowerCase().includes(keyword)
      );
    });
  }, [cardFilter, cardSearch, outlineCards]);

  // Sync meta draft when project changes
  useEffect(() => {
    if (project) {
      setMetaDraft({
        synopsis: project.synopsis,
        genre: project.genre,
        subGenre: project.subGenre,
        tags: project.tags.join(", "),
        globalWorldview: project.globalWorldview,
      });
    }
  }, [project?.id]);

  const updateMeta = useMutation({
    mutationFn: outlineGenApi.updateProjectMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects-list-for-outline"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const undoRefine = useMutation({
    mutationFn: outlineGenApi.undoRefine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects-list-for-outline"] });
    },
  });

  const canGenerateMaster =
    !!project && (
      !!project.synopsis.trim() ||
      !!project.genre.trim() ||
      project.tags.length > 0 ||
      !!project.globalWorldview.trim()
    );
  const masterWordCount = project ? countNonWhitespace(project.masterOutline) : 0;

  const handleOpenMeta = useCallback(() => setMetaOpen(true), []);
  const handleCloseMeta = useCallback(() => setMetaOpen(false), []);
  const handleCloseChapterDraft = useCallback(() => setChapterDraft(null), []);
  const handleClearError = useCallback(() => setError(null), []);
  const handleMetaDraftChange = useCallback((patch: Partial<ProjectMetaDraft>) => {
    setMetaDraft((draft) => ({ ...draft, ...patch }));
  }, []);

  const handleCardRefineIntentChange = useCallback((cardId: string, value: string) => {
    setCardRefineIntents((prev) => ({ ...prev, [cardId]: value }));
  }, []);

  useEffect(() => {
    if (!outlineFocusCardId) return;
    if (!outlineCards.some((card) => card.id === outlineFocusCardId)) return;
    setCardFilter("all");
    setCardSearch("");
  }, [outlineCards, outlineFocusCardId]);

  useEffect(() => {
    if (!outlineFocusCardId) return;
    const handle = window.setTimeout(() => {
      cardRefs.current[outlineFocusCardId]?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 80);
    const clearHandle = window.setTimeout(() => {
      setOutlineFocusCard(null);
    }, 2800);
    return () => {
      window.clearTimeout(handle);
      window.clearTimeout(clearHandle);
    };
  }, [outlineFocusCardId, setOutlineFocusCard, visibleCards]);

  const handleSaveMeta = useCallback(async () => {
    if (!projectId) return;
    setBusy("master");
    try {
      await updateMeta.mutateAsync({
        projectId,
        synopsis: metaDraft.synopsis.trim(),
        genre: metaDraft.genre.trim(),
        subGenre: metaDraft.subGenre.trim(),
        tags: metaDraft.tags.split(/[,，、\n]/).map((t) => t.trim()).filter(Boolean),
        globalWorldview: metaDraft.globalWorldview.trim(),
      });
      setMetaOpen(false);
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [metaDraft, projectId, updateMeta]);

  const handleGenerateMaster = useCallback(async () => {
    if (!projectId) return;
    setBusy("master");
    setError(null);
    try {
      await outlineGenApi.generateMaster({ projectId });
      queryClient.invalidateQueries({ queryKey: ["projects-list-for-outline"] });
    } catch (e) {
      setError(friendlyErrorMessage(e, "生成总纲失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [projectId, queryClient]);

  const handleGenerateChapters = useCallback(async () => {
    if (!projectId) return;
    setBusy("chapters");
    setError(null);
    try {
      await outlineGenApi.generateChapters({ projectId, targetCount: genTargetCount, replaceExisting: true });
      queryClient.invalidateQueries({ queryKey: ["outline-cards"] });
    } catch (e) {
      setError(friendlyErrorMessage(e, "生成章节卡失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [genTargetCount, projectId, queryClient]);

  const handleRefineMaster = useCallback(async () => {
    if (!projectId) return;
    if (!refineIntent.trim()) return;
    setBusy("refine-master");
    setError(null);
    try {
      await outlineGenApi.refine({
        target: { kind: "master", projectId },
        intent: refineIntent.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["projects-list-for-outline"] });
      setRefineIntent("");
    } catch (e) {
      setError(friendlyErrorMessage(e, "优化总纲失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [projectId, queryClient, refineIntent]);

  const handleUndoMaster = useCallback(async () => {
    if (!projectId) return;
    setBusy("refine-master");
    try {
      await undoRefine.mutateAsync({ projectId });
    } catch (e) {
      setError(friendlyErrorMessage(e, "撤销优化失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [projectId, undoRefine]);

  const handleRefineCard = useCallback(async (card: OutlineCardRecord) => {
    const intent = cardRefineIntents[card.id]?.trim();
    if (!intent) return;
    setBusy(`refine-card-${card.id}`);
    setError(null);
    try {
      // Save current content for undo before mutating
      setCardUndoSnapshots((prev) => ({ ...prev, [card.id]: card.content }));
      await outlineGenApi.refine({
        target: { kind: "card", cardId: card.id },
        intent,
      });
      queryClient.invalidateQueries({ queryKey: ["outline-cards"] });
      setCardRefineIntents((prev) => ({ ...prev, [card.id]: "" }));
    } catch (e) {
      setError(friendlyErrorMessage(e, "优化大纲卡失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [cardRefineIntents, queryClient]);

  const handleUndoCard = useCallback(async (card: OutlineCardRecord) => {
    const snap = cardUndoSnapshots[card.id];
    if (!snap) return;
    await outlineApi.update({ id: card.id, content: snap });
    setCardUndoSnapshots((prev) => {
      const next = { ...prev };
      delete next[card.id];
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["outline-cards"] });
  }, [cardUndoSnapshots, queryClient]);

  const handleGenerateChapter = useCallback(async (card: OutlineCardRecord) => {
    if (!projectId) return;
    setBusy(`gen-chapter-${card.id}`);
    setError(null);
    try {
      let prevChapterId: string | undefined;
      for (let index = outlineCards.length - 1; index >= 0; index -= 1) {
        const item = outlineCards[index];
        if (!item) continue;
        if (item.chapterId && item.order < card.order) {
          prevChapterId = item.chapterId;
          break;
        }
      }
      const res = await chapterGenApi.fromOutline({
        projectId,
        outlineCardId: card.id,
        candidates: candidateCount,
        prevChapterId,
        sampleLibIds: selectedSampleLibIds.length > 0 ? selectedSampleLibIds : undefined,
      });
      setChapterDraft({
        cardId: card.id,
        cardTitle: res.outlineTitle,
        candidates: res.candidates,
      });
    } catch (e) {
      setError(friendlyErrorMessage(e, "生成章节失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [candidateCount, projectId, outlineCards, selectedSampleLibIds]);

  const handleAdoptCandidate = useCallback(async (text: string) => {
    if (!projectId || !chapterDraft) return;
    try {
      const result = await chapterGenApi.commitDraft({
        projectId,
        text,
        title: chapterDraft.cardTitle,
        outlineCardId: chapterDraft.cardId,
      });
      queryClient.invalidateQueries({ queryKey: ["chapters"] });
      queryClient.invalidateQueries({ queryKey: ["outline-cards"] });
      setChapterDraft((draft) =>
        draft
          ? {
              ...draft,
              committedChapterId: result.chapterId,
              committedWordCount: result.wordCount,
            }
          : draft,
      );
    } catch (e) {
      setError(friendlyErrorMessage(e, "采用草稿失败，请稍后重试。"));
    }
  }, [chapterDraft, projectId, queryClient]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-900/60 text-ink-300">
        <div className="max-w-md rounded-lg border border-ink-700 bg-ink-800/60 p-6 text-center">
          <div className="mb-2 text-lg text-accent-300">📋 大纲生成</div>
          <p className="text-sm">请先选择或创建一个项目。</p>
        </div>
      </div>
    );
  }
  if (!project) return <div className="p-6 text-ink-400">加载项目元数据…</div>;

  return (
    <div className="flex h-full w-full flex-col bg-ink-900 text-ink-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-900/95 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{project.name} · 大纲工作台</h1>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-500">
            <span>基础 {metaCompleteness.done}/{metaCompleteness.total}</span>
            <span>总纲 {masterWordCount} 字</span>
            <span>章节 {outlineStats.total}</span>
            {outlineStats.total > 0 ? <span>厚度 {outlineStats.averageQuality}/10</span> : null}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 transition-colors hover:bg-ink-800"
            onClick={handleOpenMeta}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {project.synopsis || project.genre || project.globalWorldview ? "编辑设定" : "填写设定"}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-900 transition-colors hover:bg-accent-400 disabled:opacity-50"
            disabled={busy !== null || !canGenerateMaster}
            onClick={handleGenerateMaster}
            title={!canGenerateMaster ? "先补充梗概、类型、标签或背景语境" : undefined}
          >
            {busy === "master" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {project.masterOutline ? "重写总纲" : "生成总纲"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            className="rounded p-0.5 text-ink-400 transition-colors hover:bg-red-500/10 hover:text-ink-200"
            onClick={handleClearError}
            aria-label="关闭错误提示"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <main className="flex flex-1 overflow-hidden">
        {/* Left: master outline */}
        <section className="w-[46%] min-w-[420px] shrink-0 overflow-y-auto border-r border-ink-700 bg-ink-900 p-4">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <OutlineStatusTile
              icon={<FileText className="h-4 w-4" />}
              label="基础信息"
              value={`${metaCompleteness.percent}%`}
              active={metaCompleteness.percent >= 75}
            />
            <OutlineStatusTile
              icon={<BookOpenCheck className="h-4 w-4" />}
              label="总大纲"
              value={project.masterOutline ? `${masterWordCount} 字` : "未生成"}
              active={!!project.masterOutline}
            />
            <OutlineStatusTile
              icon={<Layers3 className="h-4 w-4" />}
              label="章节卡"
              value={outlineStats.total ? `${outlineStats.total} 张` : "未拆分"}
              active={outlineStats.total > 0}
            />
          </div>

          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-accent-300" />
              总大纲
            </h2>
            <button
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
              disabled={busy !== null || !canGenerateMaster}
              onClick={handleGenerateMaster}
            >
              {busy === "master" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {busy === "master" ? "生成中" : project.masterOutline ? "重新生成" : "生成总纲"}
            </button>
          </div>

          {project.masterOutline ? (
            <pre className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-ink-700 bg-ink-800/35 p-4 text-xs leading-6 text-ink-200 scrollbar-thin">
              {project.masterOutline}
            </pre>
          ) : (
            <div className="rounded-md border border-dashed border-ink-700 bg-ink-800/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0 text-xs leading-6 text-ink-400">
                  <div className="font-medium text-ink-200">总纲还没成形</div>
                  <div>至少补一项可生成。散文和现实题材可以不填世界观；留空时默认按真实世界、当下社会或梗概里指向的年代处理。</div>
                </div>
              </div>
            </div>
          )}

          {project.masterOutline ? (
            <div className="mt-4 space-y-2 rounded-md border border-ink-700 bg-ink-800/25 p-3">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink-300">
                <PenLine className="h-3.5 w-3.5" />
                优化总大纲
              </h3>
              <textarea
                className="h-20 w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-2.5 py-2 text-xs leading-5 text-ink-100 placeholder:text-ink-500 focus:border-accent-500/70 focus:outline-none"
                placeholder="例：开端慢一点；把天竺山写成游记散文气质；每幕增加一个可落笔场景"
                value={refineIntent}
                onChange={(e) => setRefineIntent(e.target.value)}
                maxLength={500}
              />
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
                  disabled={busy !== null || !refineIntent.trim()}
                  onClick={handleRefineMaster}
                >
                  {busy === "refine-master" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {busy === "refine-master" ? "优化中" : "模型优化"}
                </button>
                {project.preRefineMasterOutline ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs hover:bg-ink-700 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={handleUndoMaster}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    撤销
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {/* Right: chapter outline cards */}
        <section className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-900 px-3 py-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Layers3 className="h-4 w-4 text-accent-300" />
              章节大纲卡
            </h2>
            <div className="hidden items-center gap-1 text-[11px] text-ink-500 lg:flex">
              <span>{outlineStats.total} 张</span>
              <span>·</span>
              <span>{outlineStats.unwritten} 待写</span>
              {outlineStats.total > 0 ? (
                <>
                  <span>·</span>
                  <span>厚度 {outlineStats.averageQuality}/10</span>
                </>
              ) : null}
            </div>
            <label className="ml-auto flex items-center gap-1 text-xs text-ink-400">
              目标章数
              <input
                type="number"
                aria-label="目标章数"
                min={3}
                max={50}
                step={1}
                className="w-14 rounded-md border border-ink-600 bg-ink-900 px-2 py-0.5 text-xs"
                value={genTargetCount}
                onChange={(e) => setGenTargetCount(Number(e.target.value) || 12)}
              />
            </label>
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-50"
              disabled={busy !== null || !project.masterOutline}
              onClick={handleGenerateChapters}
              title={!project.masterOutline ? "先生成总大纲" : undefined}
            >
              {busy === "chapters" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {busy === "chapters" ? "拆分中" : "拆分章节"}
            </button>
            <label className="ml-2 flex items-center gap-1 text-xs text-ink-400" title="生成正文时并发候选数">
              候选
              <select
                className="rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-xs text-ink-100"
                value={candidateCount}
                onChange={(e) => setCandidateCount(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-b border-ink-700/70 bg-ink-900/70 px-3 py-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
              <input
                type="search"
                aria-label="搜索章名或大纲内容"
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-ink-700 bg-ink-900 py-1 pl-7 pr-2 text-xs text-ink-100 placeholder:text-ink-500 focus:border-accent-500/70 focus:outline-none"
                placeholder="搜索章名 / 大纲内容"
              />
            </div>
            <select
              aria-label="筛选大纲卡"
              value={cardFilter}
              onChange={(e) => setCardFilter(e.target.value as typeof cardFilter)}
              className="h-8 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-ink-100"
            >
              <option value="all">全部</option>
              <option value="unwritten">待写</option>
              <option value="written">已写</option>
            </select>
          </div>

          {sampleLibs.length > 0 ? (
            <div className="shrink-0 border-b border-ink-700/70 bg-ink-900/55 px-3 py-2">
              <SampleReferencePicker
                libs={sampleLibs}
                selectedIds={selectedSampleLibIds}
                onChange={setSelectedSampleLibIds}
                disabled={busy !== null}
              />
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {outlineCards.length > 0 && (
              <BulkChapterGenerator
                projectId={projectId}
                cards={outlineCards}
                sampleLibIds={selectedSampleLibIds}
              />
            )}
            {outlineCards.length === 0 ? (
              <div className="rounded-md border border-dashed border-ink-700 bg-ink-800/20 p-5 text-xs leading-6 text-ink-500">
                <div className="mb-1 flex items-center gap-2 font-medium text-ink-200">
                  <Layers3 className="h-4 w-4 text-accent-300" />
                  还没有章节卡
                </div>
                <div>生成总纲后点击「拆分章节」。新的章节卡会包含章节功能、关键场景、情绪层次和结尾钩子。</div>
              </div>
            ) : visibleCards.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-700 p-4 text-xs text-ink-500">
                没有匹配的大纲卡。
              </p>
            ) : (
              visibleCards.map((card) => (
                <div
                  key={card.id}
                  ref={(node) => {
                    cardRefs.current[card.id] = node;
                  }}
                >
                  <OutlineCardItem
                    card={card}
                    busy={busy}
                    candidateCount={candidateCount}
                    linkedChapter={card.chapterId ? chaptersById.get(card.chapterId) ?? null : null}
                    highlighted={outlineFocusCardId === card.id}
                    refineIntent={cardRefineIntents[card.id] ?? ""}
                    canUndo={!!cardUndoSnapshots[card.id]}
                    onGenerate={handleGenerateChapter}
                    onRefine={handleRefineCard}
                    onUndo={handleUndoCard}
                    onRefineIntentChange={handleCardRefineIntentChange}
                    onOpenChapter={flowActions.openChapter}
                    onReviewChapter={flowActions.reviewChapter}
                    onAutoWriteChapter={flowActions.autoWriteChapter}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {metaOpen ? (
        <ProjectMetaDialog
          draft={metaDraft}
          busy={busy}
          completeness={metaCompleteness}
          onChange={handleMetaDraftChange}
          onClose={handleCloseMeta}
          onSave={handleSaveMeta}
        />
      ) : null}

      {chapterDraft ? (
        <ChapterDraftDialog
          draft={chapterDraft}
          onClose={handleCloseChapterDraft}
          onAdopt={handleAdoptCandidate}
          onOpenChapter={flowActions.openChapter}
          onReviewChapter={flowActions.reviewChapter}
          onAutoWriteChapter={flowActions.autoWriteChapter}
        />
      ) : null}
    </div>
  );
}
