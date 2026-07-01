// C12: Timeline IPC handlers
import { ipcMain } from "electron";
import type { TimelineEventCreateInput, TimelineEventRecord, TimelineView } from "@inkforge/shared";
import { buildTimelineView } from "../services/timeline-service";
import { deleteTimelineEvent, listTimelineEvents, reorderTimelineEvents, upsertTimelineEvent } from "@inkforge/storage";
import { getAppContext } from "../services/app-state";

export function registerTimelineHandlers(): void {
  ipcMain.handle("timeline:get-view", async (_e, input: { projectId: string }): Promise<TimelineView> => {
    return buildTimelineView(input.projectId);
  });

  ipcMain.handle("timeline:list-events", async (_e, input: { projectId: string }): Promise<{ events: TimelineEventRecord[] }> => {
    return { events: listTimelineEvents(getAppContext().db, input.projectId) };
  });

  ipcMain.handle("timeline:upsert-event", async (_e, input: TimelineEventCreateInput): Promise<TimelineEventRecord> => {
    return upsertTimelineEvent(getAppContext().db, input);
  });

  ipcMain.handle("timeline:delete-event", async (_e, input: { id: string }): Promise<{ id: string }> => {
    deleteTimelineEvent(getAppContext().db, input.id);
    return { id: input.id };
  });

  ipcMain.handle("timeline:reorder-events", async (_e, input: { eventIds: string[] }): Promise<{ ok: true }> => {
    reorderTimelineEvents(getAppContext().db, input.eventIds);
    return { ok: true };
  });
}
