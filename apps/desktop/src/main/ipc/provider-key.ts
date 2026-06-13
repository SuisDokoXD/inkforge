import { ipcMain } from "electron";
import {
  listProviderKeys,
  updateProviderKey,
} from "@inkforge/storage";
import type {
  ProviderHealthSnapshot,
  ProviderKeyRecord,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import { getProviderHealth } from "../services/llm-runtime";
import {
  deleteProviderKeyWithSecret,
  upsertProviderKeyWithSecret,
} from "../services/provider-key-service";
import {
  parseProviderKeyDeleteInput,
  parseProviderKeyHealthInput,
  parseProviderKeyListInput,
  parseProviderKeySetDisabledInput,
  parseProviderKeyUpsertInput,
} from "./validation";

const PROVIDER_KEY_LIST: typeof ipcChannels.providerKeyList = "provider-key:list";
const PROVIDER_KEY_UPSERT: typeof ipcChannels.providerKeyUpsert = "provider-key:upsert";
const PROVIDER_KEY_DELETE: typeof ipcChannels.providerKeyDelete = "provider-key:delete";
const PROVIDER_KEY_SET_DISABLED: typeof ipcChannels.providerKeySetDisabled =
  "provider-key:set-disabled";
const PROVIDER_KEY_HEALTH: typeof ipcChannels.providerKeyHealth = "provider-key:health";

export function registerProviderKeyHandlers(): void {
  ipcMain.handle(
    PROVIDER_KEY_LIST,
    async (_event, payload: unknown): Promise<ProviderKeyRecord[]> => {
      const input = parseProviderKeyListInput(payload);
      const ctx = getAppContext();
      return listProviderKeys(ctx.db, input.providerId);
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_UPSERT,
    async (_event, payload: unknown): Promise<ProviderKeyRecord> => {
      const input = parseProviderKeyUpsertInput(payload);
      const ctx = getAppContext();
      return upsertProviderKeyWithSecret(ctx, input);
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_DELETE,
    async (_event, payload: unknown): Promise<{ id: string }> => {
      const input = parseProviderKeyDeleteInput(payload);
      const ctx = getAppContext();
      return deleteProviderKeyWithSecret(ctx, input.id);
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_SET_DISABLED,
    async (_event, payload: unknown): Promise<ProviderKeyRecord> => {
      const input = parseProviderKeySetDisabledInput(payload);
      const ctx = getAppContext();
      return updateProviderKey(ctx.db, { id: input.id, disabled: input.disabled });
    },
  );

  ipcMain.handle(
    PROVIDER_KEY_HEALTH,
    async (_event, payload: unknown): Promise<ProviderHealthSnapshot> => {
      const input = parseProviderKeyHealthInput(payload);
      return getProviderHealth(input.providerId);
    },
  );
}
