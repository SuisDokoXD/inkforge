import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { DiagSnapshotInput, DiagSnapshotResponse } from "@inkforge/shared";
import { getAppSettings } from "@inkforge/storage";
import { getAppContext } from "./app-state";

const API_KEY_PATTERN = /(sk-[A-Za-z0-9\-_]{8,}|AIza[A-Za-z0-9\-_]{20,}|xai-[A-Za-z0-9\-_]{10,})/g;

function redactLine(line: string): string {
  return line.replace(API_KEY_PATTERN, "[redacted]");
}

function readTail(filePath: string, maxLines: number): string {
  try {
    if (!fs.existsSync(filePath)) return "(file not found)";
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const tail = lines.slice(-maxLines).map(redactLine).join("\n");
    return tail || "(empty)";
  } catch (err) {
    return `(read error: ${(err as Error).message})`;
  }
}

function detectKeystoreMode(workspace: string): string {
  const masterFile = path.join(workspace, "keystore.master");
  if (fs.existsSync(masterFile)) return "mixed or legacy workspace AES-GCM fallback";
  return "OS-protected storage (Electron safeStorage)";
}

interface SchemaMigrationRow {
  version: number;
  name: string;
  applied_at: string;
}

export async function buildDiagSnapshot(
  input?: DiagSnapshotInput,
): Promise<DiagSnapshotResponse> {
  const tailLines = Math.max(50, Math.min(input?.tailLines ?? 200, 500));
  const ctx = getAppContext();
  const lines: string[] = [];

  lines.push("# InkForge 诊断摘要");
  lines.push("");
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push(`- 应用版本：${app.getVersion()}`);
  lines.push(`- Electron：${process.versions.electron}`);
  lines.push(`- Node：${process.versions.node}`);
  lines.push(`- Chromium：${process.versions.chrome}`);
  lines.push(`- 平台：${process.platform} ${process.arch} / ${os.release()}`);
  lines.push(`- 工作目录：${ctx.workspaceDir}`);
  lines.push(`- Keystore 模式：${detectKeystoreMode(ctx.workspaceDir)}`);
  lines.push("");

  try {
    const rows = ctx.db
      .prepare(`SELECT version, name, applied_at FROM schema_migrations ORDER BY version`)
      .all() as SchemaMigrationRow[];
    lines.push("## 迁移");
    lines.push(
      rows.length
        ? rows.map((r) => `v${r.version} · ${r.name} · ${r.applied_at}`).join("\n")
        : "(无)",
    );
    lines.push("");
  } catch (err) {
    lines.push(`## 迁移读取失败：${(err as Error).message}`);
    lines.push("");
  }

  try {
    const s = getAppSettings(ctx.db);
    lines.push("## 设置（脱敏）");
    lines.push(
      `theme=${s.theme}  analysisEnabled=${s.analysisEnabled}  threshold=${s.analysisThreshold}  uiLang=${s.uiLanguage}  devMode=${s.devModeEnabled}  onboarded=${s.onboardingCompleted}`,
    );
    lines.push(`activeProviderId=${s.activeProviderId ?? "(none)"}`);
    lines.push("");
  } catch (err) {
    lines.push(`## 设置读取失败：${(err as Error).message}`);
    lines.push("");
  }

  const userData = app.getPath("userData");
  const mainLog = path.join(userData, "logs", "main.log");
  lines.push(`## 主进程日志（尾 ${tailLines} 行，已脱敏 API Key）`);
  lines.push("```");
  lines.push(readTail(mainLog, tailLines));
  lines.push("```");
  lines.push("");

  const rendererLog = path.join(userData, "logs", "renderer.log");
  lines.push(`## 渲染进程日志（尾 ${tailLines} 行）`);
  lines.push("```");
  lines.push(readTail(rendererLog, tailLines));
  lines.push("```");

  return {
    text: lines.join("\n"),
    generatedAt: new Date().toISOString(),
  };
}
