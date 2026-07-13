import * as crypto from "crypto";
import * as fs from "fs";
import { createRequire } from "module";
import * as path from "path";

const SERVICE = "inkforge";
const MASTER_FILE = "keystore.master";

type KeytarModule = {
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  getPassword: (service: string, account: string) => Promise<string | null>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

let keytarPromise: Promise<KeytarModule | null> | null = null;
const optionalRequire = createRequire(__filename);

function loadKeytar(): Promise<KeytarModule | null> {
  if (keytarPromise) return keytarPromise;
  keytarPromise = (async () => {
    try {
      // Optional require so typecheck does not fail when keytar is absent.
      // Also tolerates native-module load failure on systems without a keychain.
      const mod = optionalRequire("keytar") as KeytarModule & { default?: KeytarModule };
      return mod.default ?? mod;
    } catch {
      return null;
    }
  })();
  return keytarPromise;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

function getMasterKey(workspaceDir: string): Buffer {
  const filePath = path.join(workspaceDir, MASTER_FILE);
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    if (data.length === 32) return data;
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(filePath, key, { mode: 0o600 });
  return key;
}

export function encryptSecret(plaintext: string, workspaceDir: string): EncryptedSecret {
  const key = getMasterKey(workspaceDir);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret, workspaceDir: string): string {
  const key = getMasterKey(workspaceDir);
  const iv = Buffer.from(secret.iv, "base64");
  const tag = Buffer.from(secret.tag, "base64");
  const ciphertext = Buffer.from(secret.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf-8");
}

export interface Keystore {
  setKey(providerId: string, apiKey: string): Promise<{ storedInKeychain: boolean; encrypted?: EncryptedSecret }>;
  getKey(providerId: string, fallback?: EncryptedSecret | null): Promise<string | null>;
  deleteKey(providerId: string, fallback?: EncryptedSecret | null): Promise<void>;
}

export interface OsSecretProtector {
  isAvailable(): boolean;
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}

export const OS_PROTECTED_IV = "electron-safe-storage";

export function isOsProtectedSecret(secret: EncryptedSecret | null | undefined): boolean {
  return secret?.iv === OS_PROTECTED_IV;
}

export function createKeystore(
  workspaceDir: string,
  osProtector?: OsSecretProtector,
): Keystore {
  return {
    async setKey(providerId, apiKey) {
      if (osProtector?.isAvailable()) {
        try {
          return {
            storedInKeychain: true,
            encrypted: {
              ciphertext: osProtector.encrypt(apiKey).toString("base64"),
              iv: OS_PROTECTED_IV,
              tag: OS_PROTECTED_IV,
            },
          };
        } catch {
          // Fall through to legacy keytar or workspace encryption.
        }
      }
      const keytar = await loadKeytar();
      if (keytar) {
        try {
          await keytar.setPassword(SERVICE, providerId, apiKey);
          return { storedInKeychain: true };
        } catch {
          // fall through to encryption
        }
      }
      const encrypted = encryptSecret(apiKey, workspaceDir);
      return { storedInKeychain: false, encrypted };
    },
    async getKey(providerId, fallback) {
      if (fallback && isOsProtectedSecret(fallback) && osProtector?.isAvailable()) {
        try {
          return osProtector.decrypt(Buffer.from(fallback.ciphertext, "base64"));
        } catch {
          return null;
        }
      }
      const keytar = await loadKeytar();
      if (keytar) {
        try {
          const value = await keytar.getPassword(SERVICE, providerId);
          if (value) return value;
        } catch {
          // fall through
        }
      }
      if (fallback) {
        try {
          return decryptSecret(fallback, workspaceDir);
        } catch {
          return null;
        }
      }
      return null;
    },
    async deleteKey(providerId) {
      const keytar = await loadKeytar();
      if (keytar) {
        try {
          await keytar.deletePassword(SERVICE, providerId);
        } catch {
          // ignore
        }
      }
    },
  };
}
