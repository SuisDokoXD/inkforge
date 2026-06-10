import type { DB } from "./db";

export interface Migration {
  version: number;
  name: string;
  up: (db: DB) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "init_core_tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          daily_goal INTEGER NOT NULL DEFAULT 1000,
          last_opened TEXT
        );

        CREATE TABLE IF NOT EXISTS chapters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          parent_id TEXT,
          title TEXT NOT NULL,
          "order" INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'draft',
          word_count INTEGER NOT NULL DEFAULT 0,
          file_path TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);

        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          vendor TEXT NOT NULL,
          base_url TEXT NOT NULL DEFAULT '',
          default_model TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          api_key_enc TEXT,
          api_key_iv TEXT,
          api_key_tag TEXT,
          stored_in_keychain INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ai_feedbacks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          trigger TEXT NOT NULL,
          created_at TEXT NOT NULL,
          dismissed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_feedbacks_chapter ON ai_feedbacks(chapter_id);
        CREATE INDEX IF NOT EXISTS idx_feedbacks_project ON ai_feedbacks(project_id);
      `);
    },
  },
  {
    version: 2,
    name: "m1_outline_daily_settings",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS outline_cards (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          chapter_id TEXT,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_outline_project ON outline_cards(project_id);
        CREATE INDEX IF NOT EXISTS idx_outline_chapter ON outline_cards(chapter_id);

        CREATE TABLE IF NOT EXISTS daily_logs (
          date TEXT NOT NULL,
          project_id TEXT NOT NULL,
          words_added INTEGER NOT NULL DEFAULT 0,
          goal_hit INTEGER NOT NULL DEFAULT 0,
          summary TEXT,
          PRIMARY KEY(date, project_id),
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_daily_project ON daily_logs(project_id);

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 3,
    name: "m3_skills",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          variables TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(variables)),
          triggers TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(triggers)),
          binding TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(binding)),
          output TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
          scope TEXT NOT NULL CHECK(scope IN ('global', 'project', 'community')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 4,
    name: "m3_tavern_cards_and_characters",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tavern_cards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          persona TEXT NOT NULL,
          avatar_path TEXT,
          provider_id TEXT NOT NULL,
          model TEXT NOT NULL,
          temperature REAL NOT NULL DEFAULT 0.7,
          linked_novel_character_id TEXT,
          sync_mode TEXT NOT NULL DEFAULT 'two-way'
            CHECK(sync_mode IN ('two-way', 'snapshot', 'detached')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_tavern_cards_name ON tavern_cards(name);
        CREATE INDEX IF NOT EXISTS idx_tavern_cards_provider ON tavern_cards(provider_id);

        CREATE TABLE IF NOT EXISTS characters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          persona TEXT,
          traits TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(traits)),
          backstory TEXT NOT NULL DEFAULT '',
          relations TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(relations)),
          linked_tavern_card_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_characters_project_name ON characters(project_id, name);
      `);
    },
  },
  {
    version: 5,
    name: "m3_character_sync_log",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS character_sync_log (
          id TEXT PRIMARY KEY,
          novel_char_id TEXT NOT NULL,
          tavern_card_id TEXT,
          field TEXT NOT NULL CHECK(field IN ('persona', 'backstory', 'traits')),
          old_value TEXT NOT NULL,
          new_value TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('novel_to_card', 'card_to_novel', 'manual_merge')),
          at TEXT NOT NULL,
          FOREIGN KEY(novel_char_id) REFERENCES characters(id) ON DELETE CASCADE,
          FOREIGN KEY(tavern_card_id) REFERENCES tavern_cards(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_character_sync_log_novel_at
          ON character_sync_log(novel_char_id, at DESC);
        CREATE INDEX IF NOT EXISTS idx_character_sync_log_tavern_at
          ON character_sync_log(tavern_card_id, at DESC);
      `);
    },
  },
  {
    version: 6,
    name: "m3_tavern_sessions_messages",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tavern_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          topic TEXT NOT NULL,
          mode TEXT NOT NULL CHECK(mode IN ('director', 'auto')),
          budget_tokens INTEGER NOT NULL CHECK(budget_tokens > 0),
          summary_provider_id TEXT,
          summary_model TEXT,
          last_k INTEGER NOT NULL DEFAULT 6 CHECK(last_k > 0),
          created_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(summary_provider_id) REFERENCES providers(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tavern_sessions_project_created
          ON tavern_sessions(project_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS tavern_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          character_id TEXT,
          role TEXT NOT NULL CHECK(role IN ('director', 'character', 'summary')),
          content TEXT NOT NULL,
          tokens_in INTEGER NOT NULL DEFAULT 0 CHECK(tokens_in >= 0),
          tokens_out INTEGER NOT NULL DEFAULT 0 CHECK(tokens_out >= 0),
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES tavern_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY(character_id) REFERENCES tavern_cards(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tavern_messages_session_created
          ON tavern_messages(session_id, created_at ASC);
      `);
    },
  },
  {
    version: 7,
    name: "m3_indexes_and_unique_partials",
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_skills_scope_enabled ON skills(scope, enabled);
        CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at DESC);

        CREATE UNIQUE INDEX IF NOT EXISTS uidx_tavern_cards_linked_novel_character
          ON tavern_cards(linked_novel_character_id)
          WHERE linked_novel_character_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS uidx_characters_linked_tavern_card
          ON characters(linked_tavern_card_id)
          WHERE linked_tavern_card_id IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_tavern_messages_session_role_created
          ON tavern_messages(session_id, role, created_at ASC);
      `);
    },
  },
  {
    version: 8,
    name: "m4_world_entries",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS world_entries (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          aliases TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases)),
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_world_project ON world_entries(project_id, category, title);
        CREATE INDEX IF NOT EXISTS idx_world_updated ON world_entries(updated_at DESC);
      `);
    },
  },
  {
    version: 9,
    name: "m4_research_notes",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS research_notes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          topic TEXT NOT NULL,
          source_url TEXT,
          source_title TEXT,
          source_provider TEXT NOT NULL DEFAULT 'manual',
          excerpt TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_research_project_created
          ON research_notes(project_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_research_topic
          ON research_notes(project_id, topic);
      `);
    },
  },
  {
    version: 10,
    name: "m4_review_tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_dimensions (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('builtin','skill')),
          builtin_id TEXT,
          skill_id TEXT,
          scope TEXT NOT NULL DEFAULT 'book' CHECK(scope IN ('book','chapter','selection')),
          severity TEXT NOT NULL DEFAULT 'warn' CHECK(severity IN ('info','warn','error')),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_review_dim_project
          ON review_dimensions(project_id, "order");

        CREATE TABLE IF NOT EXISTS review_reports (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          range_kind TEXT NOT NULL CHECK(range_kind IN ('book','chapter','range')),
          range_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(range_ids)),
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','cancelled')),
          summary TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(summary)),
          error TEXT,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_review_reports_project_started
          ON review_reports(project_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS review_findings (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL,
          dimension_id TEXT NOT NULL,
          chapter_id TEXT,
          excerpt TEXT NOT NULL DEFAULT '',
          excerpt_start INTEGER,
          excerpt_end INTEGER,
          severity TEXT NOT NULL CHECK(severity IN ('info','warn','error')),
          suggestion TEXT NOT NULL DEFAULT '',
          dismissed INTEGER NOT NULL DEFAULT 0 CHECK(dismissed IN (0,1)),
          created_at TEXT NOT NULL,
          FOREIGN KEY(report_id) REFERENCES review_reports(id) ON DELETE CASCADE,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_findings_report_severity
          ON review_findings(report_id, severity);
        CREATE INDEX IF NOT EXISTS idx_findings_chapter
          ON review_findings(chapter_id);
      `);
    },
  },
  {
    version: 11,
    name: "m4_daily_summary_columns",
    up: (db) => {
      const existingColumns = db
        .prepare(`PRAGMA table_info(daily_logs)`)
        .all()
        .map((row) => (row as { name: string }).name);
      if (!existingColumns.includes("summary")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN summary TEXT`);
      }
      if (!existingColumns.includes("summary_provider_id")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN summary_provider_id TEXT`);
      }
      if (!existingColumns.includes("summary_model")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN summary_model TEXT`);
      }
      if (!existingColumns.includes("generated_at")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN generated_at TEXT`);
      }
    },
  },
  {
    version: 12,
    name: "m4_provider_keys_and_strategy",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_keys (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          label TEXT NOT NULL,
          api_key_enc TEXT,
          api_key_iv TEXT,
          api_key_tag TEXT,
          stored_in_keychain INTEGER NOT NULL DEFAULT 0 CHECK(stored_in_keychain IN (0,1)),
          weight INTEGER NOT NULL DEFAULT 1 CHECK(weight >= 0),
          disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
          last_failed_at TEXT,
          fail_count INTEGER NOT NULL DEFAULT 0 CHECK(fail_count >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_provider_keys_provider
          ON provider_keys(provider_id, disabled);
      `);

      const providerCols = db
        .prepare(`PRAGMA table_info(providers)`)
        .all()
        .map((row) => (row as { name: string }).name);
      if (!providerCols.includes("key_strategy")) {
        db.exec(
          `ALTER TABLE providers ADD COLUMN key_strategy TEXT NOT NULL DEFAULT 'single'`,
        );
      }
      if (!providerCols.includes("cooldown_ms")) {
        db.exec(
          `ALTER TABLE providers ADD COLUMN cooldown_ms INTEGER NOT NULL DEFAULT 60000`,
        );
      }

      // Data migration: copy provider.api_key_* to provider_keys as the first key.
      const providerRows = db
        .prepare(
          `SELECT id, api_key_enc, api_key_iv, api_key_tag, stored_in_keychain
           FROM providers`,
        )
        .all() as Array<{
        id: string;
        api_key_enc: string | null;
        api_key_iv: string | null;
        api_key_tag: string | null;
        stored_in_keychain: number;
      }>;
      const now = new Date().toISOString();
      const insertKey = db.prepare(
        `INSERT OR IGNORE INTO provider_keys
           (id, provider_id, label, api_key_enc, api_key_iv, api_key_tag,
            stored_in_keychain, weight, disabled, fail_count, created_at, updated_at)
         VALUES (@id, @provider_id, @label, @api_key_enc, @api_key_iv, @api_key_tag,
                 @stored_in_keychain, 1, 0, 0, @created_at, @updated_at)`,
      );
      for (const row of providerRows) {
        const hasSecret = !!(
          row.api_key_enc &&
          row.api_key_iv &&
          row.api_key_tag
        );
        if (!hasSecret && row.stored_in_keychain !== 1) continue;
        insertKey.run({
          id: `${row.id}-primary`,
          provider_id: row.id,
          label: "主 Key",
          api_key_enc: row.api_key_enc,
          api_key_iv: row.api_key_iv,
          api_key_tag: row.api_key_tag,
          stored_in_keychain: row.stored_in_keychain ?? 0,
          created_at: now,
          updated_at: now,
        });
      }
    },
  },
  {
    version: 13,
    name: "m6d_chapters_updated_at",
    up: (db) => {
      const cols = db
        .prepare(`PRAGMA table_info(chapters)`)
        .all()
        .map((row) => (row as { name: string }).name);
      if (!cols.includes("updated_at")) {
        // Two-step add: SQLite forbids adding a NOT NULL column without a
        // constant default. CURRENT_TIMESTAMP is non-constant, so we add
        // nullable, backfill, then upgrade implicitly via app code.
        db.exec(`ALTER TABLE chapters ADD COLUMN updated_at TEXT`);
        const now = new Date().toISOString();
        db.prepare(`UPDATE chapters SET updated_at = ? WHERE updated_at IS NULL`).run(now);
      }
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_chapters_project_updated
           ON chapters(project_id, updated_at DESC)`,
      );
    },
  },
  {
    // ===================================================================
    // M7 · Bookshelf Module
    // 6 张全新表，承载：书籍封面 / 章节来源标签 / 每章独立日志（含条目）
    // / 章节快照（细粒度撤回）/ AutoWriter 运行记录。
    // 不修改任何现有表 DDL；旧用户数据 100% 兼容。
    // ===================================================================
    version: 14,
    name: "m7_bookshelf_tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS book_covers (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          mime TEXT NOT NULL,
          uploaded_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_book_covers_project
          ON book_covers(project_id);

        CREATE TABLE IF NOT EXISTS chapter_origin_tags (
          chapter_id TEXT PRIMARY KEY,
          origin TEXT NOT NULL CHECK(origin IN ('ai-auto','ai-assisted','manual')),
          tagged_at TEXT NOT NULL,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_origin_tags_origin
          ON chapter_origin_tags(origin);

        CREATE TABLE IF NOT EXISTS chapter_logs (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL UNIQUE,
          project_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_logs_project
          ON chapter_logs(project_id);

        CREATE TABLE IF NOT EXISTS chapter_log_entries (
          id TEXT PRIMARY KEY,
          log_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('progress','ai-run','manual','daily-reminder')),
          author TEXT NOT NULL CHECK(author IN ('user','ai')),
          content TEXT NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
          created_at TEXT NOT NULL,
          FOREIGN KEY(log_id) REFERENCES chapter_logs(id) ON DELETE CASCADE,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_log_entries_chapter_created
          ON chapter_log_entries(chapter_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS chapter_snapshots (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          kind TEXT NOT NULL
            CHECK(kind IN ('manual','pre-ai','post-ai','pre-rewrite','pre-restore','auto-periodic')),
          label TEXT,
          content_hash TEXT NOT NULL,
          file_path TEXT NOT NULL,
          word_count INTEGER NOT NULL DEFAULT 0 CHECK(word_count >= 0),
          run_id TEXT,
          agent_role TEXT
            CHECK(agent_role IS NULL OR agent_role IN ('planner','writer','critic','reflector')),
          source_message_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_snapshots_chapter_created
          ON chapter_snapshots(chapter_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chapter_snapshots_run
          ON chapter_snapshots(run_id);

        CREATE TABLE IF NOT EXISTS auto_writer_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK(status IN ('running','paused','completed','failed','stopped')),
          user_ideas TEXT NOT NULL DEFAULT '',
          user_corrections TEXT NOT NULL DEFAULT '[]'
            CHECK(json_valid(user_corrections)),
          agents_config TEXT NOT NULL DEFAULT '[]'
            CHECK(json_valid(agents_config)),
          outline_json TEXT,
          stats_json TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(stats_json)),
          last_snapshot_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
          FOREIGN KEY(last_snapshot_id) REFERENCES chapter_snapshots(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auto_writer_runs_chapter
          ON auto_writer_runs(chapter_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_auto_writer_runs_project
          ON auto_writer_runs(project_id, created_at DESC);
      `);
    },
  },
  {
    // ===================================================================
    // M8 · 活人感套装（Companion + 成就 + 角色来信）
    // 2 张新表（桌宠为纯前端 localStorage，无表）：
    //   - achievements_unlocked: 成就解锁记录（按 project + achievement_id 唯一）
    //   - character_letters: 角色来信（笔下人物 AI 写给作者的"信件"）
    // 不修改任何现有表 DDL；旧用户数据 100% 兼容。
    // ===================================================================
    version: 15,
    name: "m8_lively_companion_achievements_letters",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS achievements_unlocked (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          achievement_id TEXT NOT NULL,
          unlocked_at TEXT NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(metadata)),
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uidx_achievements_project_aid
          ON achievements_unlocked(project_id, achievement_id);
        CREATE INDEX IF NOT EXISTS idx_achievements_project_unlocked
          ON achievements_unlocked(project_id, unlocked_at DESC);

        CREATE TABLE IF NOT EXISTS character_letters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          character_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          tone TEXT NOT NULL DEFAULT 'neutral'
            CHECK(tone IN ('grateful','complaint','curious','encouraging','neutral')),
          generated_at TEXT NOT NULL,
          read INTEGER NOT NULL DEFAULT 0,
          pinned INTEGER NOT NULL DEFAULT 0,
          dismissed INTEGER NOT NULL DEFAULT 0,
          provider_id TEXT,
          model TEXT,
          tokens_in INTEGER NOT NULL DEFAULT 0,
          tokens_out INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_character_letters_project_generated
          ON character_letters(project_id, generated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_character_letters_character
          ON character_letters(character_id, generated_at DESC);
      `);
    },
  },
  {
    // ===================================================================
    // v16 · Scene Bindings (ported from ainovel)
    //
    // 双模式场景路由：basic（5 类）和 advanced（9 种）共存，由
    // app_settings.sceneRoutingMode 决定生效模式，切换不丢失另一套配置。
    //
    // 每行代表一个 scene_key 的 provider/model 绑定（NULL 表示用默认）。
    // ===================================================================
    version: 16,
    name: "scene_bindings_dual_mode",
    up: (db) => {
      const now = new Date().toISOString();
      db.exec(`
        CREATE TABLE IF NOT EXISTS scene_bindings_basic (
          scene_key TEXT PRIMARY KEY,
          provider_id TEXT NULL,
          model TEXT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS scene_bindings_advanced (
          scene_key TEXT PRIMARY KEY,
          provider_id TEXT NULL,
          model TEXT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE SET NULL
        );
      `);

      const seedBasic = db.prepare(
        `INSERT OR IGNORE INTO scene_bindings_basic (scene_key, updated_at) VALUES (?, ?)`,
      );
      const seedAdvanced = db.prepare(
        `INSERT OR IGNORE INTO scene_bindings_advanced (scene_key, updated_at) VALUES (?, ?)`,
      );
      const basicKeys = [
        "outline_generation",
        "main_generation",
        "extract",
        "summarize",
        "inline",
      ];
      const advancedKeys = [
        "analyze",
        "quick",
        "chat",
        "skill",
        "tavern",
        "auto-writer",
        "review",
        "daily-summary",
        "letter",
      ];
      for (const key of basicKeys) seedBasic.run(key, now);
      for (const key of advancedKeys) seedAdvanced.run(key, now);

      // Seed default app_settings.sceneRoutingMode if absent
      db.prepare(
        `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('sceneRoutingMode', 'basic')`,
      ).run();
    },
  },
  {
    // ===================================================================
    // v17 · Sample Library (ported from ainovel)
    //
    // 参考小说库：每个 lib 是一本导入的小说，按章节切块成 sample_chunks
    // 用于 RAG 召回。CASCADE FK 确保删 lib 自动清 chunks。
    // ===================================================================
    version: 17,
    name: "sample_library_rag",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sample_libs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          author TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sample_libs_project
          ON sample_libs(project_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS sample_chunks (
          id TEXT PRIMARY KEY,
          lib_id TEXT NOT NULL,
          ordinal INTEGER NOT NULL,
          chapter_title TEXT,
          text TEXT NOT NULL,
          FOREIGN KEY(lib_id) REFERENCES sample_libs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sample_chunks_lib
          ON sample_chunks(lib_id, ordinal);
      `);
    },
  },
  {
    // ===================================================================
    // v18 · World Relationships (graph, ported from ainovel)
    //
    // 多态关系表：src/dst 端点既可以是 character 也可以是 world_entry。
    // 由于多态无法 FK，src_id/dst_id 由应用层维护一致性（删 character /
    // world_entry 时清理孤儿 relationships）。project_id 走 FK CASCADE。
    // ===================================================================
    version: 18,
    name: "world_relationships",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS world_relationships (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          src_kind TEXT NOT NULL CHECK(src_kind IN ('character', 'world_entry')),
          src_id TEXT NOT NULL,
          dst_kind TEXT NOT NULL CHECK(dst_kind IN ('character', 'world_entry')),
          dst_id TEXT NOT NULL,
          label TEXT,
          weight INTEGER NOT NULL DEFAULT 5 CHECK(weight BETWEEN 1 AND 10),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE(project_id, src_kind, src_id, dst_kind, dst_id)
        );
        CREATE INDEX IF NOT EXISTS idx_world_rel_project
          ON world_relationships(project_id);
        CREATE INDEX IF NOT EXISTS idx_world_rel_src
          ON world_relationships(project_id, src_kind, src_id);
        CREATE INDEX IF NOT EXISTS idx_world_rel_dst
          ON world_relationships(project_id, dst_kind, dst_id);
      `);
    },
  },
  {
    // ===================================================================
    // v19 · Project creative metadata + AI outline generation support
    //
    // Adds writing-context fields to projects (synopsis/genre/tags), the
    // master outline text itself, plus undo snapshots for refine actions.
    // Fields default to '' / '[]' so existing rows remain valid.
    // ===================================================================
    version: 19,
    name: "project_creative_meta_for_outline_gen",
    up: (db) => {
      db.exec(`
        ALTER TABLE projects ADD COLUMN synopsis TEXT NOT NULL DEFAULT '';
        ALTER TABLE projects ADD COLUMN genre TEXT NOT NULL DEFAULT '';
        ALTER TABLE projects ADD COLUMN sub_genre TEXT NOT NULL DEFAULT '';
        ALTER TABLE projects ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'
          CHECK(json_valid(tags));
        ALTER TABLE projects ADD COLUMN master_outline TEXT NOT NULL DEFAULT '';
        ALTER TABLE projects ADD COLUMN pre_refine_master_outline TEXT;
      `);
    },
  },
  {
    // ===================================================================
    // v20 · Per-book global worldview + standalone materials library
    //
    // - projects.global_worldview: free-form prose blob, fed into AutoWriter
    //   Writer/Critic prompts so that every chapter shares the same world.
    // - materials: a top-level "素材库" backing store for inspiration notes,
    //   character fragments, scratch ideas etc. (orthogonal to the existing
    //   sample_libs / world_entries / research_notes which serve other roles).
    // ===================================================================
    version: 20,
    name: "global_worldview_and_materials",
    up: (db) => {
      db.exec(`
        ALTER TABLE projects ADD COLUMN global_worldview TEXT NOT NULL DEFAULT '';

        CREATE TABLE IF NOT EXISTS materials (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('note','idea','fragment','reference')),
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_materials_project_updated
          ON materials(project_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_materials_project_kind
          ON materials(project_id, kind);
      `);
    },
  },
  {
    // ===================================================================
    // v21 · Chapter summaries —— v22+ AutoWriter 跨章节失忆修复。
    //
    // 每写完一章异步生成 100~200 字摘要存进来，AutoWriter 启动时把
    // 全部前序章摘要 + 最近 1 章细节注入到 prompt，解决长篇人物 OOC /
    // 世界观漂移。chapter_id PK 保证一章只有一份摘要，重生成走 UPSERT。
    //
    // model 字段记录由哪个模型摘要的，便于事后切换主力 LLM 时一键重摘。
    // ===================================================================
    version: 21,
    name: "chapter_summaries",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chapter_summaries (
          chapter_id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          model TEXT,
          provider_id TEXT,
          source_word_count INTEGER NOT NULL DEFAULT 0,
          generated_at TEXT NOT NULL,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_summaries_project
          ON chapter_summaries(project_id, generated_at DESC);
      `);
    },
  },
  {
    // ===================================================================
    // v22 · World Info 自动注入触发字段（SillyTavern Lorebook 风格最小集）
    //
    // 原 world_entries 只是被动展示库；Skill / 写作流程里要查相关设定
    // 全靠人去翻。本迁移给每条 entry 加三列，让 skill-engine 的
    // world-info-activator 能在用户选段 / 章节文本里扫到关键词后自动注入。
    //
    //   - keys：额外触发关键词（JSON 数组）。注意 title + aliases 也会
    //     被 activator 自动当作关键词使用，所以本字段留空也能工作；
    //     用于设定"按概念触发"（如条目"魔法体系"被"施法/灵气"触发）。
    //   - position：注入位置，before=拼到 user prompt 前 / after=拼到后 /
    //     at_depth=保留接口（未来 chat-history 倒数注入）。
    //   - probability：命中后再掷一次的概率（0-100）。默认 100 = 永远注入。
    //
    // 卡牌级配置（scan_depth / token_budget / recursion / timed_effects）
    // 见 Phase 3 world_packs 表，不在此处展开。
    // ===================================================================
    version: 22,
    name: "world_info_triggers",
    up: (db) => {
      db.exec(`
        ALTER TABLE world_entries
          ADD COLUMN keys TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(keys));
        ALTER TABLE world_entries
          ADD COLUMN position TEXT NOT NULL DEFAULT 'before'
          CHECK(position IN ('before','after','at_depth'));
        ALTER TABLE world_entries
          ADD COLUMN probability INTEGER NOT NULL DEFAULT 100
          CHECK(probability >= 0 AND probability <= 100);
      `);
    },
  },
  {
    // ===================================================================
    // v23 · 世界观卡牌系统（Worldview Cards）
    //
    // 用户痛点：原 world_entries 只能在单个项目内组织世界观，无法跨项目
    // 复用，更没法"准备好几套完整世界观，需要时挑一张/融合多张"。
    //
    // 本迁移建三张表实现"卡牌库 + 插槽"模型：
    //   - world_packs：跨项目的卡牌主表，一张卡 = 一套世界观预设
    //   - world_pack_entries：卡牌内部的世界观条目，结构与 world_entries
    //     相似但独立存储（避免给 world_entries 加 nullable project_id）
    //   - project_world_pack_slots：项目的卡牌插槽（多对多），引用而不复制
    //
    // 引用式（reference）：插槽只存"用了哪张卡"，卡的 entries 留在卡库中。
    // skill-engine 的 world-info-activator 在调用时把"项目自有 entries +
    // 已插槽卡牌的 entries"合并喂入即可。
    //
    // origin/parent_pack_ids：fused 卡可追溯到源卡的祖先链，便于"看看
    // 这张卡是哪几张融合来的"。
    // ===================================================================
    version: 23,
    name: "worldview_cards",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS world_packs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          tagline TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          cover_path TEXT,
          cover_mime TEXT,
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          scan_depth INTEGER NOT NULL DEFAULT 3,
          token_budget INTEGER NOT NULL DEFAULT 1500,
          recursion_enabled INTEGER NOT NULL DEFAULT 0,
          origin TEXT NOT NULL DEFAULT 'user'
            CHECK(origin IN ('user','fused','imported')),
          parent_pack_ids TEXT NOT NULL DEFAULT '[]'
            CHECK(json_valid(parent_pack_ids)),
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_world_packs_updated
          ON world_packs(updated_at DESC);

        CREATE TABLE IF NOT EXISTS world_pack_entries (
          id TEXT PRIMARY KEY,
          pack_id TEXT NOT NULL REFERENCES world_packs(id) ON DELETE CASCADE,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          aliases TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases)),
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          keys TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(keys)),
          position TEXT NOT NULL DEFAULT 'before'
            CHECK(position IN ('before','after','at_depth')),
          probability INTEGER NOT NULL DEFAULT 100
            CHECK(probability >= 0 AND probability <= 100),
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_world_pack_entries_pack
          ON world_pack_entries(pack_id, "order");

        CREATE TABLE IF NOT EXISTS project_world_pack_slots (
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          pack_id TEXT NOT NULL REFERENCES world_packs(id) ON DELETE CASCADE,
          slot_order INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          added_at TEXT NOT NULL,
          PRIMARY KEY (project_id, pack_id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_world_pack_slots_project
          ON project_world_pack_slots(project_id, slot_order);
      `);
    },
  },
  {
    // ===================================================================
    // v24 · Author's Note（作者口吻/全局风格批注）
    //
    // 给每个项目挂一段"永远注入"的指令文本，控制 LLM 整体口吻 / 风格 /
    // 禁忌词等。比 system_prompt 灵活：position=before 拼在 user prompt
    // 前，after 拼在后；enabled 可临时关掉而不删内容。
    //
    // 一项目一条（UNIQUE project_id）。后续若要章节级覆盖，加新表
    // chapter_author_notes 即可，不影响这张表。
    // ===================================================================
    version: 24,
    name: "author_notes",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS author_notes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL UNIQUE
            REFERENCES projects(id) ON DELETE CASCADE,
          text TEXT NOT NULL DEFAULT '',
          position TEXT NOT NULL DEFAULT 'before'
            CHECK(position IN ('before','after')),
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_author_notes_project
          ON author_notes(project_id);
      `);
    },
  },
  {
    // ===================================================================
    // v25 · CCv3 兼容字段（Character Card V3 character_book 对齐）
    //
    // Character Card V3 (kwaroran/character-card-spec-v3) 是当下角色卡 +
    // 嵌入式 Lorebook 的事实标准（RisuAI/SillyTavern/Chub 都吃这一套）。
    // 对齐这套 schema 后，InkForge 卡牌可以与全网 50k+ 角色卡 / lorebook
    // 互通——卡牌库瞬间扩容到外部生态。
    //
    // 新加字段（同时给 world_entries 和 world_pack_entries）：
    //   secondary_keys  —— 次级关键词。配合 selective_logic 做多关键词组合判定
    //   selective_logic —— and_any/not_all/not_any/and_all（SillyTavern 同名）
    //   case_sensitive  —— 关键词是否区分大小写（CCv3 字段）
    //   constant        —— 永远激活（绕过关键词命中），用于"必读设定"
    //   extensions      —— CCv3 自定义扩展字段（JSON 对象，存第三方扩展数据）
    //
    // character_card_imports：记录导入指纹（hash + 源路径 + 导入时间），
    //   避免用户重复拖入同一张卡造成卡库噪声。
    // ===================================================================
    version: 25,
    name: "ccv3_compat_fields",
    up: (db) => {
      db.exec(`
        ALTER TABLE world_pack_entries
          ADD COLUMN secondary_keys TEXT NOT NULL DEFAULT '[]'
            CHECK(json_valid(secondary_keys));
        ALTER TABLE world_pack_entries
          ADD COLUMN selective_logic TEXT NOT NULL DEFAULT 'and_any'
            CHECK(selective_logic IN ('and_any','not_all','not_any','and_all'));
        ALTER TABLE world_pack_entries
          ADD COLUMN case_sensitive INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE world_pack_entries
          ADD COLUMN constant INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE world_pack_entries
          ADD COLUMN extensions TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(extensions));

        ALTER TABLE world_entries
          ADD COLUMN secondary_keys TEXT NOT NULL DEFAULT '[]'
            CHECK(json_valid(secondary_keys));
        ALTER TABLE world_entries
          ADD COLUMN selective_logic TEXT NOT NULL DEFAULT 'and_any'
            CHECK(selective_logic IN ('and_any','not_all','not_any','and_all'));
        ALTER TABLE world_entries
          ADD COLUMN case_sensitive INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE world_entries
          ADD COLUMN constant INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE world_entries
          ADD COLUMN extensions TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(extensions));

        CREATE TABLE IF NOT EXISTS character_card_imports (
          id TEXT PRIMARY KEY,
          source_path TEXT NOT NULL,
          content_hash TEXT NOT NULL UNIQUE,
          pack_id TEXT REFERENCES world_packs(id) ON DELETE SET NULL,
          imported_at TEXT NOT NULL,
          spec TEXT NOT NULL DEFAULT 'ccv3'
            CHECK(spec IN ('ccv3','ccv2','tavernai','sillytavern_lorebook','inkcard'))
        );
        CREATE INDEX IF NOT EXISTS idx_card_imports_hash
          ON character_card_imports(content_hash);
      `);
    },
  },
  {
    // ===================================================================
    // v26 · Voice Profile（写作声音档案）+ World Info Trace（激活诊断）
    //
    // voice_profiles：一项目一条"声音档案"——把用户的句法节奏、词汇登记、
    //   对话风格、情感温度等以结构化 JSON 存下来，所有 AI 生成 prompt
    //   都自动注入这段，避免"AI 用通用 GPT 口吻写你的小说"。
    //   灵感来自 Novel Engine 的 Voice Profile 问卷设计。
    //
    // world_info_traces：每次 World Info 激活的诊断快照。SillyTavern 一直
    //   只 console.log，用户问"为啥这条没生效"基本靠猜。我们把每条 entry
    //   是否命中、命中哪个 key、概率掷骰结果、token 占用都存下来，UI 上做
    //   面板可视化。每项目只保留最近 30 条（应用层定期清理）。
    // ===================================================================
    version: 26,
    name: "voice_profile_and_traces",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS voice_profiles (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL UNIQUE
            REFERENCES projects(id) ON DELETE CASCADE,
          answers TEXT NOT NULL DEFAULT '{}'
            CHECK(json_valid(answers)),
          prompt_block TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          completed_at TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS world_info_traces (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL
            REFERENCES projects(id) ON DELETE CASCADE,
          run_id TEXT,
          scene TEXT NOT NULL DEFAULT 'skill',
          scan_text_preview TEXT NOT NULL DEFAULT '',
          payload TEXT NOT NULL
            CHECK(json_valid(payload)),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_world_info_traces_project_time
          ON world_info_traces(project_id, created_at DESC);
      `);
    },
  },
  {
    version: 27,
    name: "expanded_material_kinds",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS materials_v27 (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN (
            'idea',
            'plot',
            'character',
            'location',
            'world',
            'fragment',
            'reference',
            'note'
          )),
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        INSERT INTO materials_v27 (
          id, project_id, kind, title, content, tags, created_at, updated_at
        )
        SELECT
          id, project_id, kind, title, content, tags, created_at, updated_at
        FROM materials;

        DROP TABLE materials;
        ALTER TABLE materials_v27 RENAME TO materials;

        CREATE INDEX IF NOT EXISTS idx_materials_project_updated
          ON materials(project_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_materials_project_kind
          ON materials(project_id, kind);
      `);
    },
  },
];

export function runMigrations(db: DB): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare(`SELECT version FROM schema_migrations`)
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  let appliedCount = 0;

  const insertStmt = db.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
  );

  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;
    const tx = db.transaction(() => {
      migration.up(db);
      insertStmt.run(migration.version, migration.name, new Date().toISOString());
    });
    tx();
    appliedCount += 1;
  }

  return appliedCount;
}
