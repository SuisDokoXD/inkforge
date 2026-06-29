import type { DB } from "../db";
import type { EncryptedSecret } from "../keystore";

type Row = {
  provider: string;
  api_key_enc: string | null;
  api_key_iv: string | null;
  api_key_tag: string | null;
  stored_in_keychain: number;
  updated_at: string;
};

function rowToEncrypted(row: Row): EncryptedSecret | null {
  if (row.api_key_enc && row.api_key_iv && row.api_key_tag) {
    return {
      ciphertext: row.api_key_enc,
      iv: row.api_key_iv,
      tag: row.api_key_tag,
    };
  }
  return null;
}

/**
 * Insert or replace the encrypted credential for a research provider (tavily/bing/serpapi).
 * Called by research-service after keystore.setKey() returns the encrypted blob.
 */
export function upsertResearchCredential(
  db: DB,
  provider: string,
  encrypted: EncryptedSecret | null,
  storedInKeychain: boolean,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO research_credentials
       (provider, api_key_enc, api_key_iv, api_key_tag, stored_in_keychain, updated_at)
     VALUES (@provider, @api_key_enc, @api_key_iv, @api_key_tag, @stored_in_keychain, @updated_at)
     ON CONFLICT(provider) DO UPDATE SET
       api_key_enc = excluded.api_key_enc,
       api_key_iv = excluded.api_key_iv,
       api_key_tag = excluded.api_key_tag,
       stored_in_keychain = excluded.stored_in_keychain,
       updated_at = excluded.updated_at`,
  ).run({
    provider,
    api_key_enc: encrypted?.ciphertext ?? null,
    api_key_iv: encrypted?.iv ?? null,
    api_key_tag: encrypted?.tag ?? null,
    stored_in_keychain: storedInKeychain ? 1 : 0,
    updated_at: now,
  });
}

/**
 * Read back the encrypted credential blob for a research provider.
 * Returns null if no credential exists for this provider.
 */
export function getResearchCredentialEncrypted(
  db: DB,
  provider: string,
): EncryptedSecret | null {
  const row = db
    .prepare(`SELECT * FROM research_credentials WHERE provider = ?`)
    .get(provider) as Row | undefined;
  return row ? rowToEncrypted(row) : null;
}

/**
 * Delete the credential row for a research provider.
 * Called by research-service after keystore.deleteKey().
 */
export function deleteResearchCredential(db: DB, provider: string): void {
  db.prepare(`DELETE FROM research_credentials WHERE provider = ?`).run(provider);
}
