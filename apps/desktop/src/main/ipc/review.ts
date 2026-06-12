import { ipcMain, type BrowserWindow } from "electron";
import type {
  ReviewApplyFixResponse,
  ReviewCancelResponse,
  ReviewDimensionRecord,
  ReviewDismissFindingResponse,
  ReviewExportResponse,
  ReviewGetResponse,
  ReviewReportRecord,
  ReviewRunResponse,
  ipcChannels,
} from "@inkforge/shared";
import {
  applyReviewFix,
  cancelReview,
  deleteReviewDimensionRecord,
  dismissReviewFinding,
  exportReviewReport,
  getReviewReportWithFindings,
  listReviewDimensionsEnsuringBuiltins,
  listReviewReportsForProject,
  reorderReviewDimensionRecords,
  startReview,
  upsertReviewDimensionRecord,
} from "../services/review-service";
import {
  parseReviewApplyFixInput,
  parseReviewCancelInput,
  parseReviewDimDeleteInput,
  parseReviewDimListInput,
  parseReviewDimReorderInput,
  parseReviewDimUpsertInput,
  parseReviewDismissFindingInput,
  parseReviewExportInput,
  parseReviewGetInput,
  parseReviewListInput,
  parseReviewRunInput,
} from "./validation";

const REVIEW_DIM_LIST: typeof ipcChannels.reviewDimList = "review-dim:list";
const REVIEW_DIM_UPSERT: typeof ipcChannels.reviewDimUpsert = "review-dim:upsert";
const REVIEW_DIM_DELETE: typeof ipcChannels.reviewDimDelete = "review-dim:delete";
const REVIEW_DIM_REORDER: typeof ipcChannels.reviewDimReorder = "review-dim:reorder";
const REVIEW_RUN: typeof ipcChannels.reviewRun = "review:run";
const REVIEW_CANCEL: typeof ipcChannels.reviewCancel = "review:cancel";
const REVIEW_LIST: typeof ipcChannels.reviewList = "review:list";
const REVIEW_GET: typeof ipcChannels.reviewGet = "review:get";
const REVIEW_DISMISS_FINDING: typeof ipcChannels.reviewDismissFinding = "review:dismiss-finding";
const REVIEW_EXPORT: typeof ipcChannels.reviewExport = "review:export";
const REVIEW_APPLY_FIX: typeof ipcChannels.reviewApplyFix = "review:apply-fix";

export function registerReviewHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    REVIEW_DIM_LIST,
    async (_event, input: unknown): Promise<ReviewDimensionRecord[]> =>
      listReviewDimensionsEnsuringBuiltins(parseReviewDimListInput(input)),
  );
  ipcMain.handle(
    REVIEW_DIM_UPSERT,
    async (_event, input: unknown): Promise<ReviewDimensionRecord> =>
      upsertReviewDimensionRecord(parseReviewDimUpsertInput(input)),
  );
  ipcMain.handle(
    REVIEW_DIM_DELETE,
    async (_event, input: unknown): Promise<{ id: string }> =>
      deleteReviewDimensionRecord(parseReviewDimDeleteInput(input)),
  );
  ipcMain.handle(
    REVIEW_DIM_REORDER,
    async (_event, input: unknown): Promise<ReviewDimensionRecord[]> =>
      reorderReviewDimensionRecords(parseReviewDimReorderInput(input)),
  );
  ipcMain.handle(
    REVIEW_RUN,
    async (_event, input: unknown): Promise<ReviewRunResponse> =>
      startReview(parseReviewRunInput(input), getWindow()),
  );
  ipcMain.handle(
    REVIEW_CANCEL,
    async (_event, input: unknown): Promise<ReviewCancelResponse> =>
      cancelReview(parseReviewCancelInput(input)),
  );
  ipcMain.handle(
    REVIEW_LIST,
    async (_event, input: unknown): Promise<ReviewReportRecord[]> =>
      listReviewReportsForProject(parseReviewListInput(input)),
  );
  ipcMain.handle(
    REVIEW_GET,
    async (_event, input: unknown): Promise<ReviewGetResponse | null> =>
      getReviewReportWithFindings(parseReviewGetInput(input)),
  );
  ipcMain.handle(
    REVIEW_DISMISS_FINDING,
    async (_event, input: unknown): Promise<ReviewDismissFindingResponse> =>
      dismissReviewFinding(parseReviewDismissFindingInput(input)),
  );
  ipcMain.handle(
    REVIEW_EXPORT,
    async (_event, input: unknown): Promise<ReviewExportResponse> =>
      exportReviewReport(parseReviewExportInput(input)),
  );
  ipcMain.handle(
    REVIEW_APPLY_FIX,
    async (_event, input: unknown): Promise<ReviewApplyFixResponse> =>
      applyReviewFix(parseReviewApplyFixInput(input)),
  );
}
