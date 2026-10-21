# packages/shared — Types & IPC Schema

> Single source of truth for IPC channels, request/response types, and domain records. **Imported by all other packages.** Has no dependencies of its own.

## Files

| File | Role |
|---|---|
| `src/domain.ts` | Entity records (Project/Chapter/Outline/...) — DB row shapes in camelCase |
| `src/ipc.ts` | `ipcChannels` const + per-channel input/output types + `IpcRequestMap` |
| `src/preload.ts` | `InkforgeApi` interface (preload-injected `window.inkforge`) |
| `src/i18n.ts` | UI translations (zh/en/ja) |
| `src/provider-catalog.ts` | LLM model catalog (vendor + known models) |
| `src/index.ts` | Barrel re-export |

## Adding a New IPC Channel

3 places to edit. The pattern uses TypeScript **interface declaration merging** (multiple `interface IpcRequestMap {...}` and `interface InkforgeApi {...}` blocks across the file are intentional).

### 1. Channel name (in `ipc.ts` `ipcChannels` const)

```ts
export const ipcChannels = {
  // ...existing
  myFeatureFoo: "my-feature:foo",
} as const;
```

### 2. Request/response types + IpcRequestMap (in `ipc.ts`)

Append at end of file (declaration merging with existing IpcRequestMap blocks):

```ts
// =====================================================================
// My Feature · IpcRequestMap extension
// =====================================================================

export interface MyFeatureFooInput {
  projectId: string;
  // ...
}
export interface MyFeatureFooResponse {
  // ...
}

export interface IpcRequestMap {
  [ipcChannels.myFeatureFoo]: { req: MyFeatureFooInput; res: MyFeatureFooResponse };
}
```

### 3. InkforgeApi sub-namespace (in `preload.ts`)

Append at end (declaration merging with existing InkforgeApi blocks):

```ts
import type { MyFeatureFooInput, MyFeatureFooResponse } from "./ipc";

export interface InkforgeApi {
  myFeature: {
    foo(input: MyFeatureFooInput): Promise<MyFeatureFooResponse>;
  };
}
```

Then wire in `apps/desktop/src/preload/index.ts` and `apps/desktop/src/renderer/src/lib/api.ts`.

## Adding a Domain Record

In `domain.ts`, add `interface FooRecord {...}` (camelCase fields). Export.

If the record is referenced by `IpcRequestMap`, add it to the `import type {...}` at top of `ipc.ts`.

## Build Output

`pnpm --filter @inkforge/shared build` emits `dist/`. **All downstream packages consume `dist/`, not `src/`.** Forgetting to rebuild shared after changes → "Cannot find module '@inkforge/shared'" or stale types.

## Pitfalls

- Type imports for `IpcRequestMap`-referenced types must be added to **both** the top of `ipc.ts` AND any `preload.ts` block where the type is referenced.
- Don't put runtime values in `domain.ts` — only type declarations + `as const` arrays (e.g. `SCENE_KEYS_BASIC`). Runtime helpers belong in service code.
- `Lang` type and `getAnalysisThreshold` etc. are exported from `i18n.ts`; don't recreate.
