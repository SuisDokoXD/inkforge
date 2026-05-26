// =============================================================================
// PNG tEXt chunk 读写（最小实现）
// =============================================================================
// CCv3 角色卡的标准分发格式之一是 PNG 文件，元数据藏在 tEXt 块里：
//   - keyword="ccv3"（v3 规范）或 "chara"（v2 兼容）
//   - 数据是 base64 编码的 JSON 字符串
//
// PNG 文件结构（参见 https://www.w3.org/TR/PNG/）：
//   8 字节签名 + 多个 chunk
//   每个 chunk = 4 字节长度（BE）+ 4 字节类型 + N 字节数据 + 4 字节 CRC32
//
// 本模块只读写 tEXt 块（关键词 + null 分隔 + Latin-1 文本），不动其他块。
// =============================================================================

import { Buffer } from "node:buffer";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// CRC32（PNG 用的标准 CRC32 多项式 0xedb88320）。复用与 ZipWriter 同款表算法。
const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// 解析 PNG 字节，返回 tEXt 块的 keyword → text map。
// 非 PNG / 损坏 PNG 返回空 map（不抛），让上层走"未识别"分支。
export function readPngTextChunks(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return out;
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString("ascii");
    const dataStart = p + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) break; // 损坏，提前停
    if (type === "tEXt") {
      const data = buf.subarray(dataStart, dataEnd);
      const nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        // PNG tEXt 用 Latin-1，但 keyword 部分通常是 ASCII。
        const keyword = data.subarray(0, nullIdx).toString("latin1");
        const text = data.subarray(nullIdx + 1).toString("latin1");
        out.set(keyword, text);
      }
    }
    if (type === "IEND") break;
    p = dataEnd + 4; // 4 字节 CRC
  }
  return out;
}

// 在 PNG buffer 里写/覆盖一组 tEXt 块。
// 实现策略：剥出原 PNG 的非 tEXt 块，先写完原有内容，
// 再在 IEND 前补入新 tEXt 块，最后写 IEND。保留 IHDR / IDAT 等关键块原顺序。
export function writePngTextChunks(
  pngBuf: Buffer,
  kv: Map<string, string>,
): Buffer {
  if (pngBuf.length < 8 || !pngBuf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG buffer");
  }
  const chunks: Buffer[] = [PNG_SIGNATURE];
  let p = 8;
  let iendChunk: Buffer | null = null;

  while (p + 8 <= pngBuf.length) {
    const len = pngBuf.readUInt32BE(p);
    const type = pngBuf.subarray(p + 4, p + 8).toString("ascii");
    const totalLen = 12 + len; // 4 长度 + 4 类型 + N 数据 + 4 CRC
    if (p + totalLen > pngBuf.length) break;
    const chunk = pngBuf.subarray(p, p + totalLen);
    if (type === "IEND") {
      iendChunk = chunk;
    } else if (type === "tEXt") {
      // 丢弃旧 tEXt（让传入的 kv 覆盖）
    } else {
      chunks.push(chunk);
    }
    p += totalLen;
    if (type === "IEND") break;
  }

  // 写新 tEXt 块
  for (const [keyword, text] of kv.entries()) {
    chunks.push(buildTextChunk(keyword, text));
  }
  if (iendChunk) chunks.push(iendChunk);
  else chunks.push(buildIendChunk()); // 极端情况：原 PNG 没 IEND，补一个

  return Buffer.concat(chunks);
}

// 单个 tEXt chunk = [4 长度][4 类型 "tEXt"][数据 keyword\0text][4 CRC]
function buildTextChunk(keyword: string, text: string): Buffer {
  const keywordBuf = Buffer.from(keyword, "latin1");
  const textBuf = Buffer.from(text, "latin1");
  const data = Buffer.concat([keywordBuf, Buffer.from([0]), textBuf]);
  return packChunk("tEXt", data);
}

function buildIendChunk(): Buffer {
  return packChunk("IEND", Buffer.alloc(0));
}

function packChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
