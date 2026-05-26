import type { DB } from "../db";
import type {
  WorldEntryPosition,
  WorldEntryRecord,
  WorldEntrySelectiveLogic,
} from "@inkforge/shared";

// 数据库行映射类型。snake_case 对应 SQLite 列。
// v22 加 keys/position/probability；v25 加 secondary_keys/selective_logic/case_sensitive/constant/extensions。
type WorldEntryRow = {
  id: string;
  project_id: string;
  category: string;
  title: string;
  content: string;
  aliases: string;
  tags: string;
  keys: string;
  position: string;
  probability: number;
  // ----- v25 CCv3 兼容字段 -----
  secondary_keys: string;
  selective_logic: string;
  case_sensitive: number;
  constant: number;
  extensions: string;
  created_at: string;
  updated_at: string;
};

// 解析 JSON 字符串数组列；坏数据回退空数组而不抛错，避免一条脏数据带塌整页查询。
function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x));
    }
  } catch {
    // fallthrough
  }
  return [];
}

// 解析 JSON object 列（用于 v25 extensions）。坏数据回退空对象。
function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallthrough
  }
  return {};
}

// position 列校验已在 SQL CHECK 约束里，这里再做一次软兜底，
// 防止旧客户端写入了 schema 升级前的脏值导致 TS 端类型不安全。
function coercePosition(value: unknown): WorldEntryPosition {
  if (value === "after" || value === "at_depth") return value;
  return "before";
}

// v25 selective_logic 列软兜底。
function coerceSelectiveLogic(value: unknown): WorldEntrySelectiveLogic {
  if (
    value === "not_all" ||
    value === "not_any" ||
    value === "and_all"
  ) {
    return value;
  }
  return "and_any";
}

function rowToRecord(row: WorldEntryRow): WorldEntryRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    title: row.title,
    content: row.content,
    aliases: parseStringArray(row.aliases),
    tags: parseStringArray(row.tags),
    keys: parseStringArray(row.keys),
    position: coercePosition(row.position),
    probability: Number.isFinite(row.probability) ? row.probability : 100,
    // ----- v25 CCv3 兼容字段 -----
    secondaryKeys: parseStringArray(row.secondary_keys ?? "[]"),
    selectiveLogic: coerceSelectiveLogic(row.selective_logic),
    caseSensitive: row.case_sensitive === 1,
    constant: row.constant === 1,
    extensions: parseJsonObject(row.extensions ?? "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertWorldEntryInput {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  // v22 字段全部可选，省略走 SQL DEFAULT，老调用方无需改即可继续工作。
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  // ----- v25 CCv3 兼容字段（可选；省略走 SQL DEFAULT）-----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

// 插入新条目。v22/v25 字段省略时由 SQL DEFAULT 兜底。
export function insertWorldEntry(
  db: DB,
  input: InsertWorldEntryInput,
): WorldEntryRecord {
  const now = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? now;
  const row: WorldEntryRow = {
    id: input.id,
    project_id: input.projectId,
    category: input.category,
    title: input.title,
    content: input.content ?? "",
    aliases: JSON.stringify(input.aliases ?? []),
    tags: JSON.stringify(input.tags ?? []),
    keys: JSON.stringify(input.keys ?? []),
    position: input.position ?? "before",
    probability: input.probability ?? 100,
    secondary_keys: JSON.stringify(input.secondaryKeys ?? []),
    selective_logic: input.selectiveLogic ?? "and_any",
    case_sensitive: input.caseSensitive ? 1 : 0,
    constant: input.constant ? 1 : 0,
    extensions: JSON.stringify(input.extensions ?? {}),
    created_at: now,
    updated_at: updatedAt,
  };
  db.prepare(
    `INSERT INTO world_entries
       (id, project_id, category, title, content, aliases, tags,
        keys, position, probability,
        secondary_keys, selective_logic, case_sensitive, constant, extensions,
        created_at, updated_at)
     VALUES (@id, @project_id, @category, @title, @content, @aliases, @tags,
             @keys, @position, @probability,
             @secondary_keys, @selective_logic, @case_sensitive, @constant, @extensions,
             @created_at, @updated_at)`,
  ).run(row);
  return rowToRecord(row);
}

export interface UpdateWorldEntryInput {
  id: string;
  category?: string;
  title?: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  // v22 字段：未传 = 不动该列。
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  // ----- v25 CCv3 兼容字段：未传 = 不动该列 -----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
}

// 局部更新：未传字段保留原值（典型的 PATCH 语义）。
// v22/v25 字段同样支持单独更新，便于 UI 上只调 position 不动 content 这类细粒度操作。
export function updateWorldEntry(
  db: DB,
  input: UpdateWorldEntryInput,
): WorldEntryRecord {
  const existing = db
    .prepare(`SELECT * FROM world_entries WHERE id = ?`)
    .get(input.id) as WorldEntryRow | undefined;
  if (!existing) throw new Error(`WorldEntry not found: ${input.id}`);
  const next: WorldEntryRow = {
    ...existing,
    category: input.category ?? existing.category,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    aliases:
      input.aliases !== undefined ? JSON.stringify(input.aliases) : existing.aliases,
    tags: input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags,
    keys:
      input.keys !== undefined ? JSON.stringify(input.keys) : existing.keys,
    position: input.position ?? existing.position,
    probability:
      input.probability !== undefined ? input.probability : existing.probability,
    secondary_keys:
      input.secondaryKeys !== undefined
        ? JSON.stringify(input.secondaryKeys)
        : existing.secondary_keys,
    selective_logic: input.selectiveLogic ?? existing.selective_logic,
    case_sensitive:
      input.caseSensitive !== undefined
        ? input.caseSensitive
          ? 1
          : 0
        : existing.case_sensitive,
    constant:
      input.constant !== undefined
        ? input.constant
          ? 1
          : 0
        : existing.constant,
    extensions:
      input.extensions !== undefined
        ? JSON.stringify(input.extensions)
        : existing.extensions,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE world_entries SET
       category = @category,
       title = @title,
       content = @content,
       aliases = @aliases,
       tags = @tags,
       keys = @keys,
       position = @position,
       probability = @probability,
       secondary_keys = @secondary_keys,
       selective_logic = @selective_logic,
       case_sensitive = @case_sensitive,
       constant = @constant,
       extensions = @extensions,
       updated_at = @updated_at
     WHERE id = @id`,
  ).run(next);
  return rowToRecord(next);
}

export function getWorldEntryById(
  db: DB,
  id: string,
): WorldEntryRecord | null {
  const row = db
    .prepare(`SELECT * FROM world_entries WHERE id = ?`)
    .get(id) as WorldEntryRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface ListWorldEntriesOptions {
  projectId: string;
  category?: string;
  search?: string;
  limit?: number;
}

// 列表查询：按项目 + 可选类目 + 可选模糊搜索，按更新时间倒序。
// 模糊搜索覆盖 title / aliases / tags / content（v22 后也覆盖 keys / secondary_keys，
// 因为它们都是用户可见的可搜索字段）。
export function listWorldEntries(
  db: DB,
  options: ListWorldEntriesOptions,
): WorldEntryRecord[] {
  const clauses: string[] = [`project_id = ?`];
  const params: Array<string | number> = [options.projectId];
  if (options.category && options.category !== "全部") {
    clauses.push(`category = ?`);
    params.push(options.category);
  }
  if (options.search && options.search.trim().length > 0) {
    const like = `%${options.search.trim()}%`;
    clauses.push(
      `(title LIKE ? OR aliases LIKE ? OR tags LIKE ? OR keys LIKE ? OR secondary_keys LIKE ? OR content LIKE ?)`,
    );
    params.push(like, like, like, like, like, like);
  }
  const limit = options.limit ?? 500;
  const sql = `SELECT * FROM world_entries
               WHERE ${clauses.join(" AND ")}
               ORDER BY updated_at DESC
               LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as WorldEntryRow[];
  return rows.map(rowToRecord);
}

export function deleteWorldEntry(db: DB, id: string): void {
  db.prepare(`DELETE FROM world_entries WHERE id = ?`).run(id);
}

export interface SearchWorldEntriesOptions {
  projectId: string;
  query: string;
  limit?: number;
}

/**
 * 全文检索（用于 review-engine 的 worldbuilding 维度）。
 * rank 排序：完全等于 title > alias 命中 > title 模糊命中。
 * keys / secondary_keys 字段也加入搜索域，便于"按概念关键词"找到条目。
 */
export function searchWorldEntries(
  db: DB,
  options: SearchWorldEntriesOptions,
): WorldEntryRecord[] {
  const query = options.query.trim();
  if (!query) return [];
  const limit = options.limit ?? 50;
  const titleLike = `%${query}%`;
  const aliasJsonLike = `%"${query.replace(/"/g, '\\"')}"%`;
  const rows = db
    .prepare(
      `SELECT *,
              CASE
                WHEN title = ? THEN 3
                WHEN aliases LIKE ? THEN 2
                WHEN keys LIKE ? THEN 2
                WHEN secondary_keys LIKE ? THEN 2
                WHEN title LIKE ? THEN 1
                ELSE 0
              END AS rank
       FROM world_entries
       WHERE project_id = ?
         AND (title LIKE ? OR aliases LIKE ? OR keys LIKE ? OR secondary_keys LIKE ? OR content LIKE ?)
       ORDER BY rank DESC, updated_at DESC
       LIMIT ?`,
    )
    .all(
      query,
      aliasJsonLike,
      aliasJsonLike,
      aliasJsonLike,
      titleLike,
      options.projectId,
      titleLike,
      aliasJsonLike,
      aliasJsonLike,
      aliasJsonLike,
      titleLike,
      limit,
    ) as (WorldEntryRow & { rank: number })[];
  return rows.map(rowToRecord);
}
