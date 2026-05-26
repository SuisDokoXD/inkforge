// =============================================================================
// IPC 路由 · v25 Character Card + v26 Voice Profile + World Info Trace
// =============================================================================
// 这三块都是 v25/v26 引入的新功能 IPC，集中在一个 register 函数里，
// 避免给 ipc/ 目录新增三个超薄文件。

import { ipcMain } from "electron";
import { Buffer } from "node:buffer";

import {
  deleteAllProjectTraces,
  getWorldInfoTraceById,
  listCardImports,
  listRecentWorldInfoTraces,
} from "@inkforge/storage";

import type {
  CharacterCardExportInput,
  CharacterCardExportResponse,
  CharacterCardImportInput,
  CharacterCardImportRecordLite,
  CharacterCardImportResponse,
  CharacterCardListImportsInput,
  VoiceProfileDeleteInput,
  VoiceProfileGetInput,
  VoiceProfileRecord,
  VoiceProfileSetEnabledInput,
  VoiceProfileUpsertInput,
  WorldInfoTraceClearInput,
  WorldInfoTraceGetInput,
  WorldInfoTraceListRecentInput,
  WorldInfoTraceRecord,
} from "@inkforge/shared";

import { getAppContext } from "../services/app-state";
import {
  exportPackAsCcv3,
  importCardFromFile,
} from "../services/character-card/character-card-service";
import {
  deleteVoiceProfile,
  getVoiceProfile,
  setVoiceProfileEnabled,
  upsertVoiceProfile,
} from "../services/voice-profile-service";

export function registerCharacterCardHandlers(): void {
  // ---------- v25 · Character Card 导入导出 ----------

  ipcMain.handle(
    "character-card:import",
    async (
      _e,
      input: CharacterCardImportInput,
    ): Promise<CharacterCardImportResponse> => {
      const r = await importCardFromFile({ sourcePath: input.sourcePath });
      return {
        packId: r.packId,
        pack: r.pack,
        alreadyImported: r.alreadyImported,
        entryCount: r.entryCount,
      };
    },
  );

  ipcMain.handle(
    "character-card:export",
    async (
      _e,
      input: CharacterCardExportInput,
    ): Promise<CharacterCardExportResponse> => {
      const r = await exportPackAsCcv3(input.packId, {
        format: input.format,
        outputPath: input.outputPath,
        coverBytes: input.coverBytes ? Buffer.from(input.coverBytes) : undefined,
      });
      return r;
    },
  );

  ipcMain.handle(
    "character-card:list-imports",
    async (
      _e,
      input: CharacterCardListImportsInput,
    ): Promise<CharacterCardImportRecordLite[]> => {
      const ctx = getAppContext();
      const records = listCardImports(ctx.db, input.limit ?? 200);
      return records.map((r) => ({
        id: r.id,
        sourcePath: r.sourcePath,
        contentHash: r.contentHash,
        packId: r.packId,
        importedAt: r.importedAt,
        spec: r.spec,
      }));
    },
  );

  // ---------- v26 · Voice Profile ----------

  ipcMain.handle(
    "voice-profile:get",
    async (_e, input: VoiceProfileGetInput): Promise<VoiceProfileRecord | null> => {
      return getVoiceProfile(input.projectId);
    },
  );

  ipcMain.handle(
    "voice-profile:upsert",
    async (_e, input: VoiceProfileUpsertInput): Promise<VoiceProfileRecord> => {
      const id = `voice_${input.projectId}`;
      return upsertVoiceProfile({
        id,
        projectId: input.projectId,
        answers: input.answers,
        promptBlock: input.promptBlock,
        enabled: input.enabled,
        completedAt: input.completedAt,
      });
    },
  );

  ipcMain.handle(
    "voice-profile:set-enabled",
    async (_e, input: VoiceProfileSetEnabledInput) => {
      setVoiceProfileEnabled(input.projectId, input.enabled);
      return { projectId: input.projectId, enabled: input.enabled };
    },
  );

  ipcMain.handle(
    "voice-profile:delete",
    async (_e, input: VoiceProfileDeleteInput) => {
      deleteVoiceProfile(input.projectId);
      return { projectId: input.projectId };
    },
  );

  // ---------- v26 · World Info Trace ----------

  ipcMain.handle(
    "world-info-trace:list-recent",
    async (
      _e,
      input: WorldInfoTraceListRecentInput,
    ): Promise<WorldInfoTraceRecord[]> => {
      const ctx = getAppContext();
      return listRecentWorldInfoTraces(ctx.db, input.projectId, input.limit ?? 30);
    },
  );

  ipcMain.handle(
    "world-info-trace:get",
    async (
      _e,
      input: WorldInfoTraceGetInput,
    ): Promise<WorldInfoTraceRecord | null> => {
      const ctx = getAppContext();
      return getWorldInfoTraceById(ctx.db, input.id);
    },
  );

  ipcMain.handle(
    "world-info-trace:clear",
    async (_e, input: WorldInfoTraceClearInput) => {
      const ctx = getAppContext();
      deleteAllProjectTraces(ctx.db, input.projectId);
      return { projectId: input.projectId };
    },
  );
}
