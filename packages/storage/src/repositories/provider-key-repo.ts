import type { DB } from "../db";
import type { ProviderKeyRecord } from "@inkforge/shared";
import type { EncryptedSecret } from "../keystore";

type ProviderKeyRow = {
  id: string;
  provider_id: string;
  label: string;
  api_key_enc: string | null;
  api_key_iv: string | null;
  api_key_tag: string | null;
  stored_in_keychain: number;
  weight: number;
  disabled: number;
  last_failed_at: string | null;
  fail_count: number;
  created_at: string;
  updated_at: string;
};

export interface ProviderKeyPersistence extends ProviderKeyRecord {
  encrypted: EncryptedSecret | null;
}

function rowToPersistence(row: ProviderKeyRow): ProviderKeyPersistence {
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
    providerId: row.provider_id,
    label: row.label,
    weight: row.weight,
    disabled: row.disabled === 1,
    storedInKeychain: row.stored_in_keychain === 1,
    lastFailedAt: row.last_failed_at,
    failCount: row.fail_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    encrypted,
  };
}

function toPublic(record: ProviderKeyPersistence): ProviderKeyRecord {
  const {
    encrypted: _encrypted, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...rest
  } = record;
  return rest;
}

export interface InsertProviderKeyInput {
  id: string;
  providerId: string;
  label: string;
  encrypted?: EncryptedSecret | null;
  storedInKeychain?: boolean;
  weight?: number;
  disabled?: boolean;
}

export function insertProviderKey(
  db: DB,
  input: InsertProviderKeyInput,
): ProviderKeyRecord {
  const now = new Date().toISOString();
  const row: ProviderKeyRow = {
    id: input.id,
    provider_id: input.providerId,
    label: input.label,
    api_key_enc: input.encrypted?.ciphertext ?? null,
    api_key_iv: input.encrypted?.iv ?? null,
    api_key_tag: input.encrypted?.tag ?? null,
    stored_in_keychain: input.storedInKeychain ? 1 : 0,
    weight: Math.max(0, Math.round(input.weight ?? 1)),
    disabled: input.disabled ? 1 : 0,
    last_failed_at: null,
    fail_count: 0,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO provider_keys
       (id, provider_id, label, api_key_enc, api_key_iv, api_key_tag,
        stored_in_keychain, weight, disabled, last_failed_at, fail_count,
        created_at, updated_at)
     VALUES (@id, @provider_id, @label, @api_key_enc, @api_key_iv, @api_key_tag,
             @stored_in_keychain, @weight, @disabled, @last_failed_at, @fail_count,
             @created_at, @updated_at)`,
  ).run(row);
  return toPublic(rowToPersistence(row));
}

export interface UpdateProviderKeyInput {
  id: string;
  label?: string;
  encrypted?: EncryptedSecret | null;
  storedInKeychain?: boolean;
  weight?: number;
  disabled?: boolean;
  clearKey?: boolean;
}

export function updateProviderKey(
  db: DB,
  input: UpdateProviderKeyInput,
): ProviderKeyRecord {
  const existing = db
    .prepare(`SELECT * FROM provider_keys WHERE id = ?`)
    .get(input.id) as ProviderKeyRow | undefined;
  if (!existing) throw new Error(`ProviderKey not found: ${input.id}`);
  const next: ProviderKeyRow = {
    ...existing,
    label: input.label ?? existing.label,
    weight:
      input.weight !== undefined
        ? Math.max(0, Math.round(input.weight))
        : existing.weight,
    disabled:
      input.disabled !== undefined ? (input.disabled ? 1 : 0) : existing.disabled,
    updated_at: new Date().toISOString(),
  };
  if (input.clearKey) {
    next.api_key_enc = null;
    next.api_key_iv = null;
    next.api_key_tag = null;
    next.stored_in_keychain = 0;
  } else if (input.encrypted !== undefined) {
    next.api_key_enc = input.encrypted?.ciphertext ?? null;
    next.api_key_iv = input.encrypted?.iv ?? null;
    next.api_key_tag = input.encrypted?.tag ?? null;
    next.stored_in_keychain = input.storedInKeychain ? 1 : 0;
  } else if (input.storedInKeychain !== undefined) {
    next.stored_in_keychain = input.storedInKeychain ? 1 : 0;
  }
  db.prepare(
    `UPDATE provider_keys SET
       label = @label, api_key_enc = @api_key_enc, api_key_iv = @api_key_iv,
       api_key_tag = @api_key_tag, stored_in_keychain = @stored_in_keychain,
       weight = @weight, disabled = @disabled, updated_at = @updated_at
     WHERE id = @id`,
  ).run(next);
  return toPublic(rowToPersistence(next));
}

export function getProviderKeyPersistenceRecord(
  db: DB,
  id: string,
): ProviderKeyPersistence | null {
  const row = db
    .prepare(`SELECT * FROM provider_keys WHERE id = ?`)
    .get(id) as ProviderKeyRow | undefined;
  return row ? rowToPersistence(row) : null;
}

export function listProviderKeyPersistenceRecords(
  db: DB,
  providerId: string,
): ProviderKeyPersistence[] {
  const rows = db
    .prepare(
      `SELECT * FROM provider_keys WHERE provider_id = ? ORDER BY created_at ASC`,
    )
    .all(providerId) as ProviderKeyRow[];
  return rows.map(rowToPersistence);
}

export function listProviderKeys(db: DB, providerId: string): ProviderKeyRecord[] {
  return listProviderKeyPersistenceRecords(db, providerId).map(toPublic);
}

export function deleteProviderKey(db: DB, id: string): void {
  db.prepare(`DELETE FROM provider_keys WHERE id = ?`).run(id);
}

export function markProviderKeyFailure(
  db: DB,
  id: string,
  atIso?: string,
): ProviderKeyRecord | null {
  const at = atIso ?? new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE provider_keys
       SET fail_count = fail_count + 1,
           last_failed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(at, at, id);
  if (info.changes === 0) return null;
  const row = db
    .prepare(`SELECT * FROM provider_keys WHERE id = ?`)
    .get(id) as ProviderKeyRow | undefined;
  return row ? toPublic(rowToPersistence(row)) : null;
}

export function markProviderKeySuccess(
  db: DB,
  id: string,
): ProviderKeyRecord | null {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE provider_keys
       SET fail_count = 0,
           last_failed_at = NULL,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(now, id);
  if (info.changes === 0) return null;
  const row = db
    .prepare(`SELECT * FROM provider_keys WHERE id = ?`)
    .get(id) as ProviderKeyRow | undefined;
  return row ? toPublic(rowToPersistence(row)) : null;
}
