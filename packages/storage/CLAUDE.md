# packages/storage — Schema & Repositories

> SQLite via better-sqlite3 (synchronous). Migrations append-only. Chapter content lives in `.md` files on disk; DB stores metadata only.

## Migrations

File: `src/migrations.ts`. Array of `{ version: number, name: string, up: (db) => void }` objects.

**Current head version: v28.** (47 tables.)

Append new migration at end of array. Never edit existing entries.

```ts
{
  version: 27,           // next available
  name: "your_feature",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS your_table (...);
      ALTER TABLE existing_table ADD COLUMN new_col TEXT;
    `);
    // For seed data, use prepare().run() inside migration
  },
}
```

Verify pattern: `apps/desktop/scripts/verify-migrations.cjs` validates table list + index list + version count. **Bump `EXPECTED_MAX_VERSION`** + add expected tables/indexes when adding migration.

## Migration milestones (read for context)

| Range | Theme |
|---|---|
| v1 | Core: `projects`, `chapters`, `providers`, `ai_feedbacks` |
| v2 | `outline_cards`, `daily_logs`, `app_settings` |
| v3-v4 | `skills`, `tavern_cards`, `characters` |
| v5-v6 | Tavern wiring: `character_sync_log`, `tavern_sessions`, `tavern_messages` |
| v8-v10 | `world_entries`, `research_notes`, review trio (`review_dimensions/reports/findings`) |
| v12 | `provider_keys` — multi-key strategy with cooldown |
| v13-v18 | Bookshelf cluster: `book_cover`, `chapter_log`, `chapter_snapshot`, `auto_writer_run`, `achievements`, `character_letter`, `scene_binding`, `sample_lib`, `world_relationship` |
| **v19-v20** | **Projects table augmented**: `synopsis/genre/sub_genre/tags/master_outline/pre_refine_master_outline` (v19) + `global_worldview` + `materials` table (v20) |
| v21 | `chapter_summaries` — cross-chapter memory for AutoWriter |
| v22 | `world_entries` triggers (`keys/position/probability`) for SillyTavern-style world-info activation |
| v23-v26 | World Pack system (`world_pack`, `world_pack_entries`, `project_world_pack_slots`), `author_note`, `character_card_import` fingerprinting, `voice_profile`, `world_info_trace` |

## Critical Schemas (verbatim — DO NOT GUESS)

### `projects` (v1 + v19 + v20)

```sql
-- v1 base
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,           -- NOT 'title'
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,     -- ISO-8601 string
  daily_goal INTEGER NOT NULL DEFAULT 1000,
  last_opened TEXT
);
-- v19 additions (ALTER TABLE)
ALTER TABLE projects ADD COLUMN synopsis TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN genre TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN sub_genre TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags));
ALTER TABLE projects ADD COLUMN master_outline TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN pre_refine_master_outline TEXT;
-- v20 addition
ALTER TABLE projects ADD COLUMN global_worldview TEXT NOT NULL DEFAULT '';
```

`ProjectRecord` (camelCase): `{id, name, path, createdAt, dailyGoal, lastOpened, synopsis, genre, subGenre, tags, masterOutline, preRefineMasterOutline, globalWorldview}`.

**Historical note**: v1 projects was bare-bones (no creative metadata). The ainovel port in early May 2026 assumed `title/synopsis/genre/tags/masterOutline` already existed and broke verify-scripts. v19/v20 retrofitted them via `ALTER TABLE` with safe defaults. **When adding fields to existing tables, always default to `''` / `'[]'` / `0` so older rows remain valid.**

### `chapters`

```sql
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  title TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  word_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,        -- relative path under project dir, e.g. "chapters/foo.md"
  updated_at TEXT
);
```

`ChapterRecord`: `{id, projectId, parentId, title, order, status, wordCount, filePath, updatedAt}`.

**Content NOT in DB.** Read with `readChapterFile(project.path, chapter.filePath)` from `fs-layout.ts`.

### `outline_cards`

```sql
CREATE TABLE outline_cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,                -- nullable: card may be project-level
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  "order" INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`OutlineCardRecord`: `{id, projectId, chapterId, title, content, status, order, createdAt, updatedAt}`.

### `providers`

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  vendor TEXT NOT NULL,                       -- 'anthropic'|'openai'|'gemini'|'openai-compat'
  base_url TEXT NOT NULL DEFAULT '',
  default_model TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',            -- JSON array
  api_key_enc TEXT, api_key_iv TEXT, api_key_tag TEXT,
  stored_in_keychain INTEGER NOT NULL DEFAULT 0
);
```

## Repository Pattern

Each repo file in `src/repositories/<entity>-repo.ts`:

```ts
import type { DB } from "../db";
import type { EntityRecord } from "@inkforge/shared";

interface Row { /* snake_case DB columns */ }
function toRecord(row: Row): EntityRecord { /* camelCase mapping */ }

export interface CreateEntityRow { /* camelCase input */ }

export function insertEntity(db: DB, input: CreateEntityRow): EntityRecord {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO ... VALUES (?, ?, ...)`).run(input.id, ...);
  return getEntity(db, input.id)!;
}

export function listEntities(db: DB, projectId: string): EntityRecord[] {
  const rows = db.prepare(`SELECT * FROM ... WHERE project_id = ?`).all(projectId) as Row[];
  return rows.map(toRecord);
}
```

Always re-export from `src/index.ts`.

## fs-layout (chapter file IO)

```ts
import { readChapterFile, writeChapterFile, nextChapterFileName } from "@inkforge/storage";

const md = readChapterFile(project.path, chapter.filePath);
writeChapterFile(project.path, "chapters/foo.md", "# Title\n\nbody");
const newPath = nextChapterFileName(project.path, "新章节");  // collision-safe
```

Snapshots, autosaves, covers also have helpers — see `fs-layout.ts` exports.

## RAG search functions (rag-repo)

Exposed:
- `ragSearchWorldEntries(db, projectId, queries: string[], limit) → WorldEntryHit[]`
- `ragSearchCharacters(db, projectId, queries, limit) → CharacterHit[]`
- `ragSearchResearchNotes(db, projectId, queries, limit) → ResearchHit[]`
- `ragSearchSampleChunks(db, projectId, queries, limit) → SampleChunkHit[]`

LIKE-based with project-id hard-filter. Caller (in `apps/desktop/src/main/services/rag-service.ts`) extracts queries from the user's prompt using sliding 2-char Chinese windows.

## Polymorphic FK Pattern (world_relationships)

`world_relationships.src_id/dst_id` are not FK (kind can be character or world_entry). Cleanup is application-layer:
```ts
import { cleanupOrphanRelationships } from "@inkforge/storage";
// in delete_character / delete_world_entry handlers:
cleanupOrphanRelationships(db, projectId, "character" | "world_entry", endpointId);
```
