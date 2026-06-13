import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getProviderKeyPersistenceRecord,
  getProviderPersistenceRecord,
  listProviderKeys,
  openDatabase,
  runMigrations,
  upsertProvider,
  type DB,
  type Keystore,
} from "@inkforge/storage";
import {
  deleteProviderKeyWithSecret,
  upsertProviderKeyWithSecret,
} from "../provider-key-service";

type SetKeyCall = { id: string; apiKey: string };

function createMockKeystore(options: { failDelete?: boolean } = {}): {
  keystore: Keystore;
  calls: { setKey: SetKeyCall[]; deleteKey: string[] };
} {
  const calls: { setKey: SetKeyCall[]; deleteKey: string[] } = {
    setKey: [],
    deleteKey: [],
  };

  const keystore: Keystore = {
    async setKey(id, apiKey) {
      calls.setKey.push({ id, apiKey });
      return {
        storedInKeychain: false,
        encrypted: {
          ciphertext: `enc:${apiKey}`,
          iv: `iv:${id}`,
          tag: "tag",
        },
      };
    },
    async getKey() {
      return null;
    },
    async deleteKey(id) {
      calls.deleteKey.push(id);
      if (options.failDelete) throw new Error("keychain unavailable");
    },
  };

  return { keystore, calls };
}

function seedProvider(db: DB): void {
  upsertProvider(db, {
    id: "provider-1",
    label: "Provider",
    vendor: "openai",
    baseUrl: "https://example.test/v1",
    defaultModel: "model-a",
    tags: [],
    encrypted: null,
    storedInKeychain: false,
  });
}

describe("provider key service", () => {
  let workspaceDir: string;
  let db: DB;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "inkforge-provider-key-"));
    db = openDatabase({ workspaceDir });
    runMigrations(db);
    seedProvider(db);
  });

  afterEach(() => {
    db.close();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("creates a key with an encrypted fallback and returns only the public record", async () => {
    const { keystore, calls } = createMockKeystore();
    const created = await upsertProviderKeyWithSecret(
      { db, keystore },
      {
        providerId: "provider-1",
        label: "Primary",
        apiKey: "sk-create",
        weight: 2,
        disabled: false,
      },
    );

    expect(created).toMatchObject({
      providerId: "provider-1",
      label: "Primary",
      weight: 2,
      disabled: false,
      storedInKeychain: false,
    });
    expect(created).not.toHaveProperty("encrypted");
    expect(calls.setKey).toEqual([{ id: created.id, apiKey: "sk-create" }]);

    const persisted = getProviderKeyPersistenceRecord(db, created.id);
    expect(persisted?.encrypted).toEqual({
      ciphertext: "enc:sk-create",
      iv: `iv:${created.id}`,
      tag: "tag",
    });
    expect(listProviderKeys(db, "provider-1")[0]).not.toHaveProperty("encrypted");
  });

  it("updates metadata without rotating the secret when apiKey is omitted", async () => {
    const { keystore, calls } = createMockKeystore();
    const created = await upsertProviderKeyWithSecret(
      { db, keystore },
      {
        providerId: "provider-1",
        label: "Primary",
        apiKey: "sk-original",
      },
    );

    const updated = await upsertProviderKeyWithSecret(
      { db, keystore },
      {
        providerId: "provider-1",
        id: created.id,
        label: "Renamed",
        weight: 4,
        disabled: true,
      },
    );

    expect(updated).toMatchObject({
      id: created.id,
      label: "Renamed",
      weight: 4,
      disabled: true,
    });
    expect(calls.setKey).toEqual([{ id: created.id, apiKey: "sk-original" }]);
    expect(getProviderKeyPersistenceRecord(db, created.id)?.encrypted).toEqual({
      ciphertext: "enc:sk-original",
      iv: `iv:${created.id}`,
      tag: "tag",
    });
  });

  it("rotates the existing secret when apiKey is supplied for an update", async () => {
    const { keystore, calls } = createMockKeystore();
    const created = await upsertProviderKeyWithSecret(
      { db, keystore },
      {
        providerId: "provider-1",
        label: "Primary",
        apiKey: "sk-original",
      },
    );

    await upsertProviderKeyWithSecret(
      { db, keystore },
      {
        providerId: "provider-1",
        id: created.id,
        label: "Primary",
        apiKey: "sk-rotated",
      },
    );

    expect(calls.setKey).toEqual([
      { id: created.id, apiKey: "sk-original" },
      { id: created.id, apiKey: "sk-rotated" },
    ]);
    expect(getProviderKeyPersistenceRecord(db, created.id)?.encrypted).toEqual({
      ciphertext: "enc:sk-rotated",
      iv: `iv:${created.id}`,
      tag: "tag",
    });
  });

  it("updates provider key strategy and cooldown beside key upserts", async () => {
    const { keystore } = createMockKeystore();

    await upsertProviderKeyWithSecret(
      { db, keystore },
      {
        providerId: "provider-1",
        label: "Primary",
        apiKey: "sk-create",
        strategy: "weighted",
        cooldownMs: 1234.4,
      },
    );

    expect(getProviderPersistenceRecord(db, "provider-1")).toMatchObject({
      keyStrategy: "weighted",
      cooldownMs: 1234,
    });
  });

  it("keeps deleting the DB row when keychain cleanup fails", async () => {
    const { keystore, calls } = createMockKeystore({ failDelete: true });
    const created = await upsertProviderKeyWithSecret(
      { db, keystore },
      {
        providerId: "provider-1",
        label: "Primary",
        apiKey: "sk-delete",
      },
    );

    await expect(deleteProviderKeyWithSecret({ db, keystore }, created.id)).resolves.toEqual({
      id: created.id,
    });

    expect(calls.deleteKey).toEqual([created.id]);
    expect(getProviderKeyPersistenceRecord(db, created.id)).toBeNull();
    expect(listProviderKeys(db, "provider-1")).toEqual([]);
  });

  it("rejects creating a new key without a secret", async () => {
    const { keystore } = createMockKeystore();

    await expect(
      upsertProviderKeyWithSecret(
        { db, keystore },
        {
          providerId: "provider-1",
          label: "Primary",
        },
      ),
    ).rejects.toThrow("provider-key:upsert requires apiKey when creating a new key");
  });
});
