import { ipcMain } from "electron";
import {
  ipcChannels,
  type BookCoverGetResponse,
  type BookCoverUploadResponse,
} from "@inkforge/shared";
import {
  getCoverWithContent,
  removeCover,
  uploadCover,
} from "../services/cover-service";
import {
  parseBookCoverDeleteInput,
  parseBookCoverGetInput,
  parseBookCoverUploadInput,
} from "./validation";

const COVER_UPLOAD: typeof ipcChannels.bookCoverUpload = "book-cover:upload";
const COVER_GET: typeof ipcChannels.bookCoverGet = "book-cover:get";
const COVER_DELETE: typeof ipcChannels.bookCoverDelete = "book-cover:delete";

export function registerBookCoverHandlers(): void {
  ipcMain.handle(
    COVER_UPLOAD,
    async (_event, input: unknown): Promise<BookCoverUploadResponse> => {
      return { cover: uploadCover(parseBookCoverUploadInput(input)) };
    },
  );

  ipcMain.handle(
    COVER_GET,
    async (_event, input: unknown): Promise<BookCoverGetResponse> => {
      return getCoverWithContent(parseBookCoverGetInput(input).projectId);
    },
  );

  ipcMain.handle(
    COVER_DELETE,
    async (_event, input: unknown): Promise<{ projectId: string }> => {
      return removeCover(parseBookCoverDeleteInput(input).projectId);
    },
  );
}
