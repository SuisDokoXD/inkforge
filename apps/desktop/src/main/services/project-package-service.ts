import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { inflateRawSync } from "zlib";
import {
  ensureProjectLayout,
  getProject,
  insertProject,
  relSnapshotPath,
  sanitizeFileSegment,
  sanitizeProjectName,
  updateProjectMeta,
  writeChapterFile,
  type DB,
} from "@inkforge/storage";
import type {
  ProjectPackageExportResponse,
  ProjectPackageImportResponse,
} from "@inkforge/shared";
import { getAppContext, updateWorkspaceConfig } from "./app-state";
import { ZipWriter } from "./zip-writer";

const FORMAT = "inkforge.project-package";
const SCHEMA_VERSION = 1;
const MAX_ZIP_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const PROJECT_PACKAGE_DATA = "data/project.json";
const MANIFEST = "manifest.json";

type SqlValue = string | number | null;
type RawRow = Record<string, SqlValue>;

interface PackageChapter {
  row: RawRow;
  contentPath: string;
}

interface PackageAsset {
  rowId: string;
  archivePath: string;
  relPath?: string;
  mime?: string | null;
}

interface ProjectPackageData {
  format: typeof FORMAT;
  schemaVersion: number;
  exportedAt: string;
  sourceProjectId: string;
  project: {
    name: string;
    dailyGoal: number;
    synopsis: string;
    genre: string;
    subGenre: string;
    tags: string[];
    masterOutline: string;
    preRefineMasterOutline: string | null;
    globalWorldview: string;
  };
  chapters: PackageChapter[];
  rows: Record<string, RawRow[]>;
  assets: {
    bookCover: PackageAsset | null;
    snapshots: PackageAsset[];
    worldPackCovers: PackageAsset[];
  };
}

interface ZipEntry {
  filename: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  offsetLocalHeader: number;
}

class SafeZipReader {
  private readonly entries = new Map<string, ZipEntry>();

  constructor(private readonly buf: Buffer) {
    this.parse();
  }

  list(): string[] {
    return [...this.entries.keys()].sort();
  }

  readBuffer(filename: string): Buffer {
    const entry = this.entries.get(filename);
    if (!entry) throw new Error(`Package entry missing: ${filename}`);
    if (this.buf.readUInt32LE(entry.offsetLocalHeader) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header: ${filename}`);
    }
    const nameLen = this.buf.readUInt16LE(entry.offsetLocalHeader + 26);
    const extraLen = this.buf.readUInt16LE(entry.offsetLocalHeader + 28);
    const dataOff = entry.offsetLocalHeader + 30 + nameLen + extraLen;
    if (dataOff + entry.compressedSize > this.buf.length) {
      throw new Error(`Invalid ZIP entry bounds: ${filename}`);
    }
    const compressed = this.buf.subarray(dataOff, dataOff + entry.compressedSize);
    const out =
      entry.method === 0
        ? Buffer.from(compressed)
        : entry.method === 8
          ? inflateRawSync(compressed)
          : null;
    if (!out) throw new Error(`Unsupported ZIP compression method: ${entry.method}`);
    if (out.length !== entry.uncompressedSize) {
      throw new Error(`Invalid ZIP entry size: ${filename}`);
    }
    return out;
  }

  readText(filename: string): string {
    return this.readBuffer(filename).toString("utf8");
  }

  private parse(): void {
    const eocd = findEocd(this.buf);
    if (eocd < 0) throw new Error("Invalid project package: EOCD not found");
    const entryCount = this.buf.readUInt16LE(eocd + 10);
    if (entryCount > MAX_ZIP_ENTRIES) {
      throw new Error(`Project package has too many entries: ${entryCount}`);
    }
    const cdOffset = this.buf.readUInt32LE(eocd + 16);
    let p = cdOffset;
    let totalUncompressed = 0;
    for (let i = 0; i < entryCount; i += 1) {
      if (p + 46 > this.buf.length) throw new Error("Invalid ZIP central directory");
      const sig = this.buf.readUInt32LE(p);
      if (sig !== 0x02014b50) throw new Error(`Invalid ZIP central header at ${p}`);
      const method = this.buf.readUInt16LE(p + 10);
      const compressedSize = this.buf.readUInt32LE(p + 20);
      const uncompressedSize = this.buf.readUInt32LE(p + 24);
      const nameLen = this.buf.readUInt16LE(p + 28);
      const extraLen = this.buf.readUInt16LE(p + 30);
      const commentLen = this.buf.readUInt16LE(p + 32);
      const offsetLocalHeader = this.buf.readUInt32LE(p + 42);
      const filename = this.buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
      assertSafeZipPath(filename);
      if (method !== 0 && method !== 8) {
        throw new Error(`Unsupported ZIP compression method: ${method}`);
      }
      if (uncompressedSize > MAX_ENTRY_BYTES) {
        throw new Error(`Project package entry too large: ${filename}`);
      }
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error("Project package is too large to import safely");
      }
      if (this.entries.has(filename)) {
        throw new Error(`Duplicate package entry: ${filename}`);
      }
      this.entries.set(filename, {
        filename,
        method,
        compressedSize,
        uncompressedSize,
        offsetLocalHeader,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }
}

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function assertSafeZipPath(filename: string): void {
  if (!filename || filename.includes("\0") || filename.includes("\\")) {
    throw new Error(`Unsafe package path: ${filename}`);
  }
  if (filename.startsWith("/") || /^[A-Za-z]:/.test(filename)) {
    throw new Error(`Unsafe absolute package path: ${filename}`);
  }
  const parts = filename.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    throw new Error(`Unsafe package path segment: ${filename}`);
  }
}

function safeProjectFile(projectPath: string, relPath: string): string {
  const root = path.resolve(projectPath);
  const target = path.resolve(projectPath, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Unsafe project relative path: ${relPath}`);
  }
  return target;
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function allRows(db: DB, sql: string, ...params: SqlValue[]): RawRow[] {
  return db.prepare(sql).all(...params) as RawRow[];
}

function tableColumns(db: DB, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function insertRawRow(db: DB, table: string, row: RawRow): void {
  const currentColumns = tableColumns(db, table);
  const columns = Object.keys(row).filter((column) => currentColumns.has(column));
  if (columns.length === 0) return;
  const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
               VALUES (${columns.map((column) => `@${column}`).join(", ")})`;
  db.prepare(sql).run(row);
}

function sanitizePackageFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "item";
}

function chapterContentArchivePath(index: number, chapterId: string): string {
  return `chapters/${String(index + 1).padStart(4, "0")}-${sanitizePackageFileSegment(chapterId)}.md`;
}

function snapshotArchivePath(snapshotId: string): string {
  return `snapshots/${sanitizePackageFileSegment(snapshotId)}.md`;
}

function assetArchivePath(kind: "book-cover" | "world-pack-cover", id: string, relPath: string): string {
  const ext = path.extname(relPath).replace(/^\./, "") || "bin";
  return `assets/${kind}/${sanitizePackageFileSegment(id)}.${sanitizePackageFileSegment(ext)}`;
}

function packageRows(db: DB, projectId: string): Record<string, RawRow[]> {
  const tables: Record<string, RawRow[]> = {
    ai_feedbacks: allRows(db, `SELECT * FROM ai_feedbacks WHERE project_id = ?`, projectId),
    outline_cards: allRows(db, `SELECT * FROM outline_cards WHERE project_id = ?`, projectId),
    daily_logs: allRows(db, `SELECT * FROM daily_logs WHERE project_id = ?`, projectId),
    characters: allRows(db, `SELECT * FROM characters WHERE project_id = ?`, projectId),
    tavern_sessions: allRows(db, `SELECT * FROM tavern_sessions WHERE project_id = ?`, projectId),
    tavern_messages: allRows(
      db,
      `SELECT m.* FROM tavern_messages m
        INNER JOIN tavern_sessions s ON s.id = m.session_id
       WHERE s.project_id = ?`,
      projectId,
    ),
    world_entries: allRows(db, `SELECT * FROM world_entries WHERE project_id = ?`, projectId),
    research_notes: allRows(db, `SELECT * FROM research_notes WHERE project_id = ?`, projectId),
    review_dimensions: allRows(db, `SELECT * FROM review_dimensions WHERE project_id = ?`, projectId),
    review_reports: allRows(db, `SELECT * FROM review_reports WHERE project_id = ?`, projectId),
    review_findings: allRows(
      db,
      `SELECT f.* FROM review_findings f
        INNER JOIN review_reports r ON r.id = f.report_id
       WHERE r.project_id = ?`,
      projectId,
    ),
    book_covers: allRows(db, `SELECT * FROM book_covers WHERE project_id = ?`, projectId),
    chapter_origin_tags: allRows(
      db,
      `SELECT t.* FROM chapter_origin_tags t
        INNER JOIN chapters c ON c.id = t.chapter_id
       WHERE c.project_id = ?`,
      projectId,
    ),
    chapter_logs: allRows(db, `SELECT * FROM chapter_logs WHERE project_id = ?`, projectId),
    chapter_log_entries: allRows(
      db,
      `SELECT e.* FROM chapter_log_entries e
        INNER JOIN chapter_logs l ON l.id = e.log_id
       WHERE l.project_id = ?`,
      projectId,
    ),
    chapter_snapshots: allRows(db, `SELECT * FROM chapter_snapshots WHERE project_id = ?`, projectId),
    auto_writer_runs: allRows(db, `SELECT * FROM auto_writer_runs WHERE project_id = ?`, projectId),
    achievements_unlocked: allRows(db, `SELECT * FROM achievements_unlocked WHERE project_id = ?`, projectId),
    character_letters: allRows(db, `SELECT * FROM character_letters WHERE project_id = ?`, projectId),
    sample_libs: allRows(db, `SELECT * FROM sample_libs WHERE project_id = ?`, projectId),
    sample_chunks: allRows(
      db,
      `SELECT c.* FROM sample_chunks c
        INNER JOIN sample_libs l ON l.id = c.lib_id
       WHERE l.project_id = ?`,
      projectId,
    ),
    world_relationships: allRows(db, `SELECT * FROM world_relationships WHERE project_id = ?`, projectId),
    materials: allRows(db, `SELECT * FROM materials WHERE project_id = ?`, projectId),
    chapter_summaries: allRows(db, `SELECT * FROM chapter_summaries WHERE project_id = ?`, projectId),
    project_world_pack_slots: allRows(
      db,
      `SELECT * FROM project_world_pack_slots WHERE project_id = ?`,
      projectId,
    ),
    author_notes: allRows(db, `SELECT * FROM author_notes WHERE project_id = ?`, projectId),
    voice_profiles: allRows(db, `SELECT * FROM voice_profiles WHERE project_id = ?`, projectId),
    world_info_traces: allRows(db, `SELECT * FROM world_info_traces WHERE project_id = ?`, projectId),
  };

  const packIds = tables.project_world_pack_slots
    .map((row) => row.pack_id)
    .filter((id): id is string => typeof id === "string");
  if (packIds.length > 0) {
    const placeholders = packIds.map(() => "?").join(",");
    tables.world_packs = db
      .prepare(`SELECT * FROM world_packs WHERE id IN (${placeholders})`)
      .all(...packIds) as RawRow[];
    tables.world_pack_entries = db
      .prepare(`SELECT * FROM world_pack_entries WHERE pack_id IN (${placeholders})`)
      .all(...packIds) as RawRow[];
  } else {
    tables.world_packs = [];
    tables.world_pack_entries = [];
  }

  return tables;
}

function buildManifest(data: ProjectPackageData): RawRow {
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: data.exportedAt,
    sourceProjectId: data.sourceProjectId,
    sourceProjectName: data.project.name,
    chapterCount: data.chapters.length,
    characterCount: data.rows.characters.length,
    worldEntryCount: data.rows.world_entries.length,
    materialCount: data.rows.materials.length,
    sampleLibCount: data.rows.sample_libs.length,
    snapshotCount: data.rows.chapter_snapshots.length,
  };
}

export async function exportProjectPackage(input: {
  projectId: string;
  outputPath: string;
}): Promise<ProjectPackageExportResponse> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);

  const rows = packageRows(ctx.db, input.projectId);
  const data: ProjectPackageData = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sourceProjectId: project.id,
    project: {
      name: project.name,
      dailyGoal: project.dailyGoal,
      synopsis: project.synopsis,
      genre: project.genre,
      subGenre: project.subGenre,
      tags: project.tags,
      masterOutline: project.masterOutline,
      preRefineMasterOutline: project.preRefineMasterOutline,
      globalWorldview: project.globalWorldview,
    },
    chapters: [],
    rows,
    assets: {
      bookCover: null,
      snapshots: [],
      worldPackCovers: [],
    },
  };

  const zip = new ZipWriter();
  const chapters = allRows(
    ctx.db,
    `SELECT * FROM chapters WHERE project_id = ? ORDER BY "order" ASC, title ASC`,
    input.projectId,
  );
  for (let i = 0; i < chapters.length; i += 1) {
    const chapter = chapters[i];
    const chapterId = str(chapter.id);
    const filePath = str(chapter.file_path);
    const contentPath = chapterContentArchivePath(i, chapterId);
    const sourcePath = safeProjectFile(project.path, filePath);
    data.chapters.push({ row: chapter, contentPath });
    await zip.addFile(
      contentPath,
      fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath) : "",
    );
  }

  const cover = rows.book_covers[0];
  if (cover && typeof cover.id === "string" && typeof cover.file_path === "string") {
    const coverPath = safeProjectFile(project.path, cover.file_path);
    if (fs.existsSync(coverPath)) {
      const archivePath = assetArchivePath("book-cover", cover.id, cover.file_path);
      data.assets.bookCover = {
        rowId: cover.id,
        archivePath,
        relPath: cover.file_path,
        mime: typeof cover.mime === "string" ? cover.mime : null,
      };
      await zip.addFile(archivePath, fs.readFileSync(coverPath));
    }
  }

  for (const row of rows.chapter_snapshots) {
    if (typeof row.id !== "string" || typeof row.file_path !== "string") continue;
    const snapshotPath = safeProjectFile(project.path, row.file_path);
    if (!fs.existsSync(snapshotPath)) continue;
    const archivePath = snapshotArchivePath(row.id);
    data.assets.snapshots.push({ rowId: row.id, archivePath, relPath: row.file_path });
    await zip.addFile(archivePath, fs.readFileSync(snapshotPath));
  }

  for (const row of rows.world_packs) {
    if (typeof row.id !== "string" || typeof row.cover_path !== "string") continue;
    const coverPath = safeProjectFile(ctx.workspaceDir, row.cover_path);
    if (!fs.existsSync(coverPath)) continue;
    const archivePath = assetArchivePath("world-pack-cover", row.id, row.cover_path);
    data.assets.worldPackCovers.push({
      rowId: row.id,
      archivePath,
      relPath: row.cover_path,
      mime: typeof row.cover_mime === "string" ? row.cover_mime : null,
    });
    await zip.addFile(archivePath, fs.readFileSync(coverPath));
  }

  await zip.addFile(MANIFEST, JSON.stringify(buildManifest(data), null, 2));
  await zip.addFile(PROJECT_PACKAGE_DATA, JSON.stringify(data, null, 2));
  const buf = zip.finalize();
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, buf);

  return {
    projectId: input.projectId,
    outputPath: input.outputPath,
    byteCount: buf.length,
    manifestVersion: SCHEMA_VERSION,
    chapterCount: data.chapters.length,
    characterCount: rows.characters.length,
    worldEntryCount: rows.world_entries.length,
    materialCount: rows.materials.length,
    sampleLibCount: rows.sample_libs.length,
    snapshotCount: rows.chapter_snapshots.length,
  };
}

function parsePackageData(zip: SafeZipReader): ProjectPackageData {
  const manifest = JSON.parse(zip.readText(MANIFEST)) as Partial<ProjectPackageData>;
  const data = JSON.parse(zip.readText(PROJECT_PACKAGE_DATA)) as ProjectPackageData;
  if (manifest.format !== FORMAT || data.format !== FORMAT) {
    throw new Error("Not an InkForge project package");
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION || data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported project package schema: ${data.schemaVersion}`);
  }
  if (!data.project || !Array.isArray(data.chapters) || !data.rows) {
    throw new Error("Invalid project package data");
  }
  return data;
}

function uniqueImportProjectPath(workspaceDir: string, name: string): string {
  const base = sanitizeProjectName(name);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let candidate = path.join(workspaceDir, "projects", `${base}-${stamp}`);
  let counter = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(workspaceDir, "projects", `${base}-${stamp}-${counter}`);
    counter += 1;
  }
  return candidate;
}

class IdMaps {
  private readonly maps = new Map<string, Map<string, string>>();

  seed(table: string, rows: RawRow[]): void {
    for (const row of rows) {
      if (typeof row.id === "string") this.map(table, row.id);
    }
  }

  seedValue(table: string, id: SqlValue): void {
    if (typeof id === "string" && id) this.map(table, id);
  }

  map(table: string, oldId: string): string {
    let tableMap = this.maps.get(table);
    if (!tableMap) {
      tableMap = new Map();
      this.maps.set(table, tableMap);
    }
    const existing = tableMap.get(oldId);
    if (existing) return existing;
    const next = randomUUID();
    tableMap.set(oldId, next);
    return next;
  }

  get(table: string, oldId: SqlValue): string | null {
    if (typeof oldId !== "string" || !oldId) return null;
    return this.maps.get(table)?.get(oldId) ?? null;
  }
}

function seedIdMaps(data: ProjectPackageData): IdMaps {
  const maps = new IdMaps();
  for (const chapter of data.chapters) maps.seedValue("chapters", chapter.row.id);
  for (const table of Object.keys(data.rows)) maps.seed(table, data.rows[table] ?? []);
  return maps;
}

function str(value: SqlValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: SqlValue | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapJsonIds(raw: SqlValue, map: (id: string) => string | null): string {
  if (typeof raw !== "string") return "[]";
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return raw;
    return JSON.stringify(parsed.map((id) => (typeof id === "string" ? map(id) ?? id : id)));
  } catch {
    return raw;
  }
}

function mapReviewSummary(raw: SqlValue, maps: IdMaps): string {
  if (typeof raw !== "string") return "{}";
  try {
    const parsed = JSON.parse(raw) as {
      perDimension?: Array<Record<string, unknown>>;
      perChapter?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    if (Array.isArray(parsed.perDimension)) {
      parsed.perDimension = parsed.perDimension.map((item) => ({
        ...item,
        dimensionId:
          typeof item.dimensionId === "string"
            ? maps.get("review_dimensions", item.dimensionId) ?? item.dimensionId
            : item.dimensionId,
      }));
    }
    if (Array.isArray(parsed.perChapter)) {
      parsed.perChapter = parsed.perChapter.map((item) => ({
        ...item,
        chapterId:
          typeof item.chapterId === "string"
            ? maps.get("chapters", item.chapterId) ?? item.chapterId
            : item.chapterId,
      }));
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

function baseRow(row: RawRow, idTable: string, maps: IdMaps, projectId: string): RawRow {
  return {
    ...row,
    id: typeof row.id === "string" ? maps.map(idTable, row.id) : row.id,
    project_id: projectId,
  };
}

function insertRows(db: DB, table: string, rows: RawRow[]): void {
  for (const row of rows) insertRawRow(db, table, row);
}

function transformRows(
  data: ProjectPackageData,
  maps: IdMaps,
  projectId: string,
): Record<string, RawRow[]> {
  const rows = data.rows;
  const includedBookCoverIds = new Set(
    data.assets.bookCover ? [data.assets.bookCover.rowId] : [],
  );
  const includedSnapshotIds = new Set(data.assets.snapshots.map((asset) => asset.rowId));
  return {
    characters: (rows.characters ?? []).map((row) => ({
      ...baseRow(row, "characters", maps, projectId),
      linked_tavern_card_id: null,
    })),
    world_entries: (rows.world_entries ?? []).map((row) =>
      baseRow(row, "world_entries", maps, projectId),
    ),
    outline_cards: (rows.outline_cards ?? []).map((row) => ({
      ...baseRow(row, "outline_cards", maps, projectId),
      chapter_id: maps.get("chapters", row.chapter_id),
    })),
    ai_feedbacks: (rows.ai_feedbacks ?? []).map((row) => ({
      ...baseRow(row, "ai_feedbacks", maps, projectId),
      chapter_id: maps.get("chapters", row.chapter_id) ?? "",
    })),
    daily_logs: (rows.daily_logs ?? []).map((row) => ({ ...row, project_id: projectId })),
    research_notes: (rows.research_notes ?? []).map((row) =>
      baseRow(row, "research_notes", maps, projectId),
    ),
    review_dimensions: (rows.review_dimensions ?? []).map((row) => ({
      ...baseRow(row, "review_dimensions", maps, projectId),
      skill_id: null,
      enabled: row.skill_id ? 0 : row.enabled,
    })),
    review_reports: (rows.review_reports ?? []).map((row) => ({
      ...baseRow(row, "review_reports", maps, projectId),
      range_ids: mapJsonIds(row.range_ids, (id) => maps.get("chapters", id)),
      summary: mapReviewSummary(row.summary, maps),
    })),
    review_findings: (rows.review_findings ?? []).map((row) => ({
      ...baseRow(row, "review_findings", maps, projectId),
      report_id: maps.get("review_reports", row.report_id) ?? "",
      dimension_id: maps.get("review_dimensions", row.dimension_id) ?? str(row.dimension_id),
      chapter_id: maps.get("chapters", row.chapter_id),
    })),
    book_covers: (rows.book_covers ?? [])
      .filter((row) => typeof row.id === "string" && includedBookCoverIds.has(row.id))
      .map((row) => ({
        ...baseRow(row, "book_covers", maps, projectId),
        file_path: "",
      })),
    materials: (rows.materials ?? []).map((row) => baseRow(row, "materials", maps, projectId)),
    sample_libs: (rows.sample_libs ?? []).map((row) =>
      baseRow(row, "sample_libs", maps, projectId),
    ),
    sample_chunks: (rows.sample_chunks ?? []).map((row) => ({
      ...baseRow(row, "sample_chunks", maps, projectId),
      lib_id: maps.get("sample_libs", row.lib_id) ?? "",
    })),
    world_relationships: (rows.world_relationships ?? []).map((row) => ({
      ...baseRow(row, "world_relationships", maps, projectId),
      src_id:
        row.src_kind === "character"
          ? maps.get("characters", row.src_id) ?? ""
          : maps.get("world_entries", row.src_id) ?? "",
      dst_id:
        row.dst_kind === "character"
          ? maps.get("characters", row.dst_id) ?? ""
          : maps.get("world_entries", row.dst_id) ?? "",
    })),
    chapter_origin_tags: (rows.chapter_origin_tags ?? []).map((row) => ({
      ...row,
      chapter_id: maps.get("chapters", row.chapter_id) ?? "",
    })),
    chapter_logs: (rows.chapter_logs ?? []).map((row) => ({
      ...baseRow(row, "chapter_logs", maps, projectId),
      chapter_id: maps.get("chapters", row.chapter_id) ?? "",
    })),
    chapter_log_entries: (rows.chapter_log_entries ?? []).map((row) => ({
      ...baseRow(row, "chapter_log_entries", maps, projectId),
      log_id: maps.get("chapter_logs", row.log_id) ?? "",
      chapter_id: maps.get("chapters", row.chapter_id) ?? "",
    })),
    chapter_snapshots: (rows.chapter_snapshots ?? [])
      .filter((row) => typeof row.id === "string" && includedSnapshotIds.has(row.id))
      .map((row) => ({
        ...baseRow(row, "chapter_snapshots", maps, projectId),
        chapter_id: maps.get("chapters", row.chapter_id) ?? "",
        file_path: "",
        run_id: maps.get("auto_writer_runs", row.run_id),
      })),
    chapter_summaries: (rows.chapter_summaries ?? []).map((row) => ({
      ...row,
      chapter_id: maps.get("chapters", row.chapter_id) ?? "",
      project_id: projectId,
      provider_id: null,
    })),
    auto_writer_runs: (rows.auto_writer_runs ?? []).map((row) => ({
      ...baseRow(row, "auto_writer_runs", maps, projectId),
      chapter_id: maps.get("chapters", row.chapter_id) ?? "",
      status: row.status === "running" || row.status === "paused" ? "stopped" : row.status,
      last_snapshot_id:
        typeof row.last_snapshot_id === "string" && includedSnapshotIds.has(row.last_snapshot_id)
          ? maps.get("chapter_snapshots", row.last_snapshot_id)
          : null,
    })),
    achievements_unlocked: (rows.achievements_unlocked ?? []).map((row) =>
      baseRow(row, "achievements_unlocked", maps, projectId),
    ),
    character_letters: (rows.character_letters ?? []).map((row) => ({
      ...baseRow(row, "character_letters", maps, projectId),
      character_id: maps.get("characters", row.character_id) ?? "",
      provider_id: null,
    })),
    tavern_sessions: (rows.tavern_sessions ?? []).map((row) => ({
      ...baseRow(row, "tavern_sessions", maps, projectId),
      summary_provider_id: null,
    })),
    tavern_messages: (rows.tavern_messages ?? []).map((row) => ({
      ...baseRow(row, "tavern_messages", maps, projectId),
      session_id: maps.get("tavern_sessions", row.session_id) ?? "",
      character_id: null,
    })),
    world_packs: (rows.world_packs ?? []).map((row) => ({
      ...baseRow(row, "world_packs", maps, projectId),
      parent_pack_ids: mapJsonIds(row.parent_pack_ids, (id) => maps.get("world_packs", id)),
      cover_path: null,
      cover_mime: row.cover_mime,
    })),
    world_pack_entries: (rows.world_pack_entries ?? []).map((row) => ({
      ...baseRow(row, "world_pack_entries", maps, projectId),
      pack_id: maps.get("world_packs", row.pack_id) ?? "",
    })),
    project_world_pack_slots: (rows.project_world_pack_slots ?? []).map((row) => ({
      ...row,
      project_id: projectId,
      pack_id: maps.get("world_packs", row.pack_id) ?? "",
    })),
    author_notes: (rows.author_notes ?? []).map((row) =>
      baseRow(row, "author_notes", maps, projectId),
    ),
    voice_profiles: (rows.voice_profiles ?? []).map((row) =>
      baseRow(row, "voice_profiles", maps, projectId),
    ),
    world_info_traces: (rows.world_info_traces ?? []).map((row) =>
      baseRow(row, "world_info_traces", maps, projectId),
    ),
  };
}

function importedChapterFilePath(index: number, title: string): string {
  const safeTitle = sanitizeFileSegment(title).slice(0, 70) || "chapter";
  return path.posix.join("chapters", `${String(index + 1).padStart(4, "0")}-${safeTitle}.md`);
}

function writeImportedAssets(
  zip: SafeZipReader,
  data: ProjectPackageData,
  maps: IdMaps,
  projectPath: string,
  workspaceDir: string,
  transformed: Record<string, RawRow[]>,
): void {
  const cover = data.assets.bookCover;
  if (cover) {
    const row = transformed.book_covers?.find((item) => item.id === maps.get("book_covers", cover.rowId));
    if (row) {
      const ext = path.extname(cover.relPath ?? "").replace(/^\./, "") || "png";
      row.file_path = path.posix.join(".bookshelf", `cover.${sanitizePackageFileSegment(ext)}`);
      const target = safeProjectFile(projectPath, row.file_path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, zip.readBuffer(cover.archivePath));
    }
  }

  for (const asset of data.assets.snapshots) {
    const snapshotId = maps.get("chapter_snapshots", asset.rowId);
    const row = transformed.chapter_snapshots?.find((item) => item.id === snapshotId);
    if (!snapshotId || !row) continue;
    const chapterId = maps.get("chapters", row.chapter_id);
    const newChapterId = typeof row.chapter_id === "string" ? row.chapter_id : chapterId;
    if (!newChapterId) continue;
    row.file_path = relSnapshotPath(newChapterId, snapshotId);
    const target = safeProjectFile(projectPath, row.file_path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, zip.readBuffer(asset.archivePath));
  }

  for (const asset of data.assets.worldPackCovers) {
    const packId = maps.get("world_packs", asset.rowId);
    const row = transformed.world_packs?.find((item) => item.id === packId);
    if (!packId || !row) continue;
    const ext = path.extname(asset.relPath ?? "").replace(/^\./, "") || "png";
    row.cover_path = path.posix.join(".world-packs", `${packId}.${sanitizePackageFileSegment(ext)}`);
    row.cover_mime = asset.mime ?? row.cover_mime;
    const target = safeProjectFile(workspaceDir, row.cover_path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, zip.readBuffer(asset.archivePath));
  }

}

function importedProjectName(data: ProjectPackageData, nameOverride?: string): string {
  const base = nameOverride?.trim() || `${data.project.name}（导入）`;
  return base.slice(0, 120) || "导入项目";
}

export async function importProjectPackage(input: {
  filePath: string;
  nameOverride?: string;
}): Promise<ProjectPackageImportResponse> {
  const buf = fs.readFileSync(input.filePath);
  const zip = new SafeZipReader(buf);
  const data = parsePackageData(zip);
  for (const name of zip.list()) assertSafeZipPath(name);

  const ctx = getAppContext();
  const newProjectId = randomUUID();
  const name = importedProjectName(data, input.nameOverride);
  const projectPath = uniqueImportProjectPath(ctx.workspaceDir, name);
  const maps = seedIdMaps(data);
  const transformed = transformRows(data, maps, newProjectId);

  const tx = ctx.db.transaction(() => {
    ensureProjectLayout(projectPath, name);
    insertProject(ctx.db, {
      id: newProjectId,
      name,
      path: projectPath,
      dailyGoal: data.project.dailyGoal,
    });
    updateProjectMeta(ctx.db, {
      id: newProjectId,
      synopsis: data.project.synopsis,
      genre: data.project.genre,
      subGenre: data.project.subGenre,
      tags: data.project.tags,
      masterOutline: data.project.masterOutline,
      preRefineMasterOutline: data.project.preRefineMasterOutline,
      globalWorldview: data.project.globalWorldview,
    });

    for (let i = 0; i < data.chapters.length; i += 1) {
      const source = data.chapters[i];
      const oldId = str(source.row.id);
      const newChapterId = maps.map("chapters", oldId);
      const title = str(source.row.title, `Chapter ${i + 1}`);
      const filePath = importedChapterFilePath(i, title);
      const content = zip.readText(source.contentPath);
      writeChapterFile(projectPath, filePath, content);
      insertRawRow(ctx.db, "chapters", {
        id: newChapterId,
        project_id: newProjectId,
        parent_id: maps.get("chapters", source.row.parent_id),
        title,
        order: num(source.row.order, i),
        status: str(source.row.status, "draft"),
        word_count: num(source.row.word_count, content.replace(/\s+/g, "").length),
        file_path: filePath,
        updated_at: str(source.row.updated_at, new Date().toISOString()),
      });
    }

    insertRows(ctx.db, "characters", transformed.characters);
    insertRows(ctx.db, "world_entries", transformed.world_entries);
    insertRows(ctx.db, "outline_cards", transformed.outline_cards);
    insertRows(ctx.db, "ai_feedbacks", transformed.ai_feedbacks);
    insertRows(ctx.db, "daily_logs", transformed.daily_logs);
    insertRows(ctx.db, "research_notes", transformed.research_notes);
    insertRows(ctx.db, "review_dimensions", transformed.review_dimensions);
    insertRows(ctx.db, "review_reports", transformed.review_reports);
    insertRows(ctx.db, "review_findings", transformed.review_findings);
    writeImportedAssets(zip, data, maps, projectPath, ctx.workspaceDir, transformed);
    insertRows(ctx.db, "book_covers", transformed.book_covers ?? []);
    insertRows(ctx.db, "chapter_origin_tags", transformed.chapter_origin_tags);
    insertRows(ctx.db, "chapter_logs", transformed.chapter_logs);
    insertRows(ctx.db, "chapter_log_entries", transformed.chapter_log_entries);
    insertRows(ctx.db, "chapter_summaries", transformed.chapter_summaries);
    insertRows(ctx.db, "chapter_snapshots", transformed.chapter_snapshots);
    insertRows(ctx.db, "auto_writer_runs", transformed.auto_writer_runs);
    insertRows(ctx.db, "achievements_unlocked", transformed.achievements_unlocked);
    insertRows(ctx.db, "character_letters", transformed.character_letters);
    insertRows(ctx.db, "tavern_sessions", transformed.tavern_sessions);
    insertRows(ctx.db, "tavern_messages", transformed.tavern_messages);
    insertRows(ctx.db, "sample_libs", transformed.sample_libs);
    insertRows(ctx.db, "sample_chunks", transformed.sample_chunks);
    insertRows(ctx.db, "world_relationships", transformed.world_relationships);
    insertRows(ctx.db, "materials", transformed.materials);
    insertRows(ctx.db, "world_packs", transformed.world_packs);
    insertRows(ctx.db, "world_pack_entries", transformed.world_pack_entries);
    insertRows(ctx.db, "project_world_pack_slots", transformed.project_world_pack_slots);
    insertRows(ctx.db, "author_notes", transformed.author_notes);
    insertRows(ctx.db, "voice_profiles", transformed.voice_profiles);
    insertRows(ctx.db, "world_info_traces", transformed.world_info_traces);
  });
  tx();

  if (!ctx.config.workspaceDir) {
    updateWorkspaceConfig({ workspaceDir: ctx.workspaceDir });
  }

  const created = getProject(ctx.db, newProjectId);
  if (!created) throw new Error("project package import failed");
  return {
    projectId: created.id,
    name: created.name,
    path: created.path,
    manifestVersion: SCHEMA_VERSION,
    chapterCount: data.chapters.length,
    characterCount: data.rows.characters.length,
    worldEntryCount: data.rows.world_entries.length,
    materialCount: data.rows.materials.length,
    sampleLibCount: data.rows.sample_libs.length,
    snapshotCount: data.rows.chapter_snapshots.length,
  };
}

export function assertProjectPackageZipIsSafeForTest(buf: Buffer): string[] {
  return new SafeZipReader(buf).list();
}
