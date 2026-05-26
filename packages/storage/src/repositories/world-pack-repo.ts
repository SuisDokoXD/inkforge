// =============================================================================
// 世界观卡牌（Worldview Cards）数据访问层
// =============================================================================
// 包含三张表的 CRUD：
//   - world_packs                 卡牌主表
//   - world_pack_entries          卡牌内的世界观条目
//   - project_world_pack_slots    项目-卡牌插槽（多对多）
//
// 以及一个桥接函数 `listSlottedPackEntriesAsWorldEntries`，
// 把已插槽卡牌的 entries 投影成 WorldEntryRecord 形态，
// 直接喂给 skill-engine 的 world-info-activator。
//
// 设计要点：
//   - Reference 模式：插槽只引用卡牌 id，不复制条目；卡牌更新自动反映到所有项目
//   - Pack 与 Entry 分表，避免给 world_entries 加 nullable project_id
//   - origin/parent_pack_ids 支持 fused 卡追溯祖先
//   - v25 起 entries 含 CCv3 兼容字段（secondary_keys/selective_logic/case_sensitive/constant/extensions）
// =============================================================================

import type { DB } from "../db";
import type {
  ProjectWorldPackSlotRecord,
  WorldEntryPosition,
  WorldEntryRecord,
  WorldEntrySelectiveLogic,
  WorldPackEntryRecord,
  WorldPackOrigin,
  WorldPackRecord,
} from "@inkforge/shared";

// --------------------------------------------------------------------------
// 通用工具
// --------------------------------------------------------------------------

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    /* fallthrough */
  }
  return [];
}

// 解析 JSON object（用于 v25 extensions）。坏数据回退空对象。
function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fallthrough */
  }
  return {};
}

function coercePosition(value: unknown): WorldEntryPosition {
  if (value === "after" || value === "at_depth") return value;
  return "before";
}

function coerceOrigin(value: unknown): WorldPackOrigin {
  if (value === "fused" || value === "imported") return value;
  return "user";
}

// v25 selective_logic 列软兜底。
function coerceSelectiveLogic(value: unknown): WorldEntrySelectiveLogic {
  if (value === "not_all" || value === "not_any" || value === "and_all") {
    return value;
  }
  return "and_any";
}

// --------------------------------------------------------------------------
// world_packs
// --------------------------------------------------------------------------

type WorldPackRow = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  cover_path: string | null;
  cover_mime: string | null;
  tags: string;
  scan_depth: number;
  token_budget: number;
  recursion_enabled: number;
  origin: string;
  parent_pack_ids: string;
  version: number;
  created_at: string;
  updated_at: string;
};

function packRowToRecord(row: WorldPackRow): WorldPackRecord {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    coverPath: row.cover_path,
    coverMime: row.cover_mime,
    tags: parseStringArray(row.tags),
    scanDepth: row.scan_depth,
    tokenBudget: row.token_budget,
    recursionEnabled: row.recursion_enabled === 1,
    origin: coerceOrigin(row.origin),
    parentPackIds: parseStringArray(row.parent_pack_ids),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertWorldPackInput {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  coverPath?: string | null;
  coverMime?: string | null;
  tags?: string[];
  scanDepth?: number;
  tokenBudget?: number;
  recursionEnabled?: boolean;
  origin?: WorldPackOrigin;
  parentPackIds?: string[];
}

// 新建卡牌。各可选字段缺省由 SQL DEFAULT 兜底，保证最简调用方式 `{ id, name }` 也能工作。
export function insertWorldPack(
  db: DB,
  input: InsertWorldPackInput,
): WorldPackRecord {
  const now = new Date().toISOString();
  const row: WorldPackRow = {
    id: input.id,
    name: input.name,
    tagline: input.tagline ?? "",
    description: input.description ?? "",
    cover_path: input.coverPath ?? null,
    cover_mime: input.coverMime ?? null,
    tags: JSON.stringify(input.tags ?? []),
    scan_depth: input.scanDepth ?? 3,
    token_budget: input.tokenBudget ?? 1500,
    recursion_enabled: input.recursionEnabled ? 1 : 0,
    origin: input.origin ?? "user",
    parent_pack_ids: JSON.stringify(input.parentPackIds ?? []),
    version: 1,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO world_packs
       (id, name, tagline, description, cover_path, cover_mime, tags,
        scan_depth, token_budget, recursion_enabled,
        origin, parent_pack_ids, version, created_at, updated_at)
     VALUES (@id, @name, @tagline, @description, @cover_path, @cover_mime, @tags,
             @scan_depth, @token_budget, @recursion_enabled,
             @origin, @parent_pack_ids, @version, @created_at, @updated_at)`,
  ).run(row);
  return packRowToRecord(row);
}

export interface UpdateWorldPackInput {
  id: string;
  name?: string;
  tagline?: string;
  description?: string;
  coverPath?: string | null;
  coverMime?: string | null;
  tags?: string[];
  scanDepth?: number;
  tokenBudget?: number;
  recursionEnabled?: boolean;
}

// 更新卡牌主表。每次更新自动递增 version + 推进 updated_at，
// 方便未来做"卡牌内容变更后是否需要重跑融合"这类决策。
export function updateWorldPack(
  db: DB,
  input: UpdateWorldPackInput,
): WorldPackRecord {
  const existing = db
    .prepare(`SELECT * FROM world_packs WHERE id = ?`)
    .get(input.id) as WorldPackRow | undefined;
  if (!existing) throw new Error(`WorldPack not found: ${input.id}`);
  const next: WorldPackRow = {
    ...existing,
    name: input.name ?? existing.name,
    tagline: input.tagline ?? existing.tagline,
    description: input.description ?? existing.description,
    cover_path:
      input.coverPath !== undefined ? input.coverPath : existing.cover_path,
    cover_mime:
      input.coverMime !== undefined ? input.coverMime : existing.cover_mime,
    tags: input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags,
    scan_depth: input.scanDepth ?? existing.scan_depth,
    token_budget: input.tokenBudget ?? existing.token_budget,
    recursion_enabled:
      input.recursionEnabled !== undefined
        ? input.recursionEnabled
          ? 1
          : 0
        : existing.recursion_enabled,
    version: existing.version + 1,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE world_packs SET
       name = @name, tagline = @tagline, description = @description,
       cover_path = @cover_path, cover_mime = @cover_mime, tags = @tags,
       scan_depth = @scan_depth, token_budget = @token_budget,
       recursion_enabled = @recursion_enabled,
       version = @version, updated_at = @updated_at
     WHERE id = @id`,
  ).run(next);
  return packRowToRecord(next);
}

export function getWorldPackById(
  db: DB,
  id: string,
): WorldPackRecord | null {
  const row = db
    .prepare(`SELECT * FROM world_packs WHERE id = ?`)
    .get(id) as WorldPackRow | undefined;
  return row ? packRowToRecord(row) : null;
}

export interface ListWorldPacksOptions {
  search?: string;
  origin?: WorldPackOrigin;
  limit?: number;
}

// 列表查询。无 projectId 过滤 —— 卡牌库是全局资源，所有项目共享。
// 支持按名称/简介模糊搜索 + 来源过滤（如只看 fused 卡）。
export function listWorldPacks(
  db: DB,
  options: ListWorldPacksOptions = {},
): WorldPackRecord[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (options.origin) {
    clauses.push(`origin = ?`);
    params.push(options.origin);
  }
  if (options.search && options.search.trim().length > 0) {
    const like = `%${options.search.trim()}%`;
    clauses.push(`(name LIKE ? OR tagline LIKE ? OR description LIKE ? OR tags LIKE ?)`);
    params.push(like, like, like, like);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = options.limit ?? 200;
  const sql = `SELECT * FROM world_packs ${where}
               ORDER BY updated_at DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as WorldPackRow[];
  return rows.map(packRowToRecord);
}

// 删除卡牌。FK ON DELETE CASCADE 会自动清理：
//   - world_pack_entries 里属于本卡的所有 entries
//   - project_world_pack_slots 里所有指向本卡的插槽
// 调用方负责删除磁盘上的封面文件。
export function deleteWorldPack(db: DB, id: string): void {
  db.prepare(`DELETE FROM world_packs WHERE id = ?`).run(id);
}

// --------------------------------------------------------------------------
// world_pack_entries
// --------------------------------------------------------------------------

type WorldPackEntryRow = {
  id: string;
  pack_id: string;
  category: string;
  title: string;
  content: string;
  aliases: string;
  tags: string;
  keys: string;
  position: string;
  probability: number;
  order: number;
  // ----- v25 CCv3 兼容字段 -----
  secondary_keys: string;
  selective_logic: string;
  case_sensitive: number;
  constant: number;
  extensions: string;
  created_at: string;
  updated_at: string;
};

function packEntryRowToRecord(row: WorldPackEntryRow): WorldPackEntryRecord {
  return {
    id: row.id,
    packId: row.pack_id,
    category: row.category,
    title: row.title,
    content: row.content,
    aliases: parseStringArray(row.aliases),
    tags: parseStringArray(row.tags),
    keys: parseStringArray(row.keys),
    position: coercePosition(row.position),
    probability: Number.isFinite(row.probability) ? row.probability : 100,
    order: row.order,
    secondaryKeys: parseStringArray(row.secondary_keys ?? "[]"),
    selectiveLogic: coerceSelectiveLogic(row.selective_logic),
    caseSensitive: row.case_sensitive === 1,
    constant: row.constant === 1,
    extensions: parseJsonObject(row.extensions ?? "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertWorldPackEntryInput {
  id: string;
  packId: string;
  category: string;
  title: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  order?: number;
  // ----- v25 CCv3 兼容字段（可选；省略走 SQL DEFAULT）-----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
}

export function insertWorldPackEntry(
  db: DB,
  input: InsertWorldPackEntryInput,
): WorldPackEntryRecord {
  const now = new Date().toISOString();
  const row: WorldPackEntryRow = {
    id: input.id,
    pack_id: input.packId,
    category: input.category,
    title: input.title,
    content: input.content ?? "",
    aliases: JSON.stringify(input.aliases ?? []),
    tags: JSON.stringify(input.tags ?? []),
    keys: JSON.stringify(input.keys ?? []),
    position: input.position ?? "before",
    probability: input.probability ?? 100,
    order: input.order ?? 0,
    secondary_keys: JSON.stringify(input.secondaryKeys ?? []),
    selective_logic: input.selectiveLogic ?? "and_any",
    case_sensitive: input.caseSensitive ? 1 : 0,
    constant: input.constant ? 1 : 0,
    extensions: JSON.stringify(input.extensions ?? {}),
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO world_pack_entries
       (id, pack_id, category, title, content, aliases, tags,
        keys, position, probability, "order",
        secondary_keys, selective_logic, case_sensitive, constant, extensions,
        created_at, updated_at)
     VALUES (@id, @pack_id, @category, @title, @content, @aliases, @tags,
             @keys, @position, @probability, @order,
             @secondary_keys, @selective_logic, @case_sensitive, @constant, @extensions,
             @created_at, @updated_at)`,
  ).run(row);
  return packEntryRowToRecord(row);
}

export interface UpdateWorldPackEntryInput {
  id: string;
  category?: string;
  title?: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  keys?: string[];
  position?: WorldEntryPosition;
  probability?: number;
  order?: number;
  // ----- v25 CCv3 兼容字段：未传 = 不动该列 -----
  secondaryKeys?: string[];
  selectiveLogic?: WorldEntrySelectiveLogic;
  caseSensitive?: boolean;
  constant?: boolean;
  extensions?: Record<string, unknown>;
}

export function updateWorldPackEntry(
  db: DB,
  input: UpdateWorldPackEntryInput,
): WorldPackEntryRecord {
  const existing = db
    .prepare(`SELECT * FROM world_pack_entries WHERE id = ?`)
    .get(input.id) as WorldPackEntryRow | undefined;
  if (!existing) throw new Error(`WorldPackEntry not found: ${input.id}`);
  const next: WorldPackEntryRow = {
    ...existing,
    category: input.category ?? existing.category,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    aliases:
      input.aliases !== undefined ? JSON.stringify(input.aliases) : existing.aliases,
    tags: input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags,
    keys: input.keys !== undefined ? JSON.stringify(input.keys) : existing.keys,
    position: input.position ?? existing.position,
    probability:
      input.probability !== undefined ? input.probability : existing.probability,
    order: input.order !== undefined ? input.order : existing.order,
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
    `UPDATE world_pack_entries SET
       category = @category, title = @title, content = @content,
       aliases = @aliases, tags = @tags, keys = @keys,
       position = @position, probability = @probability,
       "order" = @order,
       secondary_keys = @secondary_keys, selective_logic = @selective_logic,
       case_sensitive = @case_sensitive, constant = @constant, extensions = @extensions,
       updated_at = @updated_at
     WHERE id = @id`,
  ).run(next);
  return packEntryRowToRecord(next);
}

export function getWorldPackEntryById(
  db: DB,
  id: string,
): WorldPackEntryRecord | null {
  const row = db
    .prepare(`SELECT * FROM world_pack_entries WHERE id = ?`)
    .get(id) as WorldPackEntryRow | undefined;
  return row ? packEntryRowToRecord(row) : null;
}

export function listWorldPackEntries(
  db: DB,
  packId: string,
): WorldPackEntryRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM world_pack_entries WHERE pack_id = ?
       ORDER BY "order" ASC, updated_at DESC`,
    )
    .all(packId) as WorldPackEntryRow[];
  return rows.map(packEntryRowToRecord);
}

export function deleteWorldPackEntry(db: DB, id: string): void {
  db.prepare(`DELETE FROM world_pack_entries WHERE id = ?`).run(id);
}

// --------------------------------------------------------------------------
// project_world_pack_slots
// --------------------------------------------------------------------------

type ProjectPackSlotRow = {
  project_id: string;
  pack_id: string;
  slot_order: number;
  enabled: number;
  added_at: string;
};

function slotRowToRecord(row: ProjectPackSlotRow): ProjectWorldPackSlotRecord {
  return {
    projectId: row.project_id,
    packId: row.pack_id,
    slotOrder: row.slot_order,
    enabled: row.enabled === 1,
    addedAt: row.added_at,
  };
}

export interface AddProjectPackSlotInput {
  projectId: string;
  packId: string;
  slotOrder?: number;
  enabled?: boolean;
}

// 把卡牌插入项目的插槽。同 (project, pack) 已存在时走 ON CONFLICT 更新顺序/启用态。
// 这样 UI 拖拽重新插同一卡的语义是"更新插槽"而不是"报错冲突"。
export function addProjectPackSlot(
  db: DB,
  input: AddProjectPackSlotInput,
): ProjectWorldPackSlotRecord {
  const row: ProjectPackSlotRow = {
    project_id: input.projectId,
    pack_id: input.packId,
    slot_order: input.slotOrder ?? 0,
    enabled: input.enabled === false ? 0 : 1,
    added_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO project_world_pack_slots
       (project_id, pack_id, slot_order, enabled, added_at)
     VALUES (@project_id, @pack_id, @slot_order, @enabled, @added_at)
     ON CONFLICT(project_id, pack_id) DO UPDATE SET
       slot_order = excluded.slot_order,
       enabled = excluded.enabled`,
  ).run(row);
  return slotRowToRecord(row);
}

export function removeProjectPackSlot(
  db: DB,
  projectId: string,
  packId: string,
): void {
  db.prepare(
    `DELETE FROM project_world_pack_slots WHERE project_id = ? AND pack_id = ?`,
  ).run(projectId, packId);
}

// 切换插槽启用态。返回更新后的记录；不存在返回 null（让上层决定是否报错）。
export function toggleProjectPackSlot(
  db: DB,
  projectId: string,
  packId: string,
  enabled: boolean,
): ProjectWorldPackSlotRecord | null {
  const existing = db
    .prepare(
      `SELECT * FROM project_world_pack_slots WHERE project_id = ? AND pack_id = ?`,
    )
    .get(projectId, packId) as ProjectPackSlotRow | undefined;
  if (!existing) return null;
  db.prepare(
    `UPDATE project_world_pack_slots SET enabled = ?
     WHERE project_id = ? AND pack_id = ?`,
  ).run(enabled ? 1 : 0, projectId, packId);
  return slotRowToRecord({ ...existing, enabled: enabled ? 1 : 0 });
}

// 批量重排：传一组 packIds，按数组顺序写 slot_order。
// 一次事务避免中间状态可见。
export function reorderProjectPackSlots(
  db: DB,
  projectId: string,
  orderedPackIds: string[],
): void {
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      `UPDATE project_world_pack_slots SET slot_order = ?
       WHERE project_id = ? AND pack_id = ?`,
    );
    orderedPackIds.forEach((packId, idx) => {
      stmt.run(idx, projectId, packId);
    });
  });
  tx();
}

export function listProjectPackSlots(
  db: DB,
  projectId: string,
): ProjectWorldPackSlotRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM project_world_pack_slots WHERE project_id = ?
       ORDER BY slot_order ASC, added_at ASC`,
    )
    .all(projectId) as ProjectPackSlotRow[];
  return rows.map(slotRowToRecord);
}

// --------------------------------------------------------------------------
// 桥接：项目已插槽卡牌的 entries → WorldEntryRecord 形态
// --------------------------------------------------------------------------

// 把已启用插槽的卡牌内 entries 全部读出来，投影成 WorldEntryRecord shape，
// 供 skill-engine 的 world-info-activator 与项目自有 entries 一起消费。
//
// 投影策略：
//   - projectId 字段填空串（卡牌是跨项目的，没有真实 projectId）
//   - v22/v25 字段全部透传（keys/position/probability/secondaryKeys/selectiveLogic/...）
//   - 不带 packId/order/createdAt 等卡牌专有字段，避免 activator 误用
//
// 这是一个读路径，纯查 + 内存投影；写路径用各自表的 CRUD。
export function listSlottedPackEntriesAsWorldEntries(
  db: DB,
  projectId: string,
): WorldEntryRecord[] {
  const rows = db
    .prepare(
      `SELECT e.*
       FROM world_pack_entries e
       INNER JOIN project_world_pack_slots s ON s.pack_id = e.pack_id
       WHERE s.project_id = ? AND s.enabled = 1
       ORDER BY s.slot_order ASC, e."order" ASC`,
    )
    .all(projectId) as WorldPackEntryRow[];
  return rows.map((row) => ({
    id: row.id,
    projectId: "", // 跨项目卡牌没有 projectId；activator 不读这个字段
    category: row.category,
    title: row.title,
    content: row.content,
    aliases: parseStringArray(row.aliases),
    tags: parseStringArray(row.tags),
    keys: parseStringArray(row.keys),
    position: coercePosition(row.position),
    probability: Number.isFinite(row.probability) ? row.probability : 100,
    secondaryKeys: parseStringArray(row.secondary_keys ?? "[]"),
    selectiveLogic: coerceSelectiveLogic(row.selective_logic),
    caseSensitive: row.case_sensitive === 1,
    constant: row.constant === 1,
    extensions: parseJsonObject(row.extensions ?? "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
