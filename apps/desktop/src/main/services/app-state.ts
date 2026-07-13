import { app, safeStorage } from "electron";
import * as path from "path";
import * as fs from "fs";
import {
  openDatabase,
  runMigrations,
  createKeystore,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
  type DB,
  type Keystore,
  type WorkspaceConfig,
} from "@inkforge/storage";
import { logger } from "./logger";

export interface AppContext {
  userDataDir: string;
  workspaceDir: string;
  config: WorkspaceConfig;
  db: DB;
  keystore: Keystore;
}

let context: AppContext | null = null;

function resolveWorkspaceDir(userDataDir: string, config: WorkspaceConfig): string {
  if (config.workspaceDir) return config.workspaceDir;
  const fallback = path.join(userDataDir, "workspace");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function getAppContext(): AppContext {
  if (context) return context;
  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  const config = loadWorkspaceConfig(userDataDir);
  const workspaceDir = resolveWorkspaceDir(userDataDir, config);
  if (!config.workspaceDir) {
    config.workspaceDir = workspaceDir;
    saveWorkspaceConfig(userDataDir, config);
  }
  const db = openDatabase({ workspaceDir });
  const applied = runMigrations(db);
  if (applied > 0) logger.info(`Applied ${applied} database migration(s).`);
  const keystore = createKeystore(workspaceDir, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plaintext) => safeStorage.encryptString(plaintext),
    decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
  });
  context = { userDataDir, workspaceDir, config, db, keystore };
  return context;
}

export function updateWorkspaceConfig(partial: Partial<WorkspaceConfig>): WorkspaceConfig {
  const ctx = getAppContext();
  ctx.config = { ...ctx.config, ...partial };
  saveWorkspaceConfig(ctx.userDataDir, ctx.config);
  return ctx.config;
}

export function disposeAppContext(): void {
  if (!context) return;
  try {
    context.db.close();
  } catch (error) {
    logger.warn("Failed to close database", error);
  }
  context = null;
}
