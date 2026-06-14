#!/usr/bin/env node
/**
 * Minimal project-package verifier.
 *
 * This is intentionally pure Node so it can run in verify:all without booting
 * Electron or loading native SQLite. End-to-end export/import is covered by
 * Playwright; this script guards the archive structure and path-safety rules.
 */
const zlib = require("node:zlib");

const FORMAT = "inkforge.project-package";
const SCHEMA_VERSION = 1;
const MAX_ZIP_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;

function ok(message) {
  console.log(`\x1b[32m✓ ${message}\x1b[0m`);
}

function fail(message) {
  console.error(`\x1b[31m✗ ${message}\x1b[0m`);
  process.exitCode = 1;
}

function assertSafeZipPath(filename) {
  if (!filename || filename.includes("\0") || filename.includes("\\")) {
    throw new Error(`unsafe path: ${filename}`);
  }
  if (filename.startsWith("/") || /^[A-Za-z]:/.test(filename)) {
    throw new Error(`absolute path: ${filename}`);
  }
  if (filename.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`unsafe segment: ${filename}`);
  }
}

function findEocd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function parseZip(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("EOCD not found");
  const entryCount = buf.readUInt16LE(eocd + 10);
  if (entryCount > MAX_ZIP_ENTRIES) throw new Error("too many entries");
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let p = cdOffset;
  let total = 0;
  const entries = new Map();
  for (let i = 0; i < entryCount; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central header");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offsetLocalHeader = buf.readUInt32LE(p + 42);
    const filename = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    assertSafeZipPath(filename);
    if (method !== 0 && method !== 8) throw new Error(`unsupported method ${method}`);
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error("entry too large");
    total += uncompressedSize;
    if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error("archive too large");
    entries.set(filename, { filename, method, compressedSize, offsetLocalHeader });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, entry) {
  const nameLen = buf.readUInt16LE(entry.offsetLocalHeader + 26);
  const extraLen = buf.readUInt16LE(entry.offsetLocalHeader + 28);
  const dataOff = entry.offsetLocalHeader + 30 + nameLen + extraLen;
  const compressed = buf.subarray(dataOff, dataOff + entry.compressedSize);
  if (entry.method === 0) return compressed;
  return zlib.inflateRawSync(compressed);
}

const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  const local = [];
  const central = [];
  const offsets = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const compressed = file.method === 0 ? data : zlib.deflateRawSync(data);
    offsets.push(offset);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(file.method, 8);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    file._compressedSize = compressed.length;
    file._uncompressedSize = data.length;
    file._crc = crc32(data);
    offset += 30 + name.length + compressed.length;
  }
  let cdSize = 0;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const name = Buffer.from(file.name, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(file.method, 10);
    header.writeUInt32LE(file._crc, 16);
    header.writeUInt32LE(file._compressedSize, 20);
    header.writeUInt32LE(file._uncompressedSize, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offsets[i], 42);
    central.push(header, name);
    cdSize += 46 + name.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, eocd]);
}

function verifyGoodPackage() {
  const manifest = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    sourceProjectId: "source",
    sourceProjectName: "Example",
    chapterCount: 1,
  };
  const data = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sourceProjectId: "source",
    project: { name: "Example" },
    chapters: [{ row: { id: "chapter-1", title: "One" }, contentPath: "chapters/0001-chapter-1.md" }],
    rows: {},
    assets: { bookCover: null, snapshots: [], worldPackCovers: [] },
  };
  const zip = buildZip([
    { name: "manifest.json", data: JSON.stringify(manifest), method: 8 },
    { name: "data/project.json", data: JSON.stringify(data), method: 8 },
    { name: "chapters/0001-chapter-1.md", data: "# One\n", method: 8 },
  ]);
  const entries = parseZip(zip);
  const parsedManifest = JSON.parse(readEntry(zip, entries.get("manifest.json")).toString("utf8"));
  const parsedData = JSON.parse(readEntry(zip, entries.get("data/project.json")).toString("utf8"));
  if (parsedManifest.format !== FORMAT || parsedData.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("manifest/data mismatch");
  }
  ok("project package manifest/data round-trip");
}

function verifyTraversalRejected() {
  const zip = buildZip([{ name: "../escape.txt", data: "bad", method: 8 }]);
  let rejected = false;
  try {
    parseZip(zip);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("path traversal was not rejected");
  ok("path traversal entry rejected");
}

try {
  verifyGoodPackage();
  verifyTraversalRejected();
  if (process.exitCode && process.exitCode !== 0) process.exit(process.exitCode);
  ok("project package verification passed");
} catch (error) {
  fail(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
