import { promises as fs } from "node:fs";
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";
import { createSampleLib } from "@inkforge/storage";
import type { SampleLibRecord } from "@inkforge/shared";
import { getAppContext } from "./app-state";

const inflateAsync = promisify(inflateRaw);

export interface ParsedChapter {
  ordinal: number;
  chapterTitle: string | null;
  text: string;
}

// ---------------------------------------------------------------------------
// TXT 拆章
// ---------------------------------------------------------------------------

/**
 * Split plain-text novel into chapters by `第 X 章` pattern.
 * Supports CJK numerals and Arabic digits; loose whitespace.
 * Falls back to a single chapter if no marker found.
 */
export function splitTextIntoChapters(raw: string): ParsedChapter[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const headerRe =
    /^[ \t]*第[0-9一二三四五六七八九十百千万零〇两\s]+[章回卷篇节][^\n]{0,40}$/gm;
  const headers: { idx: number; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    headers.push({ idx: m.index, title: m[0].trim() });
  }
  if (headers.length === 0) {
    const trimmed = text.trim();
    return trimmed
      ? [{ ordinal: 1, chapterTitle: null, text: trimmed }]
      : [];
  }
  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const start = headers[i].idx;
    const end = i + 1 < headers.length ? headers[i + 1].idx : text.length;
    const body = text.slice(start, end).trim();
    if (!body) continue;
    chapters.push({
      ordinal: i + 1,
      chapterTitle: headers[i].title,
      text: body,
    });
  }
  return chapters;
}

/**
 * Decode buffer with UTF-8 first, fall back to common CN encodings.
 * Detect via BOM and Mojibake heuristic.
 */
export function decodeTextBuffer(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString("utf8", 3);
  }
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le", 2);
  }
  const utf8 = buf.toString("utf8");
  const replacementCount = (utf8.match(/\ufffd/g) ?? []).length;
  if (replacementCount > 4 || replacementCount > utf8.length / 200) {
    // Try GBK via TextDecoder if available (Node 18+ supports gb18030).
    try {
      const dec = new TextDecoder("gbk");
      return dec.decode(buf);
    } catch {
      try {
        const dec = new TextDecoder("gb18030");
        return dec.decode(buf);
      } catch {
        return utf8;
      }
    }
  }
  return utf8;
}

// ---------------------------------------------------------------------------
// 最小 ZIP reader (DEFLATE / STORED 即可，符合 EPUB 规范)
// ---------------------------------------------------------------------------

interface ZipEntry {
  filename: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  offsetLocalHeader: number;
}

function readUInt32LE(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}
function readUInt16LE(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off);
}

function findEOCD(buf: Buffer): number {
  // EOCD signature 0x06054b50, search backwards from end (max 64KB comment).
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      return i;
    }
  }
  return -1;
}

function parseCentralDir(buf: Buffer): ZipEntry[] {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error("EPUB: EOCD not found");
  const entryCount = readUInt16LE(buf, eocd + 10);
  const cdSize = readUInt32LE(buf, eocd + 12);
  const cdOffset = readUInt32LE(buf, eocd + 16);
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    const sig = readUInt32LE(buf, p);
    if (sig !== 0x02014b50) throw new Error(`EPUB: bad central header at ${p}`);
    const method = readUInt16LE(buf, p + 10);
    const compressedSize = readUInt32LE(buf, p + 20);
    const uncompressedSize = readUInt32LE(buf, p + 24);
    const nameLen = readUInt16LE(buf, p + 28);
    const extraLen = readUInt16LE(buf, p + 30);
    const commentLen = readUInt16LE(buf, p + 32);
    const localOff = readUInt32LE(buf, p + 42);
    const filename = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({
      filename,
      method,
      compressedSize,
      uncompressedSize,
      offsetLocalHeader: localOff,
    });
    p += 46 + nameLen + extraLen + commentLen;
    if (cdSize && p > cdOffset + cdSize) break;
  }
  return entries;
}

async function readEntry(buf: Buffer, entry: ZipEntry): Promise<Buffer> {
  const localSig = readUInt32LE(buf, entry.offsetLocalHeader);
  if (localSig !== 0x04034b50) {
    throw new Error(`EPUB: bad local header at ${entry.offsetLocalHeader}`);
  }
  const nameLen = readUInt16LE(buf, entry.offsetLocalHeader + 26);
  const extraLen = readUInt16LE(buf, entry.offsetLocalHeader + 28);
  const dataOff = entry.offsetLocalHeader + 30 + nameLen + extraLen;
  const compressed = buf.slice(dataOff, dataOff + entry.compressedSize);
  if (entry.method === 0) return compressed; // STORED
  if (entry.method === 8) return await inflateAsync(compressed); // DEFLATE
  throw new Error(`EPUB: unsupported compression method ${entry.method}`);
}

async function readZipMap(filePath: string): Promise<{ buf: Buffer; entries: Map<string, ZipEntry> }> {
  const buf = await fs.readFile(filePath);
  const list = parseCentralDir(buf);
  const map = new Map<string, ZipEntry>();
  for (const e of list) map.set(e.filename, e);
  return { buf, entries: map };
}

// ---------------------------------------------------------------------------
// EPUB 解析（spine 顺序）
// ---------------------------------------------------------------------------

interface EpubMeta {
  title?: string;
  author?: string;
}

function stripHtml(html: string): string {
  // Remove script/style blocks first
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  // Block tags become newlines
  const withBreaks = cleaned
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  // Decode common entities
  return withBreaks
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(Number.parseInt(n, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractAttr(xml: string, attr: string): string | undefined {
  const m = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`).exec(xml) ?? new RegExp(`${attr}\\s*=\\s*'([^']*)'`).exec(xml);
  return m?.[1];
}

function joinPath(base: string, rel: string): string {
  const cleanRel = rel.split("#", 1)[0].split("?", 1)[0];
  if (!cleanRel) return base;
  const baseDir = base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "";
  const parts = (baseDir + cleanRel).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(safeDecodeURIComponent(p));
  }
  return out.join("/");
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function getEntry(entries: Map<string, ZipEntry>, filePath: string): ZipEntry | undefined {
  const normalized = normalizeZipPath(filePath);
  return entries.get(normalized) ?? entries.get(safeDecodeURIComponent(normalized));
}

function decodeXmlText(text: string | undefined): string | undefined {
  return text
    ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(Number.parseInt(n, 16)))
    .trim();
}

function extractElementText(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, "i").exec(xml);
  return decodeXmlText(m?.[1]?.replace(/<[^>]+>/g, ""));
}

function extractHtmlTitle(html: string): string | null {
  const h = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return decodeXmlText((h?.[1] ?? t?.[1])?.replace(/<[^>]+>/g, "")) || null;
}

export async function parseEpubChapters(
  filePath: string,
): Promise<{ meta: EpubMeta; chapters: ParsedChapter[] }> {
  const { buf, entries } = await readZipMap(filePath);

  // 1. Read META-INF/container.xml -> rootfile path
  const containerEntry = entries.get("META-INF/container.xml");
  if (!containerEntry) throw new Error("EPUB: container.xml missing");
  const containerXml = (await readEntry(buf, containerEntry)).toString("utf8");
  const opfPath = extractAttr(containerXml, "full-path");
  if (!opfPath) throw new Error("EPUB: rootfile path not found");
  const opfEntry = getEntry(entries, opfPath);
  if (!opfEntry) throw new Error(`EPUB: ${opfPath} missing`);
  const opfXml = (await readEntry(buf, opfEntry)).toString("utf8");

  // 2. metadata
  const meta: EpubMeta = {
    title: extractElementText(opfXml, "title"),
    author: extractElementText(opfXml, "creator"),
  };

  // 3. manifest: id -> href
  const manifest = new Map<string, string>();
  const manifestRe = /<item\b([^>]*)\/?>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = manifestRe.exec(opfXml)) !== null) {
    const attrs = mm[1];
    const id = extractAttr(attrs, "id");
    const href = extractAttr(attrs, "href");
    if (id && href) manifest.set(id, href);
  }

  // 4. spine: ordered list of idref
  const spineIds: string[] = [];
  const spineRe = /<itemref\b([^>]*)\/?>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = spineRe.exec(opfXml)) !== null) {
    const idref = extractAttr(sm[1], "idref");
    if (idref) spineIds.push(idref);
  }

  // 5. read each chapter
  const chapters: ParsedChapter[] = [];
  let ord = 1;
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;
    const fullPath = joinPath(opfPath, href);
    const entry = getEntry(entries, fullPath);
    if (!entry) continue;
    const html = (await readEntry(buf, entry)).toString("utf8");
    const text = stripHtml(html);
    if (!text || text.length < 50) continue; // skip cover/empty
    const chapterTitle = extractHtmlTitle(html);
    chapters.push({ ordinal: ord, chapterTitle, text });
    ord += 1;
  }

  return { meta, chapters };
}

// ---------------------------------------------------------------------------
// Service exports
// ---------------------------------------------------------------------------

export async function importTextAsLib(input: {
  projectId: string;
  title: string;
  author?: string;
  notes?: string;
  text: string;
}): Promise<{ lib: SampleLibRecord; chunkCount: number }> {
  const decoded = input.text.includes("\r") ? input.text.replace(/\r\n/g, "\n") : input.text;
  const chapters = splitTextIntoChapters(decoded);
  const ctx = getAppContext();
  const lib = createSampleLib(ctx.db, {
    projectId: input.projectId,
    title: input.title,
    author: input.author ?? null,
    notes: input.notes ?? null,
    chunks: chapters,
  });
  return { lib, chunkCount: chapters.length };
}

export async function importEpubAsLib(input: {
  projectId: string;
  filePath: string;
  title?: string;
  author?: string;
  notes?: string;
}): Promise<{ lib: SampleLibRecord; chunkCount: number }> {
  const { meta, chapters } = await parseEpubChapters(input.filePath);
  if (chapters.length === 0) {
    throw new Error("EPUB 未解析出正文章节：请确认文件包含有效目录/spine，或先转为 TXT 后导入");
  }
  const ctx = getAppContext();
  const lib = createSampleLib(ctx.db, {
    projectId: input.projectId,
    title: input.title || meta.title || "(无标题)",
    author: input.author ?? meta.author ?? null,
    notes: input.notes ?? null,
    chunks: chapters,
  });
  return { lib, chunkCount: chapters.length };
}
