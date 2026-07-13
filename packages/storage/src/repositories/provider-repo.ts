import type { DB } from "../db";
import type {
  ProviderKeyStrategy,
  ProviderRecord,
  ProviderVendor,
} from "@inkforge/shared";
import type { EncryptedSecret } from "../keystore";

type ProviderRow = {
  id: string;
  label: string;
  vendor: string;
  base_url: string;
  default_model: string;
  tags: string;
  api_key_enc: string | null;
  api_key_iv: string | null;
  api_key_tag: string | null;
  stored_in_keychain: number;
  key_strategy: string | null;
  cooldown_ms: number | null;
};

export interface ProviderPersistenceRecord extends ProviderRecord {
  encrypted: EncryptedSecret | null;
  storedInKeychain: boolean;
  keyStrategy: ProviderKeyStrategy;
  cooldownMs: number;
}

function normalizeStrategy(value: string | null): ProviderKeyStrategy {
  if (
    value === "single" ||
    value === "round-robin" ||
    value === "weighted" ||
    value === "sticky"
  ) {
    return value;
  }
  return "single";
}

function rowToPersistenceRecord(row: ProviderRow): ProviderPersistenceRecord {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    tags = [];
  }
  const encrypted: EncryptedSecret | null =
    row.api_key_enc && row.api_key_iv && row.api_key_tag !== null
      ? {
          ciphertext: row.api_key_enc,
          iv: row.api_key_iv,
          tag: row.api_key_tag,
        }
      : null;
  return {
    id: row.id,
    label: row.label,
    vendor: row.vendor as ProviderVendor,
    baseUrl: row.base_url,
    defaultModel: row.default_model,
    tags,
    encrypted,
    storedInKeychain: row.stored_in_keychain === 1,
    keyStrategy: normalizeStrategy(row.key_strategy),
    cooldownMs: typeof row.cooldown_ms === "number" ? row.cooldown_ms : 60000,
  };
}

function toPublic(record: ProviderPersistenceRecord): ProviderRecord {
  return {
    id: record.id,
    label: record.label,
    vendor: record.vendor,
    baseUrl: record.baseUrl,
    defaultModel: record.defaultModel,
    tags: record.tags,
  };
}

export interface UpsertProviderRow {
  id: string;
  label: string;
  vendor: ProviderVendor;
  baseUrl: string;
  defaultModel: string;
  tags: string[];
  encrypted: EncryptedSecret | null;
  storedInKeychain: boolean;
}

export function upsertProvider(db: DB, input: UpsertProviderRow): ProviderRecord {
  db.prepare(
    `INSERT INTO providers (id, label, vendor, base_url, default_model, tags, api_key_enc, api_key_iv, api_key_tag, stored_in_keychain)
     VALUES (@id, @label, @vendor, @base_url, @default_model, @tags, @api_key_enc, @api_key_iv, @api_key_tag, @stored_in_keychain)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       vendor = excluded.vendor,
       base_url = excluded.base_url,
       default_model = excluded.default_model,
       tags = excluded.tags,
       api_key_enc = excluded.api_key_enc,
       api_key_iv = excluded.api_key_iv,
       api_key_tag = excluded.api_key_tag,
       stored_in_keychain = excluded.stored_in_keychain`,
  ).run({
    id: input.id,
    label: input.label,
    vendor: input.vendor,
    base_url: input.baseUrl,
    default_model: input.defaultModel,
    tags: JSON.stringify(input.tags),
    api_key_enc: input.encrypted?.ciphertext ?? null,
    api_key_iv: input.encrypted?.iv ?? null,
    api_key_tag: input.encrypted?.tag ?? null,
    stored_in_keychain: input.storedInKeychain ? 1 : 0,
  });
  return {
    id: input.id,
    label: input.label,
    vendor: input.vendor,
    baseUrl: input.baseUrl,
    defaultModel: input.defaultModel,
    tags: input.tags,
  };
}

export function listProviders(db: DB): ProviderRecord[] {
  return listProviderPersistenceRecords(db).map(toPublic);
}

export function listProviderPersistenceRecords(db: DB): ProviderPersistenceRecord[] {
  const rows = db.prepare(`SELECT * FROM providers ORDER BY label ASC`).all() as ProviderRow[];
  return rows.map(rowToPersistenceRecord);
}

export function getProviderPersistenceRecord(db: DB, id: string): ProviderPersistenceRecord | null {
  const row = db.prepare(`SELECT * FROM providers WHERE id = ?`).get(id) as ProviderRow | undefined;
  return row ? rowToPersistenceRecord(row) : null;
}

export function getFirstProviderPersistenceRecord(db: DB): ProviderPersistenceRecord | null {
  const row = db
    .prepare(`SELECT * FROM providers ORDER BY label ASC LIMIT 1`)
    .get() as ProviderRow | undefined;
  return row ? rowToPersistenceRecord(row) : null;
}

export function deleteProvider(db: DB, id: string): void {
  db.prepare(`DELETE FROM providers WHERE id = ?`).run(id);
}

export interface UpdateProviderStrategyInput {
  id: string;
  keyStrategy?: ProviderKeyStrategy;
  cooldownMs?: number;
}

export function updateProviderKeyStrategy(
  db: DB,
  input: UpdateProviderStrategyInput,
): void {
  const set: string[] = [];
  const params: Record<string, unknown> = { id: input.id };
  if (input.keyStrategy !== undefined) {
    set.push("key_strategy = @key_strategy");
    params.key_strategy = input.keyStrategy;
  }
  if (input.cooldownMs !== undefined) {
    set.push("cooldown_ms = @cooldown_ms");
    params.cooldown_ms = Math.max(0, Math.round(input.cooldownMs));
  }
  if (set.length === 0) return;
  db.prepare(`UPDATE providers SET ${set.join(", ")} WHERE id = @id`).run(params);
}
