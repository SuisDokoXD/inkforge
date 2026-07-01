import type { BrowserWindow } from "electron";
import { registerAchievementHandlers } from "./achievement";
import { registerAutoWriterHandlers } from "./auto-writer";
import { registerLetterHandlers } from "./letter";
import { registerBookCoverHandlers } from "./book-cover";
import { registerTimelineHandlers } from "./timeline";
import { registerImageGenHandlers } from "./image-gen";
import { registerBookshelfHandlers } from "./bookshelf";
import { registerCharacterHandlers } from "./character";
import { registerChapterHandlers } from "./chapter";
import { registerChapterLogHandlers } from "./chapter-log";
import { registerDailyHandlers } from "./daily";
import { registerDailySummaryHandlers } from "./daily-summary";
import { registerDiagHandlers } from "./diag";
import { registerFeedbackHandlers } from "./feedback";
import { registerExternalHandlers } from "./external";
import { registerFsHandlers } from "./fs";
import { registerLLMHandlers } from "./llm";
import { registerMarketHandlers } from "./market";
import { registerOriginTagHandlers } from "./origin-tag";
import { registerOutlineHandlers } from "./outline";
import { registerProjectHandlers } from "./project";
import { registerProviderHandlers } from "./provider";
import { registerProviderKeyHandlers } from "./provider-key";
import { registerResearchHandlers } from "./research";
import { registerReviewHandlers } from "./review";
import { registerSettingsHandlers } from "./settings";
import { registerSkillHandlers } from "./skill";
import { registerSnapshotHandlers } from "./snapshot";
import { registerTavernHandlers } from "./tavern";
import { registerTerminalHandlers } from "./terminal";
import { registerUpdateHandlers } from "./update";
import { registerWindowControlHandlers } from "./window-control";
import { registerWorldHandlers } from "./world";
import { registerSceneBindingHandlers } from "./scene-binding";
import { registerSampleLibHandlers } from "./sample-lib";
import { registerWorldRelationshipHandlers } from "./world-relationship";
import { registerProjectExportHandlers } from "./project-export";
import { registerProjectPackageHandlers } from "./project-package";
import { registerOutlineGenerationHandlers } from "./outline-generation";
import { registerMaterialHandlers } from "./material";
import { registerWorldPackHandlers } from "./world-pack";
import { registerAuthorNoteHandlers } from "./author-note";
import { registerCharacterCardHandlers } from "./character-card";
import { startDailyReminder } from "../services/chapter-log-service";

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  registerProjectHandlers();
  registerChapterHandlers();
  registerProviderHandlers();
  registerLLMHandlers(getWindow);
  registerFeedbackHandlers();
  registerExternalHandlers();
  registerOutlineHandlers();
  registerDailyHandlers();
  registerSettingsHandlers();
  registerSkillHandlers(getWindow);
  registerCharacterHandlers();
  registerTavernHandlers(getWindow);
  registerWorldHandlers();
  registerResearchHandlers();
  registerReviewHandlers(getWindow);
  registerDailySummaryHandlers(getWindow);
  registerProviderKeyHandlers();
  registerFsHandlers(getWindow);
  registerTerminalHandlers(getWindow);
  registerDiagHandlers();
  registerUpdateHandlers(process.env.INKFORGE_UPDATE_FEED);
  registerMarketHandlers();
  // ----- M7 · Bookshelf -----
  registerSnapshotHandlers();
  registerBookshelfHandlers();
  registerBookCoverHandlers();
  registerOriginTagHandlers();
  registerChapterLogHandlers();
  registerAutoWriterHandlers(getWindow);
  registerWindowControlHandlers(getWindow);
  // ----- M8 · 活人感 -----
  registerAchievementHandlers(getWindow);
  registerLetterHandlers(getWindow);
  startDailyReminder(getWindow);
  // ----- Scene Bindings (ported from ainovel) -----
  registerSceneBindingHandlers();
  // ----- Sample Library + RAG (ported from ainovel) -----
  registerSampleLibHandlers();
  // ----- World Relationships (graph, ported from ainovel) -----
  registerWorldRelationshipHandlers();
  // ----- Project Export + Chapter Bulk Import (ported from ainovel) -----
  registerProjectExportHandlers(getWindow);
  registerProjectPackageHandlers(getWindow);
  // ----- Module 6: AI outline + chapter generation (ainovel-style) -----
  registerOutlineGenerationHandlers();
  // ----- v20: Materials (素材库) -----
  registerMaterialHandlers();
  // ----- v23: Worldview Cards (世界观卡牌库 + 插槽 + 融合) -----
  registerWorldPackHandlers();
  // ----- v24: Author's Note (项目级全局风格批注) -----
  registerAuthorNoteHandlers();
  // ----- v25/v26: Character Card 导入导出 + Voice Profile + World Info Trace -----
  registerCharacterCardHandlers();
  // ----- C12 + C13: Timeline & Image Gen -----
  registerTimelineHandlers();
  registerImageGenHandlers();
}
