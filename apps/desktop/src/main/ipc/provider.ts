import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import {
  deleteProvider as deleteProviderRow,
  getProviderPersistenceRecord,
  listProviders,
  upsertProvider,
} from "@inkforge/storage";
import type {
  ProviderListRemoteModelsResponse,
  ProviderRecord,
  ProviderTestResponse,
  ipcChannels,
} from "@inkforge/shared";
import { createProvider } from "@inkforge/llm-core";
import { getAppContext } from "../services/app-state";
import { listRemoteModels } from "../services/provider-models-service";
import {
  parseProviderDeleteInput,
  parseProviderListRemoteModelsInput,
  parseProviderSaveInput,
  parseProviderTestInput,
} from "./validation";

const PROVIDER_SAVE: typeof ipcChannels.providerSave = "provider:save";
const PROVIDER_LIST: typeof ipcChannels.providerList = "provider:list";
const PROVIDER_DELETE: typeof ipcChannels.providerDelete = "provider:delete";
const PROVIDER_TEST: typeof ipcChannels.providerTest = "provider:test";
const PROVIDER_LIST_REMOTE_MODELS: typeof ipcChannels.providerListRemoteModels =
  "provider:list-remote-models";

export function registerProviderHandlers(): void {
  ipcMain.handle(PROVIDER_SAVE, async (_event, input: unknown): Promise<ProviderRecord> => {
    const parsed = parseProviderSaveInput(input);
    const ctx = getAppContext();
    const id = parsed.id ?? randomUUID();

    let encrypted = null;
    let storedInKeychain = false;
    if (parsed.apiKey && parsed.apiKey.trim()) {
      const keyResult = await ctx.keystore.setKey(id, parsed.apiKey);
      encrypted = keyResult.encrypted ?? null;
      storedInKeychain = keyResult.storedInKeychain;
    } else {
      const existing = getProviderPersistenceRecord(ctx.db, id);
      if (existing) {
        encrypted = existing.encrypted;
        storedInKeychain = existing.storedInKeychain;
      }
    }

    return upsertProvider(ctx.db, {
      id,
      label: parsed.label,
      vendor: parsed.vendor,
      baseUrl: parsed.baseUrl ?? "",
      defaultModel: parsed.defaultModel,
      tags: parsed.tags ?? [],
      encrypted,
      storedInKeychain,
    });
  });

  ipcMain.handle(PROVIDER_LIST, async (): Promise<ProviderRecord[]> => {
    const ctx = getAppContext();
    return listProviders(ctx.db);
  });

  ipcMain.handle(PROVIDER_DELETE, async (_event, input: unknown): Promise<{ id: string }> => {
    const parsed = parseProviderDeleteInput(input);
    const ctx = getAppContext();
    try {
      await ctx.keystore.deleteKey(parsed.id);
    } catch {
      // ignore
    }
    deleteProviderRow(ctx.db, parsed.id);
    return { id: parsed.id };
  });

  ipcMain.handle(
    PROVIDER_LIST_REMOTE_MODELS,
    async (_event, input: unknown): Promise<ProviderListRemoteModelsResponse> => {
      return listRemoteModels(parseProviderListRemoteModelsInput(input));
    },
  );

  ipcMain.handle(PROVIDER_TEST, async (_event, input: unknown): Promise<ProviderTestResponse> => {
    const parsed = parseProviderTestInput(input);
    const ctx = getAppContext();
    const record = getProviderPersistenceRecord(ctx.db, parsed.id);
    if (!record) return { ok: false, durationMs: 0, error: "provider_not_found" };
    const apiKey = (await ctx.keystore.getKey(record.id, record.encrypted)) ?? "";
    if (record.vendor !== "openai-compat" && !apiKey.trim()) {
      return { ok: false, durationMs: 0, error: "api_key_missing" };
    }
    if (record.vendor === "openai-compat" && !record.baseUrl.trim()) {
      return { ok: false, durationMs: 0, error: "base_url_missing" };
    }

    const provider = createProvider({
      id: record.id,
      label: record.label,
      vendor: record.vendor,
      baseUrl: record.baseUrl,
      apiKey,
      defaultModel: record.defaultModel,
      tags: record.tags,
    });

    const start = Date.now();
    try {
      const stream = provider.complete({
        model: record.defaultModel,
        systemPrompt: "You reply with a single character.",
        temperature: 0,
        maxTokens: 16,
        messages: [{ role: "user", content: "ping" }],
      });
      let done = false;
      for await (const chunk of stream) {
        if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
        if (chunk.type === "done") {
          done = true;
          break;
        }
      }
      if (!done) throw new Error("no_response");
      return { ok: true, durationMs: Date.now() - start };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, durationMs: Date.now() - start, error: message };
    }
  });
}
