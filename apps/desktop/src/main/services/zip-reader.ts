// =============================================================================
// 极简 ZIP 读取器（与 zip-writer.ts 配对）
// =============================================================================
// 设计目标：
//   - 只解我们自己需要的 ZIP（.inkcard / .epub 内嵌 ccv3 等）：单磁盘、无密码、
//     STORED(0) + DEFLATE(8) 两种压缩方法、UTF-8 文件名。
//   - 不引第三方依赖（依赖 node:zlib），保持打包体积。
//
// 实现要点（按 PKZIP APPNOTE 6.3.x）：
//   1. 从末尾扫 EOCD（"PK\x05\x06"），定位 Central Directory；
//   2. 顺序解 Central Directory entries，拿到每个文件的元信息 + 数据偏移；
//   3. 真正读 entry data 时从 Local File Header（偏移已在 CD 里）跳到数据段，
//      按 method 做 STORED / inflateRaw。
//
// 故意不支持：
//   - ZIP64（>4GB 单文件、>65535 entries）
//   - 加密 / 多磁盘
//   - 文件名编码非 UTF-8（看 flag bit 11，false 时仍用 UTF-8 容忍解析，避免崩）
// =============================================================================

import { inflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

const SIG_LOCAL = 0x04034b50;
const SIG_CD = 0x02014b50;
const SIG_EOCD = 0x06054b50;

export interface ZipReadEntry {
  filename: string;
  method: number; // 0 = STORED, 8 = DEFLATE
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface ZipReaderLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
}

const DEFAULT_LIMITS: ZipReaderLimits = {
  maxArchiveBytes: 50 * 1024 * 1024,
  maxEntries: 1000,
  maxEntryBytes: 20 * 1024 * 1024,
  maxTotalUncompressedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 200,
};

// 读取整个 ZIP，返回 entries map（按 filename）。data 字段是惰性的 — 调用 read() 才解压。
export class ZipReader {
  private entries = new Map<string, ZipReadEntry>();
  private readonly limits: ZipReaderLimits;

  constructor(private readonly buf: Buffer, limits?: Partial<ZipReaderLimits>) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    if (buf.length > this.limits.maxArchiveBytes) {
      throw new Error("zip: archive is too large");
    }
    this.parseCentralDirectory();
  }

  // 列出所有文件路径
  list(): string[] {
    return Array.from(this.entries.keys());
  }

  has(filename: string): boolean {
    return this.entries.has(filename);
  }

  // 读取并解压指定 entry 的内容。返回 Buffer。
  // 不存在 → 抛异常；调用方应先用 has() 判定。
  read(filename: string): Buffer {
    const entry = this.entries.get(filename);
    if (!entry) throw new Error(`zip entry not found: ${filename}`);
    return this.readEntry(entry);
  }

  // 便捷：以 UTF-8 文本读
  readText(filename: string): string {
    return this.read(filename).toString("utf-8");
  }

  // -----------------------------
  // 内部
  // -----------------------------

  private parseCentralDirectory(): void {
    const buf = this.buf;
    // EOCD 固定 22 字节 + 最多 0xffff 注释；从末尾向前扫描
    const minOffset = Math.max(0, buf.length - 22 - 0xffff);
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= minOffset; i -= 1) {
      if (buf.readUInt32LE(i) === SIG_EOCD) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) {
      throw new Error("zip: EOCD not found (not a valid zip?)");
    }
    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    if (totalEntries > this.limits.maxEntries) throw new Error("zip: too many entries");
    if (cdOffset + cdSize > buf.length) throw new Error("zip: invalid central directory bounds");

    let cursor = cdOffset;
    const cdEnd = cdOffset + cdSize;
    let parsed = 0;
    let totalUncompressed = 0;
    while (cursor < cdEnd && parsed < totalEntries) {
      if (cursor + 46 > cdEnd || cursor + 46 > buf.length) {
        throw new Error("zip: truncated central directory entry");
      }
      const sig = buf.readUInt32LE(cursor);
      if (sig !== SIG_CD) {
        throw new Error(
          `zip: bad central directory signature at offset ${cursor} (got 0x${sig.toString(16)})`,
        );
      }
      const method = buf.readUInt16LE(cursor + 10);
      const crc32 = buf.readUInt32LE(cursor + 16);
      const compressedSize = buf.readUInt32LE(cursor + 20);
      const uncompressedSize = buf.readUInt32LE(cursor + 24);
      const nameLen = buf.readUInt16LE(cursor + 28);
      const extraLen = buf.readUInt16LE(cursor + 30);
      const commentLen = buf.readUInt16LE(cursor + 32);
      const localHeaderOffset = buf.readUInt32LE(cursor + 42);
      if (cursor + 46 + nameLen + extraLen + commentLen > cdEnd) {
        throw new Error("zip: invalid central directory entry bounds");
      }
      const filename = buf
        .subarray(cursor + 46, cursor + 46 + nameLen)
        .toString("utf-8");
      if (uncompressedSize > this.limits.maxEntryBytes) {
        throw new Error(`zip: entry is too large: ${filename}`);
      }
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > this.limits.maxTotalUncompressedBytes) {
        throw new Error("zip: total uncompressed size is too large");
      }
      if (
        compressedSize > 0 &&
        uncompressedSize / compressedSize > this.limits.maxCompressionRatio
      ) {
        throw new Error(`zip: suspicious compression ratio: ${filename}`);
      }
      if (this.entries.has(filename)) throw new Error(`zip: duplicate entry: ${filename}`);
      this.entries.set(filename, {
        filename,
        method,
        crc32,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
      cursor += 46 + nameLen + extraLen + commentLen;
      parsed += 1;
    }
    if (parsed !== totalEntries || cursor !== cdEnd) {
      throw new Error("zip: central directory entry count mismatch");
    }
  }

  private readEntry(entry: ZipReadEntry): Buffer {
    const buf = this.buf;
    const off = entry.localHeaderOffset;
    if (off + 30 > buf.length) throw new Error(`zip: invalid local header: ${entry.filename}`);
    if (buf.readUInt32LE(off) !== SIG_LOCAL) {
      throw new Error(`zip: bad local file header for ${entry.filename}`);
    }
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const dataStart = off + 30 + nameLen + extraLen;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataStart < 0 || dataEnd > buf.length) {
      throw new Error(`zip: invalid entry data bounds: ${entry.filename}`);
    }
    const slice = buf.subarray(dataStart, dataEnd);
    if (entry.method === 0) {
      // STORED：直接返回拷贝（subarray 与父 buf 共享内存，拷贝避免被外部改）
      if (slice.length !== entry.uncompressedSize) {
        throw new Error(`zip: uncompressed size mismatch: ${entry.filename}`);
      }
      return Buffer.from(slice);
    }
    if (entry.method === 8) {
      // DEFLATE：raw deflate（无 zlib 头）
      const output = inflateRawSync(slice, { maxOutputLength: this.limits.maxEntryBytes });
      if (output.length !== entry.uncompressedSize) {
        throw new Error(`zip: uncompressed size mismatch: ${entry.filename}`);
      }
      return output;
    }
    throw new Error(
      `zip: unsupported compression method ${entry.method} for ${entry.filename}`,
    );
  }
}

// 便捷判别：bytes 是否为 ZIP（"PK\x03\x04" 或 "PK\x05\x06" 空 zip）
export function looksLikeZip(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}
