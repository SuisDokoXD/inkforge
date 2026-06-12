import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { ipcChannels } from "@inkforge/shared";
import {
  deleteLetter,
  dismissLetter,
  generateLetter,
  listLetters,
  markLetterRead,
  pinLetter,
} from "../services/letter-service";
import {
  parseLetterDeleteInput,
  parseLetterDismissInput,
  parseLetterGenerateInput,
  parseLetterListInput,
  parseLetterMarkReadInput,
  parseLetterPinInput,
} from "./validation";

export function registerLetterHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    ipcChannels.letterList,
    async (_event, input: unknown) => {
      const parsed = parseLetterListInput(input);
      return listLetters(parsed.projectId, {
        includeDismissed: parsed.includeDismissed,
        characterId: parsed.characterId,
        limit: parsed.limit,
      });
    },
  );

  ipcMain.handle(
    ipcChannels.letterGenerate,
    async (_event, input: unknown) => {
      return generateLetter(parseLetterGenerateInput(input), getWindow());
    },
  );

  ipcMain.handle(
    ipcChannels.letterMarkRead,
    async (_event, input: unknown) => {
      const parsed = parseLetterMarkReadInput(input);
      return markLetterRead(parsed.letterId, parsed.read);
    },
  );

  ipcMain.handle(
    ipcChannels.letterPin,
    async (_event, input: unknown) => {
      const parsed = parseLetterPinInput(input);
      return pinLetter(parsed.letterId, parsed.pinned);
    },
  );

  ipcMain.handle(
    ipcChannels.letterDismiss,
    async (_event, input: unknown) => {
      return dismissLetter(parseLetterDismissInput(input).letterId);
    },
  );

  ipcMain.handle(
    ipcChannels.letterDelete,
    async (_event, input: unknown) => {
      return deleteLetter(parseLetterDeleteInput(input).letterId);
    },
  );
}
