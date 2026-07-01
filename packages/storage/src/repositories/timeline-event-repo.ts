// C12: Timeline events CRUD
import { randomUUID } from "node:crypto";
import type { DB } from "../db";
import type { TimelineEventRecord, TimelineEventCreateInput } from "@inkforge/shared";

type Row = {
  id: string;
  project_id: string;
  chapter_id: string | null;
  title: string;
  description: string;
  event_order: number;
  color: string | null;
  category: string;
  created_at: string;
  updated_at: string;
};

function toRecord(row: Row): TimelineEventRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    title: row.title,
    description: row.description,
    eventOrder: row.event_order,
    color: row.color,
    category: row.category as TimelineEventRecord["category"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTimelineEvents(db: DB, projectId: string): TimelineEventRecord[] {
  const rows = db
    .prepare(`SELECT * FROM timeline_events WHERE project_id = ? ORDER BY event_order ASC`)
    .all(projectId) as Row[];
  return rows.map(toRecord);
}

export function upsertTimelineEvent(db: DB, input: TimelineEventCreateInput): TimelineEventRecord {
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const existing = db.prepare(`SELECT * FROM timeline_events WHERE id = ?`).get(id) as Row | undefined;

  if (existing) {
    db.prepare(`
      UPDATE timeline_events SET
        title = ?, description = ?, chapter_id = ?, event_order = ?, color = ?, category = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.title, input.description ?? existing.description,
      input.chapterId ?? existing.chapter_id, input.eventOrder ?? existing.event_order,
      input.color ?? existing.color, input.category ?? existing.category, now, id,
    );
  } else {
    db.prepare(`
      INSERT INTO timeline_events (id, project_id, chapter_id, title, description, event_order, color, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.projectId, input.chapterId ?? null, input.title,
      input.description ?? "", input.eventOrder ?? 0, input.color ?? null,
      input.category ?? "custom", now, now,
    );
  }
  return listTimelineEvents(db, input.projectId).find((e) => e.id === id)!;
}

export function deleteTimelineEvent(db: DB, id: string): void {
  db.prepare(`DELETE FROM timeline_events WHERE id = ?`).run(id);
}

export function reorderTimelineEvents(db: DB, eventIds: string[]): void {
  const stmt = db.prepare(`UPDATE timeline_events SET event_order = ? WHERE id = ?`);
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((eid, i) => stmt.run(i, eid));
  });
  tx(eventIds);
}
