import { ipcMain, type BrowserWindow } from "electron";
import type {
  ReviewApplyFixInput,
  ReviewApplyFixResponse,
  ReviewCancelInput,
  ReviewCancelResponse,
  ReviewDimDeleteInput,
  ReviewDimListInput,
  ReviewDimReorderInput,
  ReviewDimUpsertInput,
  ReviewDimensionRecord,
  ReviewDismissFindingInput,
  ReviewDismissFindingResponse,
  ReviewExportInput,
  ReviewExportResponse,
  ReviewGetInput,
  ReviewGetResponse,
  ReviewListInput,
  ReviewReportRecord,
  ReviewRunInput,
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
    async (_event, input: ReviewDimListInput): Promise<ReviewDimensionRecord[]> =>
      listReviewDimensionsEnsuringBuiltins(input),
  );
  ipcMain.handle(
    REVIEW_DIM_UPSERT,
    async (_event, input: ReviewDimUpsertInput): Promise<ReviewDimensionRecord> =>
      upsertReviewDimensionRecord(input),
  );
  ipcMain.handle(
    REVIEW_DIM_DELETE,
    async (_event, input: ReviewDimDeleteInput): Promise<{ id: string }> =>
      deleteReviewDimensionRecord(input),
  );
  ipcMain.handle(
    REVIEW_DIM_REORDER,
    async (_event, input: ReviewDimReorderInput): Promise<ReviewDimensionRecord[]> =>
      reorderReviewDimensionRecords(input),
  );
  ipcMain.handle(
    REVIEW_RUN,
    async (_event, input: ReviewRunInput): Promise<ReviewRunResponse> =>
      startReview(input, getWindow()),
  );
  ipcMain.handle(
    REVIEW_CANCEL,
    async (_event, input: ReviewCancelInput): Promise<ReviewCancelResponse> =>
      cancelReview(input),
  );
  ipcMain.handle(
    REVIEW_LIST,
    async (_event, input: ReviewListInput): Promise<ReviewReportRecord[]> =>
      listReviewReportsForProject(input),
  );
  ipcMain.handle(
    REVIEW_GET,
    async (_event, input: ReviewGetInput): Promise<ReviewGetResponse | null> =>
      getReviewReportWithFindings(input),
  );
  ipcMain.handle(
    REVIEW_DISMISS_FINDING,
    async (_event, input: ReviewDismissFindingInput): Promise<ReviewDismissFindingResponse> =>
      dismissReviewFinding(input),
  );
  ipcMain.handle(
    REVIEW_EXPORT,
    async (_event, input: ReviewExportInput): Promise<ReviewExportResponse> =>
      exportReviewReport(input),
  );
  ipcMain.handle(
    REVIEW_APPLY_FIX,
    async (_event, input: ReviewApplyFixInput): Promise<ReviewApplyFixResponse> =>
      applyReviewFix(input),
  );
}
