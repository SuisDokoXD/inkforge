# apps/desktop — Electron Shell Patterns

## Process Layout

```
src/main/
├── index.ts                  app entry: createWindow + register IPC + migrations
├── window.ts                 BrowserWindow factory
├── menu.ts                   app menu
├── ipc/                      one file per domain: <domain>.ts
│   └── register.ts           imports + invokes all registerXxxHandlers
└── services/                 business logic, called from ipc handlers
src/preload/
└── index.ts                  contextBridge.exposeInMainWorld('inkforge', api)
src/renderer/
├── src/
│   ├── App.tsx               router
│   ├── pages/                page-level components
│   ├── components/           shared components
│   ├── stores/app-store.ts   zustand global state
│   └── lib/api.ts            typed wrappers around window.inkforge
```

## Adding an IPC Handler

1. Create `src/main/ipc/<domain>.ts`:
```ts
import { ipcMain } from "electron";
import type { MyFeatureFooInput, MyFeatureFooResponse } from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

export function registerMyFeatureHandlers(): void {
  ipcMain.handle("my-feature:foo", async (_e, input: MyFeatureFooInput): Promise<MyFeatureFooResponse> => {
    const ctx = getAppContext();
    // ... call into services or repos ...
    return { /* ... */ };
  });
}
```
Use literal channel string (mirrors `ipcChannels.myFeatureFoo`). Do not import the const here — keeps coupling low.

2. Register in `src/main/ipc/register.ts`:
```ts
import { registerMyFeatureHandlers } from "./my-feature";
// inside registerIpcHandlers(getWindow):
registerMyFeatureHandlers();
// or registerMyFeatureHandlers(getWindow);  if you need window for streaming
```

3. Wire preload (`src/preload/index.ts`):
```ts
const api: InkforgeApi = {
  myFeature: {
    foo: (input) => ipcRenderer.invoke(ipcChannels.myFeatureFoo, input),
  },
  // ...
};
```

4. Renderer wrapper (`src/renderer/src/lib/api.ts`):
```ts
export const myFeatureApi = {
  foo: (input: MyFeatureFooInput): Promise<MyFeatureFooResponse> => api().myFeature.foo(input),
};
```

## Service Layer

`src/main/services/<name>-service.ts`. Pure functions that take input + return output (or async iterables for streaming). No `ipcMain` references — services are testable without Electron.

`getAppContext()` exposes `{db, ...}` — use this to access SQLite.

## LLM Streaming Pattern

```ts
import { resolveProviderRecord, resolveApiKey, streamText } from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";
import { buildRagBlock } from "./rag-service";

// 1. Resolve provider via scene binding (fallback to caller-provided id, then first provider)
const resolved = resolveSceneBinding("main_generation", {
  explicitProviderId: input.providerId,    // optional caller override
});
const provider = resolveProviderRecord(resolved.providerId ?? input.providerId);
if (!provider) { /* emit error done */ return; }
const apiKey = await resolveApiKey(provider);

// 2. Inject RAG block (optional)
const ragBlock = buildRagBlock(input.projectId, queryText);  // returns "" if no hits
const userMessage = ragBlock ? `${ragBlock}\n${baseUserMessage}` : baseUserMessage;

// 3. Stream
const stream = streamText({
  providerRecord: provider,
  apiKey,
  model: input.model ?? resolved.model ?? provider.defaultModel,
  systemPrompt: "...",
  userMessage,
  temperature: 0.7,
  maxTokens: 1000,
});
for await (const chunk of stream) {
  if (chunk.type === "delta" && chunk.textDelta) {
    accumulated += chunk.textDelta;
    window?.webContents.send("my-feature:chunk", { id, textDelta: chunk.textDelta });
  }
  if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
  if (chunk.type === "done" && chunk.usage) usage = chunk.usage;
}
```

`scene_keys` available: `analyze | quick | chat | skill | tavern | auto-writer | review | daily-summary | letter` (advanced) → mapped to `outline_generation | main_generation | extract | summarize | inline` (basic). See `scene-binding-service.ts` `ADVANCED_TO_BASIC`.

## Rate Limiting

`services/rate-limiter.ts` provides `RateLimiter({max, windowMs})`. Used by analysis / quick-action / chat to prevent burst.

## Renderer State

- **Global**: zustand `useAppStore` — settings, currentProjectId/currentChapterId, panel toggles, streaming buffers.
- **Server**: TanStack Query — `queryKey: ["entity", projectId]`. Invalidate via `queryClient.invalidateQueries`.
- **Local UI state**: `useState` in components.

## Verify Scripts

`apps/desktop/scripts/verify-*.cjs` — Node CLI scripts that open temp SQLite, run migrations, exercise repo functions, assert correctness.

When adding a new feature: add `verify-<name>.cjs` + register in `package.json` `scripts.verify:all`.

## Pitfall: ABI mismatch

verify scripts use system Node. Dev/package mode uses Electron. The same `better_sqlite3.node` binary cannot serve both. Switch via the guarded helper:

```bash
pnpm --filter @inkforge/desktop sqlite:status
pnpm --filter @inkforge/desktop sqlite:node      # for verify/tests
pnpm --filter @inkforge/desktop sqlite:electron  # for dev/package
```

If a prebuilt binary does not exist for the current Node/Electron target, the helper falls back to `node-gyp rebuild` and prints the native toolchain error directly.
