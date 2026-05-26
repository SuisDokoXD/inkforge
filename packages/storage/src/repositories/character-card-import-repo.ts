// =============================================================================
// Character Card Imports（角色卡导入指纹）数据访问层
// =============================================================================
// 记录每次外部角色卡 / lorebook 的导入指纹，用于：
//   1) 同一文件二次拖入时秒判重，提示用户"已导入过，是否覆盖"
//   2) 删除原 pack 时联级清掉指纹（FK SET NULL → 失联状态可被 UI 显示为"已删除"）
//   3) 审计：spec 字段表明这是哪种规范（ccv3 / ccv2 / tavernai / sillytavern_lorebook / inkcard）
//
// content_hash 走 sha256(规范化后的卡牌 JSON / PNG bytes)，调用方负责计算。
// =============================================================================

import type { DB } from "../db";

// 数据库行映射类型。
type CharacterCardImportRow = {
  id: string;
  source_path: string;
  content_hash: string;
  pack_id: string | null;
  imported_at: string;
  spec: string;
};

// 卡导入规范枚举。与 migration v25 的 CHECK 约束一致。
export type CharacterCardSpec =
  | "ccv3"
  | "ccv2"
  | "tavernai"
  | "sillytavern_lorebook"
  | "inkcard";

export interface CharacterCardImportRecord {
  id: string;
  sourcePath: string;
  contentHash: string;
  packId: string | null;
  importedAt: string;
  spec: CharacterCardSpec;
}

function coerceSpec(value: unknown): CharacterCardSpec {
  if (
    value === "ccv2" ||
    value === "tavernai" ||
    value === "sillytavern_lorebook" ||
    value === "inkcard"
  ) {
    return value;
  }
  return "ccv3";
}

function rowToRecord(row: CharacterCardImportRow): CharacterCardImportRecord {
  return {
    id: row.id,
    sourcePath: row.source_path,
    contentHash: row.content_hash,
    packId: row.pack_id,
    importedAt: row.imported_at,
    spec: coerceSpec(row.spec),
  };
}

export interface RecordCardImportInput {
  id: string;
  sourcePath: string;
  contentHash: string;
  packId: string | null;
  spec?: CharacterCardSpec;
}

// 记录一次导入。content_hash 走 UNIQUE 约束：
//   - 命中已存在 hash：DO NOTHING + 返回已存在记录（让上层走"已导入"分支）
//   - 否则正常插入
export function recordCardImport(
  db: DB,
  input: RecordCardImportInput,
): CharacterCardImportRecord {
  const now = new Date().toISOString();
  const row: CharacterCardImportRow = {
    id: input.id,
    source_path: input.sourcePath,
    content_hash: input.contentHash,
    pack_id: input.packId,
    imported_at: now,
    spec: input.spec ?? "ccv3",
  };
  db.prepare(
    `INSERT INTO character_card_imports
       (id, source_path, content_hash, pack_id, imported_at, spec)
     VALUES (@id, @source_path, @content_hash, @pack_id, @imported_at, @spec)
     ON CONFLICT(content_hash) DO NOTHING`,
  ).run(row);
  return getCardImportByHash(db, input.contentHash)!;
}

// 按指纹查重：UI 拖文件后先调这个判断"是否已导入"。
export function getCardImportByHash(
  db: DB,
  contentHash: string,
): CharacterCardImportRecord | null {
  const row = db
    .prepare(`SELECT * FROM character_card_imports WHERE content_hash = ?`)
    .get(contentHash) as CharacterCardImportRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function getCardImportById(
  db: DB,
  id: string,
): CharacterCardImportRecord | null {
  const row = db
    .prepare(`SELECT * FROM character_card_imports WHERE id = ?`)
    .get(id) as CharacterCardImportRow | undefined;
  return row ? rowToRecord(row) : null;
}

// 列表：用于"导入历史"页面。按导入时间倒序，limit 默认 200。
export function listCardImports(
  db: DB,
  limit = 200,
): CharacterCardImportRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM character_card_imports
       ORDER BY imported_at DESC LIMIT ?`,
    )
    .all(limit) as CharacterCardImportRow[];
  return rows.map(rowToRecord);
}

export function deleteCardImport(db: DB, id: string): void {
  db.prepare(`DELETE FROM character_card_imports WHERE id = ?`).run(id);
}
