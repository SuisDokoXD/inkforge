import { randomUUID } from "crypto";
import {
  deleteProviderKey as deleteProviderKeyRecord,
  getProviderKeyPersistenceRecord,
  insertProviderKey,
  updateProviderKey,
  updateProviderKeyStrategy,
  type DB,
  type Keystore,
} from "@inkforge/storage";
import type { ProviderKeyRecord, ProviderKeyUpsertInput } from "@inkforge/shared";

export interface ProviderKeyServiceContext {
  db: DB;
  keystore: Keystore;
}

export async function upsertProviderKeyWithSecret(
  ctx: ProviderKeyServiceContext,
  input: ProviderKeyUpsertInput,
): Promise<ProviderKeyRecord> {
  if (input.strategy || typeof input.cooldownMs === "number") {
    updateProviderKeyStrategy(ctx.db, {
      id: input.providerId,
      keyStrategy: input.strategy,
      cooldownMs: input.cooldownMs,
    });
  }

  const id = input.id ?? randomUUID();
  const existing = input.id
    ? getProviderKeyPersistenceRecord(ctx.db, input.id)
    : null;

  if (input.apiKey && input.apiKey.trim().length > 0) {
    const keyResult = await ctx.keystore.setKey(id, input.apiKey);
    if (existing) {
      return updateProviderKey(ctx.db, {
        id: existing.id,
        label: input.label,
        encrypted: keyResult.encrypted ?? null,
        storedInKeychain: keyResult.storedInKeychain,
        weight: input.weight,
        disabled: input.disabled,
      });
    }
    return insertProviderKey(ctx.db, {
      id,
      providerId: input.providerId,
      label: input.label,
      encrypted: keyResult.encrypted ?? null,
      storedInKeychain: keyResult.storedInKeychain,
      weight: input.weight,
      disabled: input.disabled,
    });
  }

  if (existing) {
    return updateProviderKey(ctx.db, {
      id: existing.id,
      label: input.label,
      weight: input.weight,
      disabled: input.disabled,
    });
  }
  throw new Error("provider-key:upsert requires apiKey when creating a new key");
}

export async function deleteProviderKeyWithSecret(
  ctx: ProviderKeyServiceContext,
  id: string,
): Promise<{ id: string }> {
  try {
    await ctx.keystore.deleteKey(id);
  } catch {
    /* best effort: DB cleanup should still proceed */
  }
  deleteProviderKeyRecord(ctx.db, id);
  return { id };
}
