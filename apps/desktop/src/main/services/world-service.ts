import { randomUUID } from "crypto";
import {
  cleanupOrphanRelationships,
  deleteWorldEntry,
  getWorldEntryById,
  insertWorldEntry,
  listWorldEntries,
  searchWorldEntries,
  updateWorldEntry,
} from "@inkforge/storage";
import type {
  WorldCreateInput,
  WorldDeleteInput,
  WorldEntryRecord,
  WorldGetInput,
  WorldListInput,
  WorldSearchInput,
  WorldUpdateInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

function normalizeStringArray(input: unknown): string[] | undefined {
  if (!input) return undefined;
  if (!Array.isArray(input)) return undefined;
  const out: string[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }
  return out;
}

export function createWorldEntry(input: WorldCreateInput): WorldEntryRecord {
  const ctx = getAppContext();
  if (!input.title?.trim()) throw new Error("world entry title required");
  if (!input.category?.trim()) throw new Error("world entry category required");
  return insertWorldEntry(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    category: input.category.trim(),
    title: input.title.trim(),
    content: input.content ?? "",
    aliases: normalizeStringArray(input.aliases) ?? [],
    tags: normalizeStringArray(input.tags) ?? [],
    // v22 World Info 字段：未传则用 repo / SQL DEFAULT 兜底
    keys: normalizeStringArray(input.keys),
    position: input.position,
    probability: input.probability,
    // v25 CCv3 兼容字段：未传则走 SQL DEFAULT
    secondaryKeys: normalizeStringArray(input.secondaryKeys),
    selectiveLogic: input.selectiveLogic,
    caseSensitive: input.caseSensitive,
    constant: input.constant,
    extensions: input.extensions,
  });
}

export function updateWorldEntryRecord(
  input: WorldUpdateInput,
): WorldEntryRecord {
  const ctx = getAppContext();
  return updateWorldEntry(ctx.db, {
    id: input.id,
    category: input.category?.trim(),
    title: input.title?.trim(),
    content: input.content,
    aliases: normalizeStringArray(input.aliases),
    tags: normalizeStringArray(input.tags),
    keys: normalizeStringArray(input.keys),
    position: input.position,
    probability: input.probability,
    // v25 CCv3 字段：未传保留原值
    secondaryKeys: normalizeStringArray(input.secondaryKeys),
    selectiveLogic: input.selectiveLogic,
    caseSensitive: input.caseSensitive,
    constant: input.constant,
    extensions: input.extensions,
  });
}

export function getWorldEntry(input: WorldGetInput): WorldEntryRecord | null {
  const ctx = getAppContext();
  return getWorldEntryById(ctx.db, input.id);
}

export function listWorldEntryRecords(
  input: WorldListInput,
): WorldEntryRecord[] {
  const ctx = getAppContext();
  return listWorldEntries(ctx.db, {
    projectId: input.projectId,
    category: input.category,
    search: input.search,
  });
}

export function deleteWorldEntryRecord(
  input: WorldDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  // Look up project_id before delete to clean orphan polymorphic relationships.
  const existing = getWorldEntryById(ctx.db, input.id);
  deleteWorldEntry(ctx.db, input.id);
  if (existing) {
    cleanupOrphanRelationships(ctx.db, existing.projectId, "world_entry", input.id);
  }
  return { id: input.id };
}

export function searchWorldEntryRecords(
  input: WorldSearchInput,
): WorldEntryRecord[] {
  const ctx = getAppContext();
  return searchWorldEntries(ctx.db, {
    projectId: input.projectId,
    query: input.query,
    limit: input.limit,
  });
}
