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
  CharacterCardExportResponse,
  CharacterCardImportRecordLite,
  CharacterCardImportResponse,
  VoiceProfileRecord,
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
import {
  parseCharacterCardExportInput,
  parseCharacterCardImportInput,
  parseCharacterCardListImportsInput,
  parseVoiceProfileDeleteInput,
  parseVoiceProfileGetInput,
  parseVoiceProfileSetEnabledInput,
  parseVoiceProfileUpsertInput,
  parseWorldInfoTraceClearInput,
  parseWorldInfoTraceGetInput,
  parseWorldInfoTraceListRecentInput,
} from "./validation";

export function registerCharacterCardHandlers(): void {
  // ---------- v25 · Character Card 导入导出 ----------

  ipcMain.handle(
    "character-card:import",
    async (
      _e,
      input: unknown,
    ): Promise<CharacterCardImportResponse> => {
      const parsed = parseCharacterCardImportInput(input);
      const r = await importCardFromFile({ sourcePath: parsed.sourcePath });
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
      input: unknown,
    ): Promise<CharacterCardExportResponse> => {
      const parsed = parseCharacterCardExportInput(input);
      const r = await exportPackAsCcv3(parsed.packId, {
        format: parsed.format,
        outputPath: parsed.outputPath,
        coverBytes: parsed.coverBytes ? Buffer.from(parsed.coverBytes) : undefined,
      });
      return r;
    },
  );

  ipcMain.handle(
    "character-card:list-imports",
    async (
      _e,
      input: unknown,
    ): Promise<CharacterCardImportRecordLite[]> => {
      const parsed = parseCharacterCardListImportsInput(input);
      const ctx = getAppContext();
      const records = listCardImports(ctx.db, parsed.limit ?? 200);
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
    async (_e, input: unknown): Promise<VoiceProfileRecord | null> => {
      const parsed = parseVoiceProfileGetInput(input);
      return getVoiceProfile(parsed.projectId);
    },
  );

  ipcMain.handle(
    "voice-profile:upsert",
    async (_e, input: unknown): Promise<VoiceProfileRecord> => {
      const parsed = parseVoiceProfileUpsertInput(input);
      const id = `voice_${parsed.projectId}`;
      return upsertVoiceProfile({
        id,
        projectId: parsed.projectId,
        answers: parsed.answers,
        promptBlock: parsed.promptBlock,
        enabled: parsed.enabled,
        completedAt: parsed.completedAt,
      });
    },
  );

  ipcMain.handle(
    "voice-profile:set-enabled",
    async (_e, input: unknown) => {
      const parsed = parseVoiceProfileSetEnabledInput(input);
      setVoiceProfileEnabled(parsed.projectId, parsed.enabled);
      return { projectId: parsed.projectId, enabled: parsed.enabled };
    },
  );

  ipcMain.handle(
    "voice-profile:delete",
    async (_e, input: unknown) => {
      const parsed = parseVoiceProfileDeleteInput(input);
      deleteVoiceProfile(parsed.projectId);
      return { projectId: parsed.projectId };
    },
  );

  // ---------- v26 · World Info Trace ----------

  ipcMain.handle(
    "world-info-trace:list-recent",
    async (
      _e,
      input: unknown,
    ): Promise<WorldInfoTraceRecord[]> => {
      const parsed = parseWorldInfoTraceListRecentInput(input);
      const ctx = getAppContext();
      return listRecentWorldInfoTraces(ctx.db, parsed.projectId, parsed.limit ?? 30);
    },
  );

  ipcMain.handle(
    "world-info-trace:get",
    async (
      _e,
      input: unknown,
    ): Promise<WorldInfoTraceRecord | null> => {
      const parsed = parseWorldInfoTraceGetInput(input);
      const ctx = getAppContext();
      return getWorldInfoTraceById(ctx.db, parsed.id);
    },
  );

  ipcMain.handle(
    "world-info-trace:clear",
    async (_e, input: unknown) => {
      const parsed = parseWorldInfoTraceClearInput(input);
      const ctx = getAppContext();
      deleteAllProjectTraces(ctx.db, parsed.projectId);
      return { projectId: parsed.projectId };
    },
  );
}
