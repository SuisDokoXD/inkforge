// C1: entity_embeddings 表的 CRUD 操作。
// 存储文本 n-gram 指纹，用于语义相似搜索。
import type { DB } from "../db";
import {
  buildFingerprint,
  deserializeFingerprint,
  hashText,
  rankBySimilarity,
  serializeFingerprint,
  type NGramFingerprint,
  type ScoredMatch,
} from "../semantic-search";

type EmbeddingRow = {
  entity_type: string;
  entity_id: string;
  project_id: string;
  fingerprint_json: string;
  source_text_hash: string;
  updated_at: string;
};

// ─── 写入 ─────────────────────────────────────────────────────

export interface UpsertEmbeddingInput {
  entityType: string;
  entityId: string;
  projectId: string;
  sourceText: string;
}

/** 为某个实体建立/更新语义指纹。如果文本未变（hash 相同）则跳过。 */
export function upsertEmbedding(db: DB, input: UpsertEmbeddingInput): void {
  const textHash = hashText(input.sourceText);

  // 检查是否已存在且未变化
  const existing = db
    .prepare(`SELECT source_text_hash FROM entity_embeddings WHERE entity_type = ? AND entity_id = ?`)
    .get(input.entityType, input.entityId) as { source_text_hash: string } | undefined;

  if (existing && existing.source_text_hash === textHash) return;

  const fp = buildFingerprint(input.sourceText);
  const json = serializeFingerprint(fp);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT OR REPLACE INTO entity_embeddings
     (entity_type, entity_id, project_id, fingerprint_json, source_text_hash, updated_at)
     VALUES (@et, @eid, @pid, @json, @hash, @now)`,
  ).run({
    et: input.entityType,
    eid: input.entityId,
    pid: input.projectId,
    json,
    hash: textHash,
    now,
  });
}

// ─── 查询 ─────────────────────────────────────────────────────

export interface EmbeddingEntry {
  entityType: string;
  entityId: string;
  fingerprint: NGramFingerprint;
}

/** 加载某个项目下所有实体的指纹。 */
export function listEmbeddings(db: DB, projectId: string): EmbeddingEntry[] {
  const rows = db
    .prepare(
      `SELECT entity_type, entity_id, fingerprint_json FROM entity_embeddings WHERE project_id = ?`,
    )
    .all(projectId) as EmbeddingRow[];

  return rows
    .map((row) => {
      const fp = deserializeFingerprint(row.fingerprint_json);
      if (!fp) return null;
      return {
        entityType: row.entity_type,
        entityId: row.entity_id,
        fingerprint: fp,
      };
    })
    .filter((e): e is EmbeddingEntry => e !== null);
}

// ─── 语义搜索 ─────────────────────────────────────────────────

export interface SemanticSearchInput {
  projectId: string;
  query: string;
  /** 限制实体类型（"world_entry" | "character" | "research_note"），不传则搜所有 */
  entityTypes?: string[];
  topK?: number;
  minScore?: number;
}

/** 在指定项目内执行语义搜索（基于 n-gram 指纹相似度） */
export function semanticSearch(
  db: DB,
  input: SemanticSearchInput,
): ScoredMatch[] {
  const { projectId, query, entityTypes, topK = 8, minScore = 0.06 } = input;
  const queryFp = buildFingerprint(query);
  if (Object.keys(queryFp.grams).length === 0) return [];

  // 加载候选指纹
  let candidates: EmbeddingEntry[];
  if (entityTypes && entityTypes.length > 0) {
    const placeholders = entityTypes.map(() => "?").join(",");
    candidates = (db
      .prepare(
        `SELECT entity_type, entity_id, fingerprint_json FROM entity_embeddings
         WHERE project_id = ? AND entity_type IN (${placeholders})`,
      )
      .all(projectId, ...entityTypes) as EmbeddingRow[])
      .map((row) => {
        const fp = deserializeFingerprint(row.fingerprint_json);
        if (!fp) return null;
        return {
          entityType: row.entity_type,
          entityId: row.entity_id,
          fingerprint: fp,
        };
      })
      .filter((e): e is EmbeddingEntry => e !== null);
  } else {
    candidates = listEmbeddings(db, projectId);
  }

  // 需要 source text 用于排序后渲染——这里用一个占位符，
  // 实际 source text 由上层（rag-service）根据 entity_id 回查。
  const ranked = rankBySimilarity(
    queryFp,
    candidates.map((c) => ({
      entityType: c.entityType,
      entityId: c.entityId,
      fingerprint: c.fingerprint,
      sourceText: "", // 上层回查填充
    })),
    topK,
    minScore,
  );

  return ranked;
}

// ─── 删除 ─────────────────────────────────────────────────────

export function deleteEmbedding(db: DB, entityType: string, entityId: string): void {
  db.prepare(`DELETE FROM entity_embeddings WHERE entity_type = ? AND entity_id = ?`).run(
    entityType,
    entityId,
  );
}

/** 重索引：为某项目下所有 world_entries + characters + research_notes 建立指纹。
 *  用于首次迁移后批量建索引。 */
export function reindexProject(
  db: DB,
  projectId: string,
  opts: { worldEntries?: boolean; characters?: boolean; researchNotes?: boolean },
): { indexed: number } {
  let count = 0;
  const now = new Date().toISOString();

  if (opts.worldEntries !== false) {
    const rows = db
      .prepare(`SELECT id, title, content, COALESCE(aliases, '') AS aliases FROM world_entries WHERE project_id = ?`)
      .all(projectId) as Array<{ id: string; title: string; content: string; aliases: string }>;
    for (const row of rows) {
      const text = `${row.title} ${row.aliases} ${row.content}`.trim();
      if (!text) continue;
      const fp = buildFingerprint(text);
      db.prepare(
        `INSERT OR REPLACE INTO entity_embeddings (entity_type, entity_id, project_id, fingerprint_json, source_text_hash, updated_at)
         VALUES ('world_entry', @eid, @pid, @json, @hash, @now)`,
      ).run({
        eid: row.id,
        pid: projectId,
        json: serializeFingerprint(fp),
        hash: hashText(text),
        now,
      });
      count++;
    }
  }

  if (opts.characters !== false) {
    const rows = db
      .prepare(`SELECT id, name, COALESCE(persona, '') AS persona, backstory FROM characters WHERE project_id = ?`)
      .all(projectId) as Array<{ id: string; name: string; persona: string; backstory: string }>;
    for (const row of rows) {
      const text = `${row.name} ${row.persona} ${row.backstory}`.trim();
      if (!text) continue;
      const fp = buildFingerprint(text);
      db.prepare(
        `INSERT OR REPLACE INTO entity_embeddings (entity_type, entity_id, project_id, fingerprint_json, source_text_hash, updated_at)
         VALUES ('character', @eid, @pid, @json, @hash, @now)`,
      ).run({
        eid: row.id,
        pid: projectId,
        json: serializeFingerprint(fp),
        hash: hashText(text),
        now,
      });
      count++;
    }
  }

  if (opts.researchNotes !== false) {
    const rows = db
      .prepare(`SELECT id, topic, COALESCE(note, '') AS note, COALESCE(excerpt, '') AS excerpt FROM research_notes WHERE project_id = ?`)
      .all(projectId) as Array<{ id: string; topic: string; note: string; excerpt: string }>;
    for (const row of rows) {
      const text = `${row.topic} ${row.note} ${row.excerpt}`.trim();
      if (!text) continue;
      const fp = buildFingerprint(text);
      db.prepare(
        `INSERT OR REPLACE INTO entity_embeddings (entity_type, entity_id, project_id, fingerprint_json, source_text_hash, updated_at)
         VALUES ('research_note', @eid, @pid, @json, @hash, @now)`,
      ).run({
        eid: row.id,
        pid: projectId,
        json: serializeFingerprint(fp),
        hash: hashText(text),
        now,
      });
      count++;
    }
  }

  return { indexed: count };
}
