import { ipcMain } from "electron";
import type {
  ResearchCredentialStatus,
  ResearchNoteRecord,
  ResearchSearchResponse,
  ipcChannels,
} from "@inkforge/shared";
import {
  deleteResearchCredential,
  deleteResearchNoteRecord,
  getResearchCredentialStatuses,
  getResearchNote,
  listResearchNoteRecords,
  saveResearchNote,
  searchResearch,
  updateResearchNoteRecord,
  upsertResearchCredential,
} from "../services/research-service";
import {
  parseResearchCredentialDeleteInput,
  parseResearchCredentialStatusInput,
  parseResearchCredentialUpsertInput,
  parseResearchDeleteInput,
  parseResearchGetInput,
  parseResearchListInput,
  parseResearchSaveInput,
  parseResearchSearchInput,
  parseResearchUpdateInput,
} from "./validation";

const RESEARCH_SEARCH: typeof ipcChannels.researchSearch = "research:search";
const RESEARCH_LIST: typeof ipcChannels.researchList = "research:list";
const RESEARCH_GET: typeof ipcChannels.researchGet = "research:get";
const RESEARCH_SAVE: typeof ipcChannels.researchSave = "research:save";
const RESEARCH_UPDATE: typeof ipcChannels.researchUpdate = "research:update";
const RESEARCH_DELETE: typeof ipcChannels.researchDelete = "research:delete";
const RESEARCH_CRED_STATUS: typeof ipcChannels.researchCredentialStatus =
  "research:credential-status";
const RESEARCH_CRED_UPSERT: typeof ipcChannels.researchCredentialUpsert =
  "research:credential-upsert";
const RESEARCH_CRED_DELETE: typeof ipcChannels.researchCredentialDelete =
  "research:credential-delete";

export function registerResearchHandlers(): void {
  ipcMain.handle(
    RESEARCH_SEARCH,
    async (_event, input: unknown): Promise<ResearchSearchResponse> =>
      searchResearch(parseResearchSearchInput(input)),
  );
  ipcMain.handle(
    RESEARCH_LIST,
    async (_event, input: unknown): Promise<ResearchNoteRecord[]> =>
      listResearchNoteRecords(parseResearchListInput(input)),
  );
  ipcMain.handle(
    RESEARCH_GET,
    async (_event, input: unknown): Promise<ResearchNoteRecord | null> =>
      getResearchNote(parseResearchGetInput(input)),
  );
  ipcMain.handle(
    RESEARCH_SAVE,
    async (_event, input: unknown): Promise<ResearchNoteRecord> =>
      saveResearchNote(parseResearchSaveInput(input)),
  );
  ipcMain.handle(
    RESEARCH_UPDATE,
    async (_event, input: unknown): Promise<ResearchNoteRecord> =>
      updateResearchNoteRecord(parseResearchUpdateInput(input)),
  );
  ipcMain.handle(
    RESEARCH_DELETE,
    async (_event, input: unknown): Promise<{ id: string }> =>
      deleteResearchNoteRecord(parseResearchDeleteInput(input)),
  );
  ipcMain.handle(
    RESEARCH_CRED_STATUS,
    async (
      _event,
      input: unknown,
    ): Promise<ResearchCredentialStatus[]> =>
      getResearchCredentialStatuses(parseResearchCredentialStatusInput(input)),
  );
  ipcMain.handle(
    RESEARCH_CRED_UPSERT,
    async (
      _event,
      input: unknown,
    ): Promise<ResearchCredentialStatus> =>
      upsertResearchCredential(parseResearchCredentialUpsertInput(input)),
  );
  ipcMain.handle(
    RESEARCH_CRED_DELETE,
    async (
      _event,
      input: unknown,
    ): Promise<ResearchCredentialStatus> =>
      deleteResearchCredential(parseResearchCredentialDeleteInput(input)),
  );
}
