import { ipcMain } from "electron";
import type {
  CharacterSyncApplyResponse,
  CharacterSyncLogRecord,
  CharacterSyncPreviewResponse,
  NovelCharacterExtractResponse,
  NovelCharacterImportCandidatesResponse,
  NovelCharacterRecord,
  TavernCardRecord,
  ipcChannels,
} from "@inkforge/shared";
import {
  createTavernCard,
  deleteTavernCardRecord,
  getTavernCardRecord,
  listTavernCardRecords,
  updateTavernCardRecord,
} from "../services/tavern-card-service";
import {
  createNovelCharacter,
  deleteNovelCharacterRecord,
  extractNovelCharactersFromChapter,
  getNovelCharacterRecord,
  importNovelCharacterCandidates,
  listNovelCharacterRecords,
  updateNovelCharacterRecord,
} from "../services/novel-character-service";
import {
  applySync,
  listSyncHistory,
  previewSync,
} from "../services/character-sync-service";
import {
  parseCharacterSyncApplyInput,
  parseCharacterSyncHistoryInput,
  parseCharacterSyncPreviewInput,
  parseNovelCharacterCreateInput,
  parseNovelCharacterDeleteInput,
  parseNovelCharacterExtractInput,
  parseNovelCharacterGetInput,
  parseNovelCharacterImportCandidatesInput,
  parseNovelCharacterListInput,
  parseNovelCharacterUpdateInput,
  parseTavernCardCreateInput,
  parseTavernCardDeleteInput,
  parseTavernCardGetInput,
  parseTavernCardListInput,
  parseTavernCardUpdateInput,
} from "./validation";

const TAVERN_CARD_CREATE: typeof ipcChannels.tavernCardCreate = "tavern-card:create";
const TAVERN_CARD_UPDATE: typeof ipcChannels.tavernCardUpdate = "tavern-card:update";
const TAVERN_CARD_GET: typeof ipcChannels.tavernCardGet = "tavern-card:get";
const TAVERN_CARD_LIST: typeof ipcChannels.tavernCardList = "tavern-card:list";
const TAVERN_CARD_DELETE: typeof ipcChannels.tavernCardDelete = "tavern-card:delete";

const NOVEL_CHARACTER_CREATE: typeof ipcChannels.novelCharacterCreate = "novel-character:create";
const NOVEL_CHARACTER_UPDATE: typeof ipcChannels.novelCharacterUpdate = "novel-character:update";
const NOVEL_CHARACTER_GET: typeof ipcChannels.novelCharacterGet = "novel-character:get";
const NOVEL_CHARACTER_LIST: typeof ipcChannels.novelCharacterList = "novel-character:list";
const NOVEL_CHARACTER_DELETE: typeof ipcChannels.novelCharacterDelete = "novel-character:delete";
const NOVEL_CHARACTER_EXTRACT_FROM_CHAPTER: typeof ipcChannels.novelCharacterExtractFromChapter =
  "novel-character:extract-from-chapter";
const NOVEL_CHARACTER_IMPORT_CANDIDATES: typeof ipcChannels.novelCharacterImportCandidates =
  "novel-character:import-candidates";

const CHARACTER_SYNC_PREVIEW: typeof ipcChannels.characterSyncPreview = "character-sync:preview";
const CHARACTER_SYNC_APPLY: typeof ipcChannels.characterSyncApply = "character-sync:apply";
const CHARACTER_SYNC_HISTORY: typeof ipcChannels.characterSyncHistory = "character-sync:history";

export function registerCharacterHandlers(): void {
  ipcMain.handle(
    TAVERN_CARD_CREATE,
    async (_event, input: unknown): Promise<TavernCardRecord> => {
      return createTavernCard(parseTavernCardCreateInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_CARD_UPDATE,
    async (_event, input: unknown): Promise<TavernCardRecord> => {
      return updateTavernCardRecord(parseTavernCardUpdateInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_CARD_GET,
    async (_event, input: unknown): Promise<TavernCardRecord | null> => {
      return getTavernCardRecord(parseTavernCardGetInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_CARD_LIST,
    async (_event, input: unknown): Promise<TavernCardRecord[]> => {
      return listTavernCardRecords(parseTavernCardListInput(input));
    },
  );
  ipcMain.handle(
    TAVERN_CARD_DELETE,
    async (_event, input: unknown): Promise<{ id: string }> => {
      return deleteTavernCardRecord(parseTavernCardDeleteInput(input));
    },
  );

  ipcMain.handle(
    NOVEL_CHARACTER_CREATE,
    async (_event, input: unknown): Promise<NovelCharacterRecord> => {
      return createNovelCharacter(parseNovelCharacterCreateInput(input));
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_UPDATE,
    async (_event, input: unknown): Promise<NovelCharacterRecord> => {
      return updateNovelCharacterRecord(parseNovelCharacterUpdateInput(input));
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_GET,
    async (_event, input: unknown): Promise<NovelCharacterRecord | null> => {
      return getNovelCharacterRecord(parseNovelCharacterGetInput(input));
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_LIST,
    async (_event, input: unknown): Promise<NovelCharacterRecord[]> => {
      return listNovelCharacterRecords(parseNovelCharacterListInput(input));
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_DELETE,
    async (_event, input: unknown): Promise<{ id: string }> => {
      return deleteNovelCharacterRecord(parseNovelCharacterDeleteInput(input));
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_EXTRACT_FROM_CHAPTER,
    async (
      _event,
      input: unknown,
    ): Promise<NovelCharacterExtractResponse> => {
      return extractNovelCharactersFromChapter(parseNovelCharacterExtractInput(input));
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_IMPORT_CANDIDATES,
    async (
      _event,
      input: unknown,
    ): Promise<NovelCharacterImportCandidatesResponse> => {
      return importNovelCharacterCandidates(parseNovelCharacterImportCandidatesInput(input));
    },
  );

  ipcMain.handle(
    CHARACTER_SYNC_PREVIEW,
    async (_event, input: unknown): Promise<CharacterSyncPreviewResponse> => {
      return previewSync(parseCharacterSyncPreviewInput(input));
    },
  );
  ipcMain.handle(
    CHARACTER_SYNC_APPLY,
    async (_event, input: unknown): Promise<CharacterSyncApplyResponse> => {
      return applySync(parseCharacterSyncApplyInput(input));
    },
  );
  ipcMain.handle(
    CHARACTER_SYNC_HISTORY,
    async (_event, input: unknown): Promise<CharacterSyncLogRecord[]> => {
      return listSyncHistory(parseCharacterSyncHistoryInput(input));
    },
  );
}
