// C12: Timeline/Plot visualization page — horizontal chapter sequence + plot events
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { GitBranch, Plus, X } from "lucide-react";
import type { TimelineChapterNode, TimelineEventRecord } from "@inkforge/shared";
import { timelineApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
import { fadeOnly, fadeSlideUp, staggerContainer, staggerItem } from "../lib/motion-tokens";
import { Badge, Button, Card } from "../components/ui";

const ORIGIN_LABEL: Record<TimelineChapterNode["origin"], { zh: string; cls: string }> = {
  ai: { zh: "AI", cls: "bg-violet-500/15 text-violet-300" },
  manual: { zh: "手动", cls: "bg-emerald-500/15 text-emerald-300" },
  hybrid: { zh: "混合", cls: "bg-amber-500/15 text-amber-300" },
};

const CATEGORY_COLORS: Record<string, string> = {
  plot_point: "#60a5fa", character_entrance: "#34d399",
  reveal: "#f472b6", climax: "#f87171", resolution: "#a78bfa",
  flashback: "#fbbf24", timeskip: "#38bdf8", custom: "#94a3b8",
};

export function TimelinePage(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const t = useT();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", description: "", category: "plot_point", color: "", chapterId: "" });
  const [editEventId, setEditEventId] = useState<string | null>(null);

  const viewQuery = useQuery({
    queryKey: ["timeline-view", projectId],
    queryFn: () => (projectId ? timelineApi.getView(projectId) : Promise.resolve(null)),
    enabled: !!projectId,
  });

  const upsertMut = useMutation({
    mutationFn: (input: Parameters<typeof timelineApi.upsertEvent>[0]) => timelineApi.upsertEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline-view", projectId] });
      setShowAddEvent(false);
      setEditEventId(null);
      setEventForm({ title: "", description: "", category: "plot_point", color: "", chapterId: "" });
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
    for (const e of events) {
      const key = e.chapterId ?? null;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-950 text-ink-400 text-sm">
        请先在写作视图选择一本书。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-700 px-4 py-3">
        <GitBranch className="h-5 w-5 text-accent-300" />
        <h1 className="text-sm font-semibold text-ink-100">
          {t ? t("nav.timeline") : "时间线"} · {chapters.length} 章
        </h1>
        <Button size="sm" variant="accentSoft" className="ml-auto" onClick={() => setShowAddEvent((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> {showAddEvent ? "取消" : "加事件"}
        </Button>
      </header>

      {/* Inline event form */}
      {showAddEvent ? (
        <div className="shrink-0 border-b border-ink-700 bg-ink-900/60 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <input className="h-8 w-40 rounded border border-ink-600 bg-ink-900 px-2 text-xs text-ink-100" placeholder="事件标题"
              value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} />
            <input className="h-8 flex-1 rounded border border-ink-600 bg-ink-900 px-2 text-xs text-ink-100" placeholder="描述（可选）"
              value={eventForm.description} onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))} />
            <select className="h-8 rounded border border-ink-600 bg-ink-900 px-1 text-xs text-ink-100"
              value={eventForm.category} onChange={(e) => setEventForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="plot_point">情节点</option><option value="climax">高潮</option>
              <option value="reveal">揭示</option><option value="character_entrance">人物登场</option>
              <option value="flashback">闪回</option><option value="timeskip">时间跳跃</option>
              <option value="resolution">结局</option><option value="custom">自定义</option>
            </select>
            <select className="h-8 rounded border border-ink-600 bg-ink-900 px-1 text-xs text-ink-100"
              value={eventForm.chapterId} onChange={(e) => setEventForm((f) => ({ ...f, chapterId: e.target.value }))}>
              <option value="">关联章节（可选）</option>
              {chapters.map((ch) => (<option key={ch.id} value={ch.id}>{ch.title}</option>))}
            </select>
            <input type="color" className="h-8 w-8 rounded border border-ink-600 bg-ink-900 p-0.5" value={eventForm.color}
              onChange={(e) => setEventForm((f) => ({ ...f, color: e.target.value }))} />
            <Button size="sm" variant="primary" className="h-8" disabled={!eventForm.title.trim() || upsertMut.isPending}
              onClick={() => upsertMut.mutate({
                projectId, title: eventForm.title, description: eventForm.description,
                category: eventForm.category as TimelineEventRecord["category"],
                color: eventForm.color || null, chapterId: eventForm.chapterId || null,
                eventOrder: events.length,
              })}>
              {upsertMut.isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Timeline track */}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {chapters.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-ink-500">暂无章节，去写作页创建吧</div>
        ) : (
          <motion.div
            className="flex items-start gap-0 overflow-x-auto pb-8"
            variants={reduce ? fadeOnly : staggerContainer}
            initial="initial" animate="animate"
          >
            {chapters.map((ch, i) => {
              const chEvents = eventsByChapter.get(ch.id) ?? [];
              const expanded = expandedChapter === ch.id;
              return (
                <div key={ch.id} className="flex shrink-0 flex-col items-center">
                  {/* Chapter node */}
                  <motion.div
                    variants={reduce ? fadeOnly : staggerItem}
                    className={`group relative flex w-32 cursor-pointer flex-col items-center rounded-xl border p-3 transition-all ${
                      expanded ? "border-accent-500/60 bg-ink-800/60 ring-2 ring-accent-500/20" : "border-ink-700 bg-ink-900/60 hover:border-ink-500"
                    }`}
                    onClick={() => setExpandedChapter(expanded ? null : ch.id)}
                    whileHover={reduce ? undefined : { scale: 1.03 }}
                  >
                    {/* Origin tag */}
                    <span className={`absolute -top-2 right-2 rounded px-1 py-0 text-[9px] ${ORIGIN_LABEL[ch.origin].cls}`}>
                      {ORIGIN_LABEL[ch.origin].zh}
                    </span>
                    <span className="mt-1 max-w-full truncate text-xs font-semibold text-ink-100">{ch.title}</span>
                    <span className="mt-0.5 text-[10px] text-ink-500">{ch.wordCount.toLocaleString()} 字</span>
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full ${ch.status === "complete" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  </motion.div>

                  {/* Expanded detail */}
                  {expanded ? (
                    <motion.div variants={fadeSlideUp} initial="initial" animate="animate"
                      className="z-10 mt-2 w-56 rounded-lg border border-ink-700 bg-ink-900/95 p-3 shadow-xl">
                      {ch.summary ? <p className="mb-2 text-[11px] leading-5 text-ink-300">{ch.summary}</p> : null}
                      {ch.outlineCards.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-medium text-ink-500">大纲卡：</div>
                          {ch.outlineCards.map((card) => (
                            <details key={card.id} className="text-[10px]">
                              <summary className="cursor-pointer text-ink-400 hover:text-ink-200">{card.title}</summary>
                              {card.sections.map((s, si) => (
                                <div key={si} className="mt-1 pl-3">
                                  <span className="text-accent-400">{s.label}：</span>
                                  <span className="text-ink-400">{s.body.slice(0, 80)}{s.body.length > 80 ? "…" : ""}</span>
                                </div>
                              ))}
                            </details>
                          ))}
                        </div>
                      ) : null}
                    </motion.div>
                  ) : null}

                  {/* Connector to next */}
                  {i < chapters.length - 1 ? (
                    <div className="relative my-2 flex h-6 w-px items-center justify-center bg-ink-700">
                      {(eventsByChapter.get(null) ?? []).map((e) => (
                        <EventDiamond key={e.id} event={e} onDelete={(id) => deleteMut.mutate(id)}
                          onEdit={(e2) => { setEventForm({ title: e2.title, description: e2.description, category: e2.category, color: e2.color ?? "", chapterId: e2.chapterId ?? "" }); setEditEventId(e2.id); setShowAddEvent(true); }} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Unlinked events */}
        {(eventsByChapter.get(null) ?? []).length > 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ink-700 p-3">
            <div className="mb-2 text-xs text-ink-500">未关联事件</div>
            <div className="flex flex-wrap gap-2">
              {(eventsByChapter.get(null) ?? []).map((e) => (
                <EventDiamond key={e.id} event={e} onDelete={(id) => deleteMut.mutate(id)}
                  onEdit={(e2) => { setEventForm({ title: e2.title, description: e2.description, category: e2.category, color: e2.color ?? "", chapterId: e2.chapterId ?? "" }); setEditEventId(e2.id); setShowAddEvent(true); }} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EventDiamond({ event, onDelete, onEdit }: { event: TimelineEventRecord; onDelete: (id: string) => void; onEdit: (e: TimelineEventRecord) => void }): JSX.Element {
  return (
    <div className="group relative flex shrink-0 items-center gap-1 rounded border border-ink-700 bg-ink-800/60 px-2 py-1"
      style={{ borderLeft: `3px solid ${event.color || CATEGORY_COLORS[event.category] || "#94a3b8"}` }}>
      <span className="max-w-32 truncate text-[10px] text-ink-200">{event.title}</span>
      <span className="hidden gap-1 group-hover:flex">
        <button className="rounded px-1 text-[9px] text-ink-400 hover:bg-ink-700 hover:text-ink-200"
          onClick={() => onEdit(event)} title="编辑">✎</button>
        <button className="rounded px-1 text-[9px] text-red-400 hover:bg-red-500/20"
          onClick={() => onDelete(event.id)} title="删除">✕</button>
      </span>
    </div>
  );
}
