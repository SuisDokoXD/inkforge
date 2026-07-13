import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createKeystore,
  getProviderKeyPersistenceRecord,
  getProviderPersistenceRecord,
  getResearchCredentialEncrypted,
  insertProviderKey,
  openDatabase,
  runMigrations,
  upsertProvider,
  upsertResearchCredential,
} from "@inkforge/storage";
import { migrateLegacyCredentials } from "../credential-migration-service";

describe("credential migration", () => {
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  it("migrates every legacy credential class and removes the unused master key", async () => {
    workspace = mkdtempSync(join(tmpdir(), "inkforge-credential-migration-"));
    const db = openDatabase({ workspaceDir: workspace });
    runMigrations(db);
    const legacy = createKeystore(workspace);

    const providerSecret = await legacy.setKey("provider-1", "provider-secret");
    upsertProvider(db, {
      id: "provider-1",
      label: "Provider",
      vendor: "openai",
      baseUrl: "https://example.test",
      defaultModel: "model",
      tags: [],
      encrypted: providerSecret.encrypted ?? null,
      storedInKeychain: false,
    });

    const keySecret = await legacy.setKey("key-1", "rotating-secret");
    insertProviderKey(db, {
      id: "key-1",
      providerId: "provider-1",
      label: "Primary",
      encrypted: keySecret.encrypted ?? null,
      storedInKeychain: false,
    });

    const researchSecret = await legacy.setKey("research:tavily", "research-secret");
    upsertResearchCredential(db, "tavily", researchSecret.encrypted ?? null, false);

    const protectedKeystore = createKeystore(workspace, {
      isAvailable: () => true,
      encrypt: (plaintext) => Buffer.from(`protected:${plaintext}`, "utf8"),
      decrypt: (ciphertext) => ciphertext.toString("utf8").replace(/^protected:/, ""),
    });
    const result = await migrateLegacyCredentials({
      db,
      keystore: protectedKeystore,
      workspaceDir: workspace,
    });

    expect(result).toEqual({ migrated: 3, failed: 0, masterKeyRemoved: true });
    expect(getProviderPersistenceRecord(db, "provider-1")?.encrypted?.iv).toBe(
      "electron-safe-storage",
    );
    expect(getProviderKeyPersistenceRecord(db, "key-1")?.encrypted?.iv).toBe(
      "electron-safe-storage",
    );
    expect(getResearchCredentialEncrypted(db, "tavily")?.iv).toBe(
      "electron-safe-storage",
    );
    expect(existsSync(join(workspace, "keystore.master"))).toBe(false);
    db.close();
  });
});
