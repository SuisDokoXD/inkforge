import type { DB } from "../db";

/**
 * RAG retrieval helpers (LIKE-based, project-scoped).
 *
 * Caller layer: rag-service.ts in apps/desktop builds the final 【参考资料】 block.
 * Each fn here returns raw matches; capping/dedup happens at caller.
 *
 * Security: project_id is ALWAYS hard-filtered to prevent cross-project leakage.
 * Sample chunks join sample_libs to enforce this.
 */

export interface WorldEntryHit {
  category: string;
  title: string;
  content: string;
}

export interface CharacterHit {
  name: string;
  persona: string;
  backstory: string;
}

export interface ResearchHit {
  topic: string;
  excerpt: string;
  note: string;
}

export interface SampleChunkHit {
  libId: string;
  libTitle: string;
  libAuthor: string | null;
  chapterTitle: string | null;
  text: string;
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function buildLikeWhere(field: string, queries: string[]): {
  clause: string;
  params: string[];
} {
  if (queries.length === 0) return { clause: "0", params: [] };
  const parts: string[] = [];
  const params: string[] = [];
  for (const q of queries) {
    parts.push(`${field} LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(q)}%`);
  }
  return { clause: parts.join(" OR "), params };
}

export function ragSearchWorldEntries(
  db: DB,
  projectId: string,
  queries: string[],
  limit: number,
): WorldEntryHit[] {
  const where = buildLikeWhere("(title || ' ' || content || ' ' || aliases)", queries);
  return db
    .prepare(
      `SELECT category, title, content FROM world_entries
       WHERE project_id = ? AND (${where.clause})
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(projectId, ...where.params, limit) as WorldEntryHit[];
}

export function ragSearchCharacters(
  db: DB,
  projectId: string,
  queries: string[],
  limit: number,
): CharacterHit[] {
  const where = buildLikeWhere(
    "(name || ' ' || COALESCE(persona, '') || ' ' || backstory)",
    queries,
  );
  return db
    .prepare(
      `SELECT name, COALESCE(persona, '') AS persona, backstory FROM characters
       WHERE project_id = ? AND (${where.clause})
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(projectId, ...where.params, limit) as CharacterHit[];
}

export function ragSearchResearchNotes(
  db: DB,
  projectId: string,
  queries: string[],
  limit: number,
): ResearchHit[] {
  const where = buildLikeWhere(
    "(topic || ' ' || excerpt || ' ' || note)",
    queries,
  );
  return db
    .prepare(
      `SELECT topic, excerpt, note FROM research_notes
       WHERE project_id = ? AND (${where.clause})
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(projectId, ...where.params, limit) as ResearchHit[];
}

export function ragSearchSampleChunks(
  db: DB,
  projectId: string,
  queries: string[],
  limit: number,
): SampleChunkHit[] {
  const where = buildLikeWhere("c.text", queries);
  return db
    .prepare(
      `SELECT
         l.id             AS libId,
         l.title          AS libTitle,
         l.author         AS libAuthor,
         c.chapter_title  AS chapterTitle,
         c.text           AS text
       FROM sample_chunks c
       JOIN sample_libs l ON l.id = c.lib_id
       WHERE l.project_id = ? AND (${where.clause})
       ORDER BY c.ordinal ASC LIMIT ?`,
    )
    .all(projectId, ...where.params, limit) as SampleChunkHit[];
}
