// C12: Timeline service — aggregates chapters, summaries, outline cards, and events
import {
  listChapterLogEntries,
  listChapterSummariesByProject,
  listChapters,
  listOutlines,
  listTimelineEvents,
} from "@inkforge/storage";
import type { ChapterLogEntryRecord, ChapterSummaryRecord, TimelineChapterNode, TimelineOutlineCard, TimelineView } from "@inkforge/shared";
import { getAppContext } from "./app-state";

function parseSectionsSimple(content: string): Array<{ label: string; body: string }> {
  if (!content) return [];
  const sections: Array<{ label: string; body: string }> = [];
  const lines = content.split(/\n/);
  let current: { label: string; body: string } | null = null;
  for (const line of lines) {
    const h = line.match(/^#{2,3}\s+(.+)/);
    if (h) {
      if (current && current.body) sections.push(current);
      current = { label: h[1].trim(), body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current && current.body) sections.push(current);
  return sections.length > 0 ? sections : [{ label: "正文", body: content }];
}

export function buildTimelineView(projectId: string): TimelineView {
  const ctx = getAppContext();

  const chapters = listChapters(ctx.db, projectId).sort((a, b) => a.order - b.order);
  const outlineCards = listOutlines(ctx.db, projectId);
  const summaries = listChapterSummariesByProject(ctx.db, projectId);
  const events = listTimelineEvents(ctx.db, projectId);

  const summaryMap = new Map<string, string>();
  for (const s of summaries) {
    if (!summaryMap.has(s.chapterId)) summaryMap.set(s.chapterId, s.summary);
  }

  const outlineByChapter = new Map<string, TimelineOutlineCard[]>();
  for (const card of outlineCards) {
    if (!card.chapterId) continue;
    const list = outlineByChapter.get(card.chapterId) ?? [];
    list.push({
      id: card.id,
      title: card.title,
      sections: parseSectionsSimple(card.content),
    });
    outlineByChapter.set(card.chapterId, list);
  }

  const chapterNodes: TimelineChapterNode[] = chapters.map((ch) => {
    const logEntries = listChapterLogEntries(ctx.db, ch.id);
    const hasAi = logEntries.some((e) => e.kind === "ai-run");
    const hasManual = logEntries.some((e) => e.kind === "manual");
    const origin: TimelineChapterNode["origin"] = hasAi && hasManual ? "hybrid" : hasAi ? "ai" : "manual";

    return {
      id: ch.id,
      order: ch.order,
      title: ch.title,
      wordCount: ch.wordCount,
      status: ch.status,
      updatedAt: ch.updatedAt,
      summary: summaryMap.get(ch.id) ?? null,
      outlineCards: outlineByChapter.get(ch.id) ?? [],
      origin,
    };
  });

  return { chapters: chapterNodes, events };
}
