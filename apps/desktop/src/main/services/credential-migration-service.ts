import * as fs from "fs";
import * as path from "path";
import {
  isOsProtectedSecret,
  listProviderKeyPersistenceRecords,
  listProviderPersistenceRecords,
  listResearchCredentialPersistenceRecords,
  updateProviderKey,
  upsertProvider,
  upsertResearchCredential,
  type DB,
  type Keystore,
} from "@inkforge/storage";

export interface CredentialMigrationResult {
  migrated: number;
  failed: number;
  masterKeyRemoved: boolean;
}

interface MigrationLogger {
  warn(message: string, ...args: unknown[]): void;
}

async function migrateSecret(
  keystore: Keystore,
  account: string,
  encrypted: Parameters<Keystore["getKey"]>[1],
): Promise<Awaited<ReturnType<Keystore["setKey"]>> | null> {
  if (!encrypted || isOsProtectedSecret(encrypted)) return null;
  const plaintext = await keystore.getKey(account, encrypted);
  if (!plaintext) throw new Error("legacy secret could not be decrypted");
  const protectedSecret = await keystore.setKey(account, plaintext);
  if (!protectedSecret.storedInKeychain || !protectedSecret.encrypted) {
    throw new Error("OS-protected storage is unavailable");
  }
  return protectedSecret;
}

function countLegacySecrets(db: DB): number {
  const tables = ["providers", "provider_keys", "research_credentials"];
  return tables.reduce((total, table) => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM ${table}
         WHERE api_key_enc IS NOT NULL AND api_key_iv <> 'electron-safe-storage'`,
      )
      .get() as { count: number };
    return total + row.count;
  }, 0);
}

export async function migrateLegacyCredentials(options: {
  db: DB;
  keystore: Keystore;
  workspaceDir: string;
  logger?: MigrationLogger;
}): Promise<CredentialMigrationResult> {
  const { db, keystore, workspaceDir, logger } = options;
  let migrated = 0;
  let failed = 0;

  for (const provider of listProviderPersistenceRecords(db)) {
    try {
      const result = await migrateSecret(keystore, provider.id, provider.encrypted);
      if (result) {
        upsertProvider(db, {
          id: provider.id,
          label: provider.label,
          vendor: provider.vendor,
          baseUrl: provider.baseUrl,
          defaultModel: provider.defaultModel,
          tags: provider.tags,
          encrypted: result.encrypted ?? null,
          storedInKeychain: true,
        });
        migrated += 1;
      }
    } catch (error) {
      failed += 1;
      logger?.warn("Provider credential migration failed", { providerId: provider.id, error });
    }

    for (const key of listProviderKeyPersistenceRecords(db, provider.id)) {
      try {
        const result = await migrateSecret(keystore, key.id, key.encrypted);
        if (result) {
          updateProviderKey(db, {
            id: key.id,
            encrypted: result.encrypted ?? null,
            storedInKeychain: true,
          });
          migrated += 1;
        }
      } catch (error) {
        failed += 1;
        logger?.warn("Provider key migration failed", { keyId: key.id, error });
      }
    }
  }

  for (const credential of listResearchCredentialPersistenceRecords(db)) {
    try {
      const account = `research:${credential.provider}`;
      const result = await migrateSecret(keystore, account, credential.encrypted);
      if (result) {
        upsertResearchCredential(db, credential.provider, result.encrypted ?? null, true);
        migrated += 1;
      }
    } catch (error) {
      failed += 1;
      logger?.warn("Research credential migration failed", {
        provider: credential.provider,
        error,
      });
    }
  }

  let masterKeyRemoved = false;
  if (countLegacySecrets(db) === 0) {
    const masterFile = path.join(workspaceDir, "keystore.master");
    try {
      if (fs.existsSync(masterFile)) {
        fs.unlinkSync(masterFile);
        masterKeyRemoved = true;
      }
    } catch (error) {
      logger?.warn("Failed to remove unused legacy keystore master key", error);
    }
  }

  return { migrated, failed, masterKeyRemoved };
}
