// C12: Timeline IPC handlers
import { ipcMain } from "electron";
import type { TimelineEventCreateInput, TimelineEventRecord, TimelineView } from "@inkforge/shared";
import { buildTimelineView } from "../services/timeline-service";
import { deleteTimelineEvent, listTimelineEvents, reorderTimelineEvents, upsertTimelineEvent } from "@inkforge/storage";
import { getAppContext } from "../services/app-state";

export function registerTimelineHandlers(): void {
  ipcMain.handle("timeline:get-view", async (_e, input: unknown): Promise<TimelineView> => {
    const { projectId } = input as { projectId: string };
    return buildTimelineView(projectId);
  });

  ipcMain.handle("timeline:list-events", async (_e, input: unknown): Promise<{ events: TimelineEventRecord[] }> => {
    const { projectId } = input as { projectId: string };
    return { events: listTimelineEvents(getAppContext().db, projectId) };
  });

  ipcMain.handle("timeline:upsert-event", async (_e, input: unknown): Promise<TimelineEventRecord> => {
    return upsertTimelineEvent(getAppContext().db, input as TimelineEventCreateInput);
  });

  ipcMain.handle("timeline:delete-event", async (_e, input: unknown): Promise<{ id: string }> => {
    const { id } = input as { id: string };
    deleteTimelineEvent(getAppContext().db, id);
    return { id };
  });

  ipcMain.handle("timeline:reorder-events", async (_e, input: unknown): Promise<{ ok: true }> => {
    const { eventIds } = input as { eventIds: string[] };
    reorderTimelineEvents(getAppContext().db, eventIds);
    return { ok: true };
  });
}
