// C12: Timeline/Plot visualization page - chapter sequence + plot events
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import type { TimelineChapterNode, TimelineEventRecord } from "@inkforge/shared";
import { timelineApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
import { fadeOnly, staggerContainer, staggerItem } from "../lib/motion-tokens";
import { Badge, Button } from "../components/ui";

const ORIGIN_LABEL: Record<TimelineChapterNode["origin"], { zh: string; cls: string }> = {
  ai: { zh: "模型", cls: "bg-violet-500/15 text-violet-300 ring-violet-500/25" },
  manual: { zh: "手动", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25" },
  hybrid: { zh: "协作", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/25" },
};

const CATEGORY_COLORS: Record<TimelineEventRecord["category"], string> = {
  plot_point: "#60a5fa",
  character_entrance: "#34d399",
  reveal: "#f472b6",
  climax: "#f87171",
  resolution: "#a78bfa",
  flashback: "#fbbf24",
  timeskip: "#38bdf8",
  custom: "#94a3b8",
};

const CATEGORY_LABELS: Record<TimelineEventRecord["category"], string> = {
  plot_point: "情节点",
  character_entrance: "人物登场",
  reveal: "揭示",
  climax: "高潮",
  resolution: "结局",
  flashback: "闪回",
  timeskip: "时间跳跃",
  custom: "自定义",
};

const EMPTY_EVENT_FORM = {
  title: "",
  description: "",
  category: "plot_point" as TimelineEventRecord["category"],
  color: "",
  chapterId: "",
};

function excerpt(text: string | null | undefined, max = 96): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function statusLabel(status: string): string {
  if (status === "complete") return "已完成";
  if (status === "draft") return "草稿";
  return "写作中";
}

export function TimelinePage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const t = useT();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ ...EMPTY_EVENT_FORM });
  const [editEventId, setEditEventId] = useState<string | null>(null);

  const viewQuery = useQuery({
    queryKey: ["timeline-view", projectId],
    queryFn: () => (projectId ? timelineApi.getView(projectId) : Promise.resolve(null)),
    enabled: !!projectId,
  });

  const resetEventForm = () => {
    setEditEventId(null);
    setEventForm({ ...EMPTY_EVENT_FORM });
  };

  const upsertMut = useMutation({
    mutationFn: (input: Parameters<typeof timelineApi.upsertEvent>[0]) => timelineApi.upsertEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline-view", projectId] });
      setShowAddEvent(false);
      resetEventForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => timelineApi.deleteEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timeline-view", projectId] }),
  });

  const data = viewQuery.data;
  const chapters = data?.chapters ?? [];
  const events = data?.events ?? [];

  const eventsByChapter = useMemo(() => {
    const map = new Map<string | null, TimelineEventRecord[]>();
    for (const event of events) {
      const key = event.chapterId ?? null;
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0] ?? null;
  const selectedEvents = selectedChapter ? eventsByChapter.get(selectedChapter.id) ?? [] : [];
  const unlinkedEvents = eventsByChapter.get(null) ?? [];
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  const completeCount = chapters.filter((chapter) => chapter.status === "complete").length;

  const startEventEdit = (event: TimelineEventRecord) => {
    setEventForm({
      title: event.title,
      description: event.description,
      category: event.category,
      color: event.color ?? "",
      chapterId: event.chapterId ?? "",
    });
    setEditEventId(event.id);
    setShowAddEvent(true);
  };

  const saveEvent = () => {
    if (!projectId || !eventForm.title.trim()) return;
    upsertMut.mutate({
      id: editEventId ?? undefined,
      projectId,
      title: eventForm.title.trim(),
      description: eventForm.description.trim(),
      category: eventForm.category,
      color: eventForm.color || null,
      chapterId: eventForm.chapterId || null,
      eventOrder: editEventId ? undefined : events.length,
    });
  };

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-950 text-sm text-ink-400">
        请先在写作视图选择一本书。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-700 px-4 py-3">
        <GitBranch className="h-5 w-5 text-accent-300" aria-hidden="true" />
        <h1 className="text-sm font-semibold text-ink-100">
          {t ? t("nav.timeline") : "时间线"} · {chapters.length} 章
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone="neutral">{events.length} 事件</Badge>
          <Button
            size="sm"
            variant="accentSoft"
            onClick={() => {
              if (showAddEvent) resetEventForm();
              setShowAddEvent((value) => !value);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {showAddEvent ? "取消" : "加事件"}
          </Button>
        </div>
      </header>

      {showAddEvent ? (
        <div className="shrink-0 border-b border-ink-700 bg-ink-900/70 px-4 py-3">
          <div className="grid gap-2 md:grid-cols-[minmax(140px,180px)_minmax(180px,1fr)_140px_160px_40px_auto]">
            <label className="sr-only" htmlFor="timeline-event-title">事件标题</label>
            <input
              id="timeline-event-title"
              className="h-8 rounded border border-ink-600 bg-ink-900 px-2 text-xs text-ink-100 focus:border-accent-500 focus:outline-none"
              placeholder="事件标题"
              value={eventForm.title}
              onChange={(event) => setEventForm((form) => ({ ...form, title: event.target.value }))}
            />
            <label className="sr-only" htmlFor="timeline-event-description">描述</label>
            <input
              id="timeline-event-description"
              className="h-8 rounded border border-ink-600 bg-ink-900 px-2 text-xs text-ink-100 focus:border-accent-500 focus:outline-none"
              placeholder="描述（可选）"
              value={eventForm.description}
              onChange={(event) => setEventForm((form) => ({ ...form, description: event.target.value }))}
            />
            <label className="sr-only" htmlFor="timeline-event-category">事件类型</label>
            <select
              id="timeline-event-category"
              className="h-8 rounded border border-ink-600 bg-ink-900 px-2 text-xs text-ink-100 focus:border-accent-500 focus:outline-none"
              value={eventForm.category}
              onChange={(event) => setEventForm((form) => ({ ...form, category: event.target.value as TimelineEventRecord["category"] }))}
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="timeline-event-chapter">关联章节</label>
            <select
              id="timeline-event-chapter"
              className="h-8 rounded border border-ink-600 bg-ink-900 px-2 text-xs text-ink-100 focus:border-accent-500 focus:outline-none"
              value={eventForm.chapterId}
              onChange={(event) => setEventForm((form) => ({ ...form, chapterId: event.target.value }))}
            >
              <option value="">关联章节（可选）</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="timeline-event-color">事件颜色</label>
            <input
              id="timeline-event-color"
              type="color"
              className="h-8 w-10 rounded border border-ink-600 bg-ink-900 p-0.5"
              value={eventForm.color || CATEGORY_COLORS[eventForm.category]}
              onChange={(event) => setEventForm((form) => ({ ...form, color: event.target.value }))}
              aria-label="事件颜色"
            />
            <Button
              size="sm"
              variant="primary"
              className="h-8"
              disabled={!eventForm.title.trim() || upsertMut.isPending}
              onClick={saveEvent}
            >
              {upsertMut.isPending ? "保存中..." : editEventId ? "更新" : "保存"}
            </Button>
          </div>
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-auto p-4 lg:p-5">
        {chapters.length === 0 ? (
          <div className="flex h-full min-h-72 items-center justify-center rounded-lg border border-dashed border-ink-700 bg-ink-900/40 text-sm text-ink-500">
            暂无章节，去写作页创建吧
          </div>
        ) : (
          <div className="grid min-h-[520px] gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 rounded-lg border border-ink-700 bg-ink-900/45 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-semibold text-ink-200">章节轨道</h2>
                <Badge tone="neutral">{totalWords.toLocaleString()} 字</Badge>
                <Badge tone={completeCount === chapters.length ? "success" : "warning"}>{completeCount}/{chapters.length} 已完成</Badge>
              </div>

              <div className="mt-4 overflow-x-auto pb-3">
                <motion.div
                  className="flex min-w-max items-stretch gap-3"
                  variants={reduce ? fadeOnly : staggerContainer}
                  initial="initial"
                  animate="animate"
                >
                  {chapters.map((chapter, index) => {
                    const chapterEvents = eventsByChapter.get(chapter.id) ?? [];
                    const selected = selectedChapter?.id === chapter.id;
                    return (
                      <div key={chapter.id} className="flex items-center gap-3">
                        <ChapterCard
                          chapter={chapter}
                          index={index}
                          events={chapterEvents}
                          selected={selected}
                          reduce={reduce === true}
                          onSelect={() => setSelectedChapterId(chapter.id)}
                        />
                        {index < chapters.length - 1 ? <div className="h-px w-9 shrink-0 bg-ink-700" aria-hidden="true" /> : null}
                      </div>
                    );
                  })}
                </motion.div>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {selectedChapter ? (
                  <motion.div
                    key={selectedChapter.id}
                    className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]"
                    initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                  >
                  <div className="rounded-lg border border-ink-700 bg-ink-800/35 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-ink-500">当前章节</p>
                        <h3 className="mt-1 truncate text-sm font-semibold text-ink-100">{selectedChapter.title}</h3>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${ORIGIN_LABEL[selectedChapter.origin].cls}`}>
                        {ORIGIN_LABEL[selectedChapter.origin].zh}
                      </span>
                    </div>
                    <p className="mt-3 min-h-16 text-xs leading-5 text-ink-300">
                      {selectedChapter.summary ? excerpt(selectedChapter.summary, 180) : "暂无章节摘要。"}
                    </p>
                    {selectedChapter.outlineCards.length > 0 ? (
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {selectedChapter.outlineCards.slice(0, 4).map((card) => (
                          <div key={card.id} className="rounded border border-ink-700/80 bg-ink-900/50 p-2">
                            <p className="truncate text-[11px] font-medium text-ink-200">{card.title}</p>
                            <p className="mt-1 h-10 overflow-hidden text-[10px] leading-5 text-ink-400">
                              {excerpt(card.sections.map((section) => section.body).join(" "), 82) || "暂无内容"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-ink-700 bg-ink-800/35 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-ink-200">本章事件</h3>
                      <Badge tone="neutral">{selectedEvents.length}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedEvents.length > 0 ? selectedEvents.map((event) => (
                        <EventRow
                          key={event.id}
                          event={event}
                          onDelete={(id) => deleteMut.mutate(id)}
                          onEdit={startEventEdit}
                        />
                      )) : <p className="rounded border border-dashed border-ink-700 px-3 py-5 text-center text-xs text-ink-500">本章还没有事件</p>}
                    </div>
                  </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>

            <aside className="min-h-0 rounded-lg border border-ink-700 bg-ink-900/45 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-ink-200">事件总览</h2>
                <Badge tone="neutral">{events.length}</Badge>
              </div>
              <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
                {events.length > 0 ? events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    chapterTitle={chapters.find((chapter) => chapter.id === event.chapterId)?.title ?? (event.chapterId ? "已关联章节" : "未关联")}
                    onDelete={(id) => deleteMut.mutate(id)}
                    onEdit={startEventEdit}
                  />
                )) : (
                  <div className="rounded-lg border border-dashed border-ink-700 px-3 py-8 text-center text-xs text-ink-500">
                    还没有时间线事件
                  </div>
                )}
              </div>
              {unlinkedEvents.length > 0 ? (
                <div className="mt-4 border-t border-ink-700 pt-3">
                  <div className="mb-2 text-[11px] font-medium text-ink-500">未关联事件</div>
                  <div className="space-y-2">
                    {unlinkedEvents.map((event) => (
                      <EventRow key={event.id} event={event} onDelete={(id) => deleteMut.mutate(id)} onEdit={startEventEdit} />
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function ChapterCard({
  chapter,
  index,
  events,
  selected,
  reduce,
  onSelect,
}: {
  chapter: TimelineChapterNode;
  index: number;
  events: TimelineEventRecord[];
  selected: boolean;
  reduce: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <motion.button
      type="button"
      variants={reduce ? fadeOnly : staggerItem}
      className={`relative flex h-40 w-56 shrink-0 flex-col overflow-hidden rounded-lg border p-3 text-left shadow-sm transition-[background-color,border-color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 ${
        selected
          ? "border-ink-600 bg-ink-800/70 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.55)]"
          : "border-ink-700 bg-ink-800/35 hover:border-ink-600 hover:bg-ink-800/55 hover:shadow-[0_12px_28px_-24px_rgba(15,23,42,0.55)]"
      }`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {selected ? <span className="pointer-events-none absolute inset-x-3 top-2 h-0.5 rounded-full bg-sky-400/70" aria-hidden="true" /> : null}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] font-medium text-ink-500">第 {index + 1} 章</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${ORIGIN_LABEL[chapter.origin].cls}`}>
          {ORIGIN_LABEL[chapter.origin].zh}
        </span>
      </div>
      <h3 className="mt-3 h-10 overflow-hidden text-sm font-semibold leading-5 text-ink-100">{chapter.title}</h3>
      <p className="mt-2 h-9 overflow-hidden text-[11px] leading-[18px] text-ink-400">
        {chapter.summary ? excerpt(chapter.summary, 62) : `${chapter.wordCount.toLocaleString()} 字 · ${statusLabel(chapter.status)}`}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-[10px] text-ink-500">{chapter.wordCount.toLocaleString()} 字</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${chapter.status === "complete" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
          {statusLabel(chapter.status)}
        </span>
      </div>
      {events.length > 0 ? (
        <div className="mt-2 flex gap-1 overflow-hidden">
          {events.slice(0, 3).map((event) => (
            <span
              key={event.id}
              className="h-1.5 w-6 shrink-0 rounded-full"
              title={event.title}
              style={{ backgroundColor: event.color || CATEGORY_COLORS[event.category] }}
            />
          ))}
        </div>
      ) : null}
    </motion.button>
  );
}

function EventRow({
  event,
  chapterTitle,
  onDelete,
  onEdit,
}: {
  event: TimelineEventRecord;
  chapterTitle?: string;
  onDelete: (id: string) => void;
  onEdit: (event: TimelineEventRecord) => void;
}): JSX.Element {
  const eventColor = event.color || CATEGORY_COLORS[event.category] || "#94a3b8";
  return (
    <div className="group rounded-lg border border-ink-700 bg-ink-800/35 p-3" style={{ borderLeft: `3px solid ${eventColor}` }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate text-xs font-medium text-ink-100">{event.title}</span>
            <span className="rounded-full bg-ink-700 px-1.5 py-0.5 text-[9px] text-ink-300">{CATEGORY_LABELS[event.category]}</span>
          </div>
          {event.description ? <p className="mt-1 text-[11px] leading-5 text-ink-400">{excerpt(event.description, 92)}</p> : null}
          {chapterTitle ? <p className="mt-1 truncate text-[10px] text-ink-500">{chapterTitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
            onClick={() => onEdit(event)}
            aria-label={`编辑事件：${event.title}`}
            title="编辑"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
            onClick={() => onDelete(event.id)}
            aria-label={`删除事件：${event.title}`}
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
