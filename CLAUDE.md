# InkForge — Architecture Map

> Local-first AI novel-writing app. Electron 32 + React 18 + TipTap + better-sqlite3.
> All data stays local — no telemetry, no cloud sync.

## Monorepo Layout

```
inkforge-src/
├── apps/desktop/                 Electron shell (main + preload + renderer)
├── packages/shared/              types + IPC schema (depends on: nothing)
├── packages/storage/             better-sqlite3 + migrations + repos
├── packages/llm-core/            provider abstractions (anthropic/openai/gemini/openai-compat)
├── packages/skill-engine/        programmable Skills runtime
├── packages/tavern-engine/       multi-agent character chat
├── packages/auto-writer-engine/  4-Agent novel writing pipeline
├── packages/research-core/       web research
├── packages/review-engine/       chapter review dimensions
└── packages/editor/              TipTap extensions
```

Build deps: `shared → storage → others → desktop`. Always rebuild shared+storage before desktop typecheck.

## Data Flow

```
Renderer (React)
  ↓ window.inkforge.<ns>.<method>(input)        — preload-injected API
Preload (apps/desktop/src/preload/index.ts)
  ↓ ipcRenderer.invoke(channel, input)
Main IPC handler (apps/desktop/src/main/ipc/<name>.ts)
  ↓ calls service
Service (apps/desktop/src/main/services/<name>-service.ts)
  ↓ calls repo or llm-runtime
Storage repo (packages/storage/src/repositories/<name>-repo.ts)
  ↓ better-sqlite3 prepared stmt
SQLite (.inkforge.db) + chapter .md files in project dir
```

## Critical Pitfalls (read before editing)

1. **`ProjectRecord` evolved**: original v1 had only `{id, name, path, createdAt, dailyGoal, lastOpened}`. v19 added `synopsis/genre/subGenre/tags/masterOutline/preRefineMasterOutline`; v20 added `globalWorldview`. Defaults are `''` / `'[]'` so existing rows stay valid. **Lesson kept for history**: the original ainovel port assumed those fields existed pre-migration and broke verify-scripts — don't assume schema columns without checking `domain.ts` + `migrations.ts`.
2. **Chapter content lives in .md files on disk**, not in SQLite. `ChapterRecord.filePath` is relative. Use `readChapterFile/writeChapterFile/nextChapterFileName` from `packages/storage/src/fs-layout.ts`.
3. **shared/preload/storage build dist/ before downstream typecheck** — they're consumed via workspace pkg dist, not src.
4. **`@xyflow/react` and `@dagrejs/dagre`** are added (Module 3, World graph). React-flow style import needed.
5. **better-sqlite3 native binding ABI mismatch**:
   - Verify scripts use system Node (ABI 127 for Node 22)
   - Electron 32 uses ABI 128
   - Same prebuilt cannot serve both — need to swap via `prebuild-install --runtime=electron|node`.
6. **Migrations are append-only**: **current head at v26** (46 tables). Never rewrite earlier versions; add a new migration object at the end of `packages/storage/src/migrations.ts` and bump `EXPECTED_MAX_VERSION` in `verify-migrations.cjs`.
7. **RAG is keyword-based, not embeddings**: `rag-repo.ts` uses SQL LIKE over `world_entries / characters / research_notes / sample_chunks`. `rag-service.ts` extracts queries via 2-char Chinese sliding window. Don't claim "vector search" in commit messages.
8. **AutoWriter agent roles** are `planner | writer | critic | reflector` (canonical in `packages/shared/src/domain.ts` `AutoWriterAgentRole`; system prompts in `packages/auto-writer-engine/src/agent-roles.ts`). `reflector` runs after the chapter is assembled to update long-term memory (chapter summary, character hints). Earlier doc drafts mistakenly named the last role "editor" — fix on sight.

## Key Conventions

- **IPC channels**: kebab-case `domain:action`, declared in `packages/shared/src/ipc.ts` `ipcChannels`. Add typed req/res in `IpcRequestMap` (uses TypeScript declaration merging — multiple `interface IpcRequestMap {...}` in same file is intentional).
- **Service layer**: thin wrapper, throws on invalid input, returns serializable JSON. Long-running ops use `streamText` async iterator + `BrowserWindow.webContents.send` for chunks.
- **Renderer state**: zustand `useAppStore` (`apps/desktop/src/renderer/src/stores/app-store.ts`). React-Query for server state.
- **i18n**: `packages/shared/src/i18n.ts` (zh / en / ja).

## Module Map (where stuff lives)

| Domain | shared types | storage repo | main service | main IPC | renderer |
|---|---|---|---|---|---|
| Project | `ProjectRecord` | `project-repo` | `project-service` (in ipc/project.ts) | `project.ts` | `pages/WorkspacePage.tsx` |
| Chapter | `ChapterRecord` | `chapter-repo` + `fs-layout` | inline in ipc/chapter.ts | `chapter.ts` | `ChapterTree`, `EditorPane` |
| Outline | `OutlineCardRecord` | `outline-repo` | inline in ipc/outline.ts, `outline-generation.ts` | `outline.ts` | `pages/OutlinePage.tsx` |
| Provider/LLM | `ProviderRecord`, `ProviderKeyRecord` | `provider-repo` + `provider-key-repo` | `llm-runtime`, `chat`, `quick-action`, `analysis` | `llm.ts`, `provider.ts`, `provider-key.ts` | `ProviderSettingsPanel` |
| Skill | `SkillRecord` | `skill-repo` | `skill-service` | `skill.ts` | `pages/SkillPage.tsx` |
| Auto-Writer | `AutoWriterRunRecord` | `auto-writer-run-repo` | `auto-writer-service` | `auto-writer.ts` | `pages/AutoWriterPage.tsx`, `auto-writer/` |
| Character (novel) | `NovelCharacterRecord` | `novel-character-repo` | `novel-character-service`, `character-sync-service` | `character.ts` | `pages/CharacterPage.tsx`, `character/` |
| Character Card | `TavernCardRecord`, `CharacterCardImportRecord` | `tavern-card-repo`, `character-card-import-repo` | `character-card-service` (+ `ccv3-codec`, `png-text`) | `character-card.ts` | `character/` |
| Tavern | `TavernSessionRecord`, `TavernMessageRecord`, `CharacterSyncLogRecord` | `tavern-session-repo`, `tavern-message-repo`, `character-sync-log-repo` | `tavern-round-service` | `tavern.ts` | `pages/TavernPage.tsx` |
| World | `WorldEntryRecord`, `WorldRelationshipRecord` | `world-entry-repo`, `world-relationship-repo` | `world-service`, `world-info-trace-repo` | `world.ts`, `world-relationship.ts` | `pages/WorldPage.tsx` + `world/WorldGraph.tsx` |
| World Pack | `WorldPackRecord`, `WorldPackEntryRecord`, `WorldPackSlotRecord` | `world-pack-repo` | `world-pack-service`, `world-pack-fusion-service` (`build-fusion-prompt`, `parse-fusion-output`) | `world-pack.ts` | `world-pack/` |
| Author Note | `AuthorNoteRecord` | `author-note-repo` | `author-note-service` + `prompt-context/author-note-context.ts` | `author-note.ts` | `AuthorNotePanel.tsx` |
| Voice Profile | `VoiceProfileRecord` | `voice-profile-repo` | `voice-profile-service` + `prompt-context/voice-profile-context.ts` | (inline in voice IPC) | `voice-profile/VoiceProfileDialog.tsx` |
| Review | `ReviewDimensionRecord`, `ReviewReportRecord`, `ReviewFindingRecord` | `review-dimension-repo`, `review-report-repo`, `review-finding-repo` | `review-service` | `review.ts` | `pages/ReviewPage.tsx`, `review/ReviewReportPanel.tsx` |
| Research | `ResearchNoteRecord` | `research-note-repo` | `research-service` (+ `packages/research-core`) | `research.ts` | `pages/ResearchPage.tsx` |
| Scene Bindings | `SceneBindingRecord`, `SceneRoutingMode` | `scene-binding-repo` | `scene-binding-service` | `scene-binding.ts` | `SceneRoutingPanel.tsx` (in SettingsDialog) |
| RAG / Sample Lib | `SampleLibRecord`, `SampleChunkRecord` | `sample-lib-repo`, `rag-repo` | `rag-service`, `rag-smart-router`, `sample-lib-service` | `sample-lib.ts` | `SampleLibPanel.tsx` (in SettingsDialog) |
| Materials | `MaterialRecord` | `material-repo` | `material-service` | `material.ts` | `pages/MaterialsPage.tsx` |
| Bookshelf | `BookCoverRecord` | `book-cover-repo` | `cover-service` | `book-cover.ts` | `bookshelf/` |
| Chapter Log | `ChapterLogEntryRecord`, `ChapterOriginTag` | `chapter-log-repo`, `chapter-origin-tag-repo` | `chapter-log-service` | `chapter-log.ts` | `log/` |
| Snapshot | `ChapterSnapshotRecord` | `chapter-snapshot-repo` | `snapshot-service` | `snapshot.ts` | `snapshot/` |
| Letter | `CharacterLetterRecord` | `character-letter-repo` | `letter-service` | `letter.ts` | `pages/LetterInboxPage.tsx` |
| Achievement | `AchievementRecord` | `achievement-repo` | `achievement-service` | `achievement.ts` | `pages/AchievementHallPage.tsx`, `achievement/` |
| Companion (桌宠) | (renderer-only state) | — | — | — | `companion/` + `stores/companion-store.ts` + `companion-festivals.ts`, `companion-lines.ts` |
| Market | `MarketItemRecord` (planned) | — | `market-service` | `market.ts` | (panels TBD) |
| Terminal | — | — | (uses `node-pty`) | `terminal.ts` | `TerminalPanel` (xterm.js) |
| Export/Import | (in ipc.ts) | (uses fs-layout, `zip-reader`, `zip-writer`) | `export-service`, `chapter-import-service` | `project-export.ts` | `ExportDialog.tsx` |

## Per-Package CLAUDE.md

- [packages/shared/CLAUDE.md](packages/shared/CLAUDE.md) — types + IPC declaration merging
- [packages/storage/CLAUDE.md](packages/storage/CLAUDE.md) — migrations (v1-v26) + repos + exact schemas
- [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md) — main IPC + service patterns + LLM streaming
- [packages/auto-writer-engine/CLAUDE.md](packages/auto-writer-engine/CLAUDE.md) — 4-Agent pipeline (planner/writer/critic/reflector)

Packages without dedicated CLAUDE.md (read source directly): `llm-core`, `skill-engine`, `tavern-engine`, `research-core`, `review-engine`, `editor`.
