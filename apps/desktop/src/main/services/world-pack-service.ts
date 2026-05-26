// =============================================================================
// Worldview Cards 服务层
// =============================================================================
// 在 storage 层 CRUD 之上加业务校验 + 文件 IO（封面图）+ 输入归一化。
// 给 IPC handler 调，handler 只做 ipcMain.handle 注册，不放业务逻辑。
//
// 封面图：每张卡一份文件 <workspace>/.world-packs/<packId>.<ext>，
// 覆盖写时清掉同 packId 其他扩展名旧文件，避免遗留。
// =============================================================================

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  addProjectPackSlot,
  deleteWorldPack,
  deleteWorldPackEntry,
  getWorldPackById,
  getWorldPackEntryById,
  insertWorldPack,
  insertWorldPackEntry,
  listProjectPackSlots,
  listWorldPackEntries,
  listWorldPacks,
  removeProjectPackSlot,
  reorderProjectPackSlots,
  toggleProjectPackSlot,
  updateWorldPack,
  updateWorldPackEntry,
} from "@inkforge/storage";
import type {
  ProjectWorldPackSlotRecord,
  WorldPackCoverReadInput,
  WorldPackCoverReadResponse,
  WorldPackCoverWriteInput,
  WorldPackCoverWriteResponse,
  WorldPackCreateInput,
  WorldPackDeleteInput,
  WorldPackEntryCreateInput,
  WorldPackEntryDeleteInput,
  WorldPackEntryListInput,
  WorldPackEntryRecord,
  WorldPackEntryUpdateInput,
  WorldPackGetInput,
  WorldPackListInput,
  WorldPackRecord,
  WorldPackSlotAddInput,
  WorldPackSlotListInput,
  WorldPackSlotRemoveInput,
  WorldPackSlotReorderInput,
  WorldPackSlotToggleInput,
  WorldPackUpdateInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

// 工作区下的卡牌资产目录（封面图）
const PACK_ASSET_DIR = ".world-packs";

const ALLOWED_COVER_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2MB

function packAssetDirAbs(): string {
  const ctx = getAppContext();
  const dir = path.join(ctx.workspaceDir, PACK_ASSET_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 把渲染端传来的 ArrayBuffer / Uint8Array 统一成 Buffer
function toBuffer(bytes: ArrayBuffer | Uint8Array): Buffer {
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  return Buffer.from(new Uint8Array(bytes as ArrayBuffer));
}

// ---------- Pack ----------

export function listWorldPackRecords(
  input: WorldPackListInput,
): WorldPackRecord[] {
  const ctx = getAppContext();
  return listWorldPacks(ctx.db, {
    search: input.search,
    origin: input.origin,
    limit: input.limit,
  });
}

export function getWorldPackRecord(
  input: WorldPackGetInput,
): WorldPackRecord | null {
  const ctx = getAppContext();
  return getWorldPackById(ctx.db, input.id);
}

export function createWorldPack(input: WorldPackCreateInput): WorldPackRecord {
  const ctx = getAppContext();
  if (!input.name?.trim()) throw new Error("world pack name required");
  return insertWorldPack(ctx.db, {
    id: randomUUID(),
    name: input.name.trim(),
    tagline: input.tagline ?? "",
    description: input.description ?? "",
    tags: input.tags ?? [],
    scanDepth: input.scanDepth,
    tokenBudget: input.tokenBudget,
    recursionEnabled: input.recursionEnabled,
    origin: "user",
  });
}

export function updateWorldPackRecord(
  input: WorldPackUpdateInput,
): WorldPackRecord {
  const ctx = getAppContext();
  return updateWorldPack(ctx.db, input);
}

export function deleteWorldPackRecord(
  input: WorldPackDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  // 先删磁盘封面（DB 级联会清掉 entries + slots）
  try {
    const dir = packAssetDirAbs();
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(`${input.id}.`)) {
        fs.rmSync(path.join(dir, f), { force: true });
      }
    }
  } catch {
    /* ignore cover cleanup failures */
  }
  deleteWorldPack(ctx.db, input.id);
  return { id: input.id };
}

// ---------- Pack entries ----------

export function listWorldPackEntryRecords(
  input: WorldPackEntryListInput,
): WorldPackEntryRecord[] {
  const ctx = getAppContext();
  return listWorldPackEntries(ctx.db, input.packId);
}

export function createWorldPackEntry(
  input: WorldPackEntryCreateInput,
): WorldPackEntryRecord {
  const ctx = getAppContext();
  if (!input.title?.trim()) throw new Error("entry title required");
  if (!input.category?.trim()) throw new Error("entry category required");
  return insertWorldPackEntry(ctx.db, {
    id: randomUUID(),
    packId: input.packId,
    category: input.category.trim(),
    title: input.title.trim(),
    content: input.content ?? "",
    aliases: input.aliases ?? [],
    tags: input.tags ?? [],
    keys: input.keys ?? [],
    position: input.position,
    probability: input.probability,
    order: input.order,
    // v25 CCv3 兼容字段透传
    secondaryKeys: input.secondaryKeys,
    selectiveLogic: input.selectiveLogic,
    caseSensitive: input.caseSensitive,
    constant: input.constant,
    extensions: input.extensions,
  });
}

export function updateWorldPackEntryRecord(
  input: WorldPackEntryUpdateInput,
): WorldPackEntryRecord {
  const ctx = getAppContext();
  return updateWorldPackEntry(ctx.db, input);
}

export function deleteWorldPackEntryRecord(
  input: WorldPackEntryDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  const existing = getWorldPackEntryById(ctx.db, input.id);
  if (existing) deleteWorldPackEntry(ctx.db, input.id);
  return { id: input.id };
}

// ---------- Slots ----------

export function listProjectPackSlotRecords(
  input: WorldPackSlotListInput,
): ProjectWorldPackSlotRecord[] {
  const ctx = getAppContext();
  return listProjectPackSlots(ctx.db, input.projectId);
}

export function addProjectPackSlotRecord(
  input: WorldPackSlotAddInput,
): ProjectWorldPackSlotRecord {
  const ctx = getAppContext();
  return addProjectPackSlot(ctx.db, input);
}

export function removeProjectPackSlotRecord(
  input: WorldPackSlotRemoveInput,
): { projectId: string; packId: string } {
  const ctx = getAppContext();
  removeProjectPackSlot(ctx.db, input.projectId, input.packId);
  return { projectId: input.projectId, packId: input.packId };
}

export function toggleProjectPackSlotRecord(
  input: WorldPackSlotToggleInput,
): ProjectWorldPackSlotRecord | null {
  const ctx = getAppContext();
  return toggleProjectPackSlot(
    ctx.db,
    input.projectId,
    input.packId,
    input.enabled,
  );
}

export function reorderProjectPackSlotRecords(
  input: WorldPackSlotReorderInput,
): { ok: true } {
  const ctx = getAppContext();
  reorderProjectPackSlots(ctx.db, input.projectId, input.orderedPackIds);
  return { ok: true };
}

// ---------- Covers ----------

// 写入卡牌封面。
// 校验：扩展名白名单 + 2MB 大小上限；同 packId 旧文件全清。
// 写完后同步更新 world_packs.cover_path / cover_mime。
export function writeWorldPackCover(
  input: WorldPackCoverWriteInput,
): WorldPackCoverWriteResponse {
  const safeExt = (input.ext ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!ALLOWED_COVER_EXTS.has(safeExt)) {
    throw new Error(`cover extension not allowed: ${input.ext}`);
  }
  const buf = toBuffer(input.bytes);
  if (buf.length === 0) throw new Error("empty cover bytes");
  if (buf.length > MAX_COVER_BYTES) {
    throw new Error(`cover too large: ${buf.length} > ${MAX_COVER_BYTES}`);
  }
  const dir = packAssetDirAbs();
  // 清掉同 packId 旧封面（任意扩展名）
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(`${input.packId}.`)) {
      try {
        fs.rmSync(path.join(dir, f), { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  const rel = path.posix.join(PACK_ASSET_DIR, `${input.packId}.${safeExt}`);
  fs.writeFileSync(path.join(packAssetDirAbs(), `${input.packId}.${safeExt}`), buf);
  // 同步元数据到 DB
  updateWorldPackRecord({
    id: input.packId,
    coverPath: rel,
    coverMime: input.mime,
  });
  return { coverPath: rel, coverMime: input.mime };
}

// 读取封面文件返回 base64 data URL，渲染端直接 <img src={dataUrl} />。
// 文件不存在返回 null 让 UI 优雅降级显示默认渐变。
export function readWorldPackCover(
  input: WorldPackCoverReadInput,
): WorldPackCoverReadResponse {
  const ctx = getAppContext();
  const abs = path.join(ctx.workspaceDir, input.coverPath);
  if (!fs.existsSync(abs)) return { dataUrl: null };
  const buf = fs.readFileSync(abs);
  // mime 推断（优先 DB 字段，失败回退按扩展名）
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime =
    ext === "png" ? "image/png"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : "application/octet-stream";
  return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
}
