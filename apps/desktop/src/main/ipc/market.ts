import { ipcMain } from "electron";
import type {
  MarketRegistryDTO,
  MarketInstallSkillResponse,
  MarketBuildPublishBundleResponse,
} from "@inkforge/shared";
import { ipcChannels } from "@inkforge/shared";
import {
  buildMarketPublishBundle,
  fetchMarketRegistry,
  installSkillFromMarket,
} from "../services/market-service";
import {
  parseMarketBuildPublishBundleInput,
  parseMarketFetchRegistryInput,
  parseMarketInstallSkillInput,
} from "./validation";

export function registerMarketHandlers(): void {
  ipcMain.handle(
    ipcChannels.marketFetchRegistry,
    async (_event, input: unknown): Promise<MarketRegistryDTO> =>
      fetchMarketRegistry(parseMarketFetchRegistryInput(input)),
  );
  ipcMain.handle(
    ipcChannels.marketInstallSkill,
    async (
      _event,
      input: unknown,
    ): Promise<MarketInstallSkillResponse> =>
      installSkillFromMarket(parseMarketInstallSkillInput(input)),
  );
  ipcMain.handle(
    ipcChannels.marketBuildPublishBundle,
    async (
      _event,
      input: unknown,
    ): Promise<MarketBuildPublishBundleResponse> =>
      buildMarketPublishBundle(parseMarketBuildPublishBundleInput(input)),
  );
}
