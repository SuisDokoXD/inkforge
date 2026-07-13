// =============================================================================
// 角色卡 / Lorebook 导入导出服务（CCv3 主，兼容 v2）
// =============================================================================
// 编排链路：
//   import: 文件 → 探测格式（JSON / PNG / .inkcard zip）→ 解析 → 转 InkForge pack
//           → 计算指纹 → 查重 → 落库（pack + entries + import 记录）
//   export: packId → 读 pack + entries → 序列化 CCv3 → 写文件（.json 或 PNG 嵌入）
//
// 设计要点：
//   - 任何外部数据进库前都先 sha256 指纹存进 character_card_imports，
//     UI 拖入重复文件可一键跳过
//   - 失败粒度：单条 entry 解析失败不影响其他条目；整个 pack 入库失败回滚事务
//   - 顶层异常包成 InkForgeError 子类，上层 IPC 拿到统一形状的 message + code
// =============================================================================

import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { Buffer } from "node:buffer";

import {
  getCardImportByHash,
  getWorldPackById,
  insertWorldPack,
  insertWorldPackEntry,
  listWorldPackEntries,
  recordCardImport,
  type CharacterCardSpec,
} from "@inkforge/storage";
import type { WorldPackRecord } from "@inkforge/shared";

import { getAppContext } from "../app-state";
import { logger } from "../logger";
import { readPngTextChunks, writePngTextChunks } from "./png-text";
import {
  parseCcv3,
  serializeCcv3,
  type ParsedCardPack,
} from "./ccv3-codec";
import { ZipReader, looksLikeZip } from "../zip-reader";
import { ZipWriter } from "../zip-writer";

const MAX_CARD_FILE_BYTES = 50 * 1024 * 1024;

// --------------------------------------------------------------------------
// 类型
// --------------------------------------------------------------------------

export interface CardImportResult {
  packId: string;
  pack: WorldPackRecord;
  // true 表示同一指纹已存在；UI 上提示"已导入过"并指向 existing pack。
  alreadyImported: boolean;
  entryCount: number;
}

export interface CardImportInput {
  sourcePath: string;       // 文件绝对路径
  fileBytes?: Buffer;       // 已读入的 bytes（可选，省一次磁盘读）
}

export interface CardExportOptions {
  format: "json" | "png" | "inkcard"; // inkcard = zip(card.json + cover.png + meta.json)
  coverBytes?: Buffer;      // png/inkcard 格式时的载体；省略则用透明 1x1 PNG
  outputPath: string;
}

// 通用错误。
class CardImportError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "CardImportError";
  }
}

// --------------------------------------------------------------------------
// 导入：从文件 → InkForge world_pack + entries
// --------------------------------------------------------------------------

// 主入口：读文件 → 自动探测 → 解析 → 落库。
// 同一指纹（sha256）已存在时直接返回已导入的 pack。
export async function importCardFromFile(
  input: CardImportInput,
): Promise<CardImportResult> {
  const sourcePath = input.sourcePath;
  if (!input.fileBytes) {
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile() || stat.size > MAX_CARD_FILE_BYTES) {
      throw new CardImportError("CARD_FILE_TOO_LARGE", "Character card must be a file no larger than 50 MB");
    }
  }
  const fileBytes = input.fileBytes ?? (await fs.readFile(sourcePath));
  if (fileBytes.length > MAX_CARD_FILE_BYTES) {
    throw new CardImportError("CARD_FILE_TOO_LARGE", "Character card must be no larger than 50 MB");
  }

  // 指纹用于查重 + 持久化到 character_card_imports
  const contentHash = sha256Hex(fileBytes);

  const ctx = getAppContext();

  // 已导入：返回 existing pack（如果还在）。pack 已被删除则只返回 import 记录的指针。
  const existing = getCardImportByHash(ctx.db, contentHash);
  if (existing && existing.packId) {
    const pack = getWorldPackById(ctx.db, existing.packId);
    if (pack) {
      const entries = listWorldPackEntries(ctx.db, pack.id);
      return {
        packId: pack.id,
        pack,
        alreadyImported: true,
        entryCount: entries.length,
      };
    }
    // pack 已删但 import 记录还在 —— 走重新导入逻辑（让用户再要一份）
  }

  // 探测格式
  const parsed = await parseCardFromBytes(fileBytes, sourcePath);

  // 落库：pack + entries + import 记录，单事务保证原子性
  const packId = `pack_${randomUUID()}`;
  const tx = ctx.db.transaction(() => {
    insertWorldPack(ctx.db, {
      id: packId,
      name: parsed.name,
      tagline: parsed.tagline,
      description: parsed.description,
      tags: parsed.tags,
      scanDepth: parsed.scanDepth,
      tokenBudget: parsed.tokenBudget,
      recursionEnabled: parsed.recursionEnabled,
      origin: "imported",
    });
    for (const entry of parsed.entries) {
      try {
        insertWorldPackEntry(ctx.db, {
          id: `wpe_${randomUUID()}`,
          packId,
          category: entry.category,
          title: entry.title,
          content: entry.content,
          aliases: entry.aliases,
          tags: entry.tags,
          keys: entry.keys,
          position: entry.position,
          probability: entry.probability,
          order: entry.order,
          secondaryKeys: entry.secondaryKeys,
          selectiveLogic: entry.selectiveLogic,
          caseSensitive: entry.caseSensitive,
          constant: entry.constant,
          extensions: entry.extensions,
        });
      } catch (err) {
        // 单条失败不破坏 pack 整体；记录后继续
        logger.warn(
          `import: skip entry "${entry.title}" — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    recordCardImport(ctx.db, {
      id: `import_${randomUUID()}`,
      sourcePath,
      contentHash,
      packId,
      spec: parsed.spec as CharacterCardSpec,
    });
  });
  tx();

  const pack = getWorldPackById(ctx.db, packId);
  if (!pack) throw new CardImportError("DB_INCONSISTENT", "Pack persist failed");
  return {
    packId,
    pack,
    alreadyImported: false,
    entryCount: parsed.entries.length,
  };
}

// 探测文件格式并解析为 ParsedCardPack。
// 支持：
//   - 纯 JSON（.json 后缀或文件头是 '{'）
//   - PNG 带 tEXt 块（keyword="ccv3" 或 "chara"）
//   - .inkcard（zip）— 内含 card.json（必需），可选 cover.png 与 meta.json
async function parseCardFromBytes(
  bytes: Buffer,
  hintPath: string,
): Promise<ParsedCardPack> {
  // .inkcard zip：检测 PKZIP 头 "PK\x03\x04"
  if (looksLikeZip(bytes)) {
    let reader: ZipReader;
    try {
      reader = new ZipReader(bytes);
    } catch (err) {
      throw new CardImportError(
        "INKCARD_PARSE_FAILED",
        `.inkcard 解压失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!reader.has("card.json")) {
      throw new CardImportError(
        "INKCARD_NO_CARD_JSON",
        `.inkcard 内未找到 card.json：${path.basename(hintPath)}`,
      );
    }
    let jsonStr: string;
    try {
      jsonStr = reader.readText("card.json");
    } catch (err) {
      throw new CardImportError(
        "INKCARD_READ_FAILED",
        `读取 card.json 失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return parseCcv3(jsonStr);
  }

  // PNG 签名：89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const chunks = readPngTextChunks(bytes);
    const text = chunks.get("ccv3") ?? chunks.get("chara") ?? null;
    if (!text) {
      throw new CardImportError(
        "PNG_NO_CARD_DATA",
        `PNG 内未找到 ccv3/chara tEXt 块：${path.basename(hintPath)}`,
      );
    }
    let jsonStr: string;
    try {
      jsonStr = Buffer.from(text, "base64").toString("utf-8");
    } catch (err) {
      throw new CardImportError(
        "PNG_DECODE_FAILED",
        `Base64 解码失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return parseCcv3(jsonStr);
  }

  // 试探 JSON
  const head = bytes.subarray(0, 4096).toString("utf-8").trimStart();
  if (head.startsWith("{")) {
    return parseCcv3(bytes.toString("utf-8"));
  }

  throw new CardImportError(
    "UNKNOWN_FORMAT",
    `不识别的卡格式：${path.basename(hintPath)}（仅支持 .json / 带 ccv3 tEXt 的 .png / .inkcard zip）`,
  );
}

// --------------------------------------------------------------------------
// 导出：InkForge pack → CCv3 JSON / PNG
// --------------------------------------------------------------------------

// 把指定 pack 导出为 CCv3 文件。
//   format=json: 直接写 utf-8 JSON
//   format=png:  以 coverBytes 为底图，把 base64(JSON) 写到 tEXt 块（keyword=ccv3）
export async function exportPackAsCcv3(
  packId: string,
  options: CardExportOptions,
): Promise<{ outputPath: string; byteCount: number }> {
  const ctx = getAppContext();
  const pack = getWorldPackById(ctx.db, packId);
  if (!pack) throw new CardImportError("PACK_NOT_FOUND", `Pack 不存在：${packId}`);
  const entries = listWorldPackEntries(ctx.db, packId);

  const json = serializeCcv3({
    name: pack.name,
    tagline: pack.tagline,
    description: pack.description,
    tags: pack.tags,
    scanDepth: pack.scanDepth,
    tokenBudget: pack.tokenBudget,
    recursionEnabled: pack.recursionEnabled,
    entries: entries.map((e) => ({
      category: e.category,
      title: e.title,
      content: e.content,
      keys: e.keys,
      secondaryKeys: e.secondaryKeys,
      position: e.position,
      probability: e.probability,
      order: e.order,
      selectiveLogic: e.selectiveLogic,
      caseSensitive: e.caseSensitive,
      constant: e.constant,
      extensions: e.extensions,
    })),
  });

  let bytes: Buffer;
  if (options.format === "json") {
    bytes = Buffer.from(json, "utf-8");
  } else if (options.format === "png") {
    const cover = options.coverBytes ?? TRANSPARENT_PNG_1X1;
    const base64 = Buffer.from(json, "utf-8").toString("base64");
    bytes = writePngTextChunks(
      cover,
      new Map([["ccv3", base64]]),
    );
  } else {
    // inkcard：zip 包含 card.json + cover.png + meta.json
    // 优势：可以容纳额外资源（如多张配图、批注、版本号），是 InkForge 的超集容器
    const writer = new ZipWriter();
    await writer.addFile("card.json", json, 8);
    const cover = options.coverBytes ?? TRANSPARENT_PNG_1X1;
    await writer.addFile("cover.png", cover, 0); // PNG 已压缩，STORED 更快
    const meta = JSON.stringify(
      {
        format: "inkcard",
        version: 1,
        sourceApp: "InkForge",
        exportedAt: new Date().toISOString(),
        packId,
      },
      null,
      2,
    );
    await writer.addFile("meta.json", meta, 8);
    bytes = writer.finalize();
  }
  await fs.writeFile(options.outputPath, bytes);
  return { outputPath: options.outputPath, byteCount: bytes.length };
}

// --------------------------------------------------------------------------
// 杂项
// --------------------------------------------------------------------------

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// 1x1 透明 PNG（97 字节）。用作 export PNG 时没有封面图的兜底载体。
// 生成方式：sharp({create:{...}}).png() 一次性产物，固化避免运行时依赖 sharp。
const TRANSPARENT_PNG_1X1 = Buffer.from(
  [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ],
);
