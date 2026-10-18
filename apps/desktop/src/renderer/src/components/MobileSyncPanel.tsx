import { useEffect, useState } from "react";
import { Copy, LoaderCircle, RefreshCw, Router, ShieldCheck, Smartphone } from "lucide-react";
import type { MobileSyncStatus } from "@inkforge/shared";
import { useT } from "../lib/i18n";
import { Button } from "./ui";

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MobileSyncPanel(): JSX.Element {
  const t = useT();
  const [status, setStatus] = useState<MobileSyncStatus | null>(null);
  const [busy, setBusy] = useState<string | null>("status");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const value = await window.inkforge.mobileSync.status();
        if (active) setStatus(value);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "读取同步状态失败");
      }
    };
    void refresh().finally(() => { if (active) setBusy(null); });
    const poll = window.setInterval(() => { if (active) void refresh(); }, 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, []);

  async function run(action: string, work: () => Promise<MobileSyncStatus>) {
    setBusy(action);
    setError("");
    setNotice("");
    try { setStatus(await work()); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : "同步服务操作失败");
      try { setStatus(await window.inkforge.mobileSync.status()); } catch { /* preserve the original action error */ }
    }
    finally { setBusy(null); }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t("settings.mobileSync.copied"));
      setError("");
    } catch {
      setError(t("settings.mobileSync.copyFailed"));
      setNotice("");
    }
  }

  async function changeAutoStart(enabled: boolean) {
    setBusy("autoStart");
    setError("");
    try {
      await window.inkforge.mobileSync.setAutoStart({ enabled });
      setStatus(current => current ? { ...current, autoStart: enabled } : current);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "设置保存失败");
    } finally { setBusy(null); }
  }

  async function revokeDevice(deviceId: string, name: string) {
    if (!window.confirm(t("settings.mobileSync.revokeConfirm", { name }))) return;
    await run(`revoke:${deviceId}`, () => window.inkforge.mobileSync.revokeDevice({ deviceId }));
  }

  const remaining = status?.pairingCodeExpiresAt ? status.pairingCodeExpiresAt - now : 0;
  const codeVisible = !!status?.pairingCode && remaining > 0;

  return <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-xs font-semibold uppercase text-ink-300">{t("settings.mobileSync.title")}</h3>
        <p className="mt-1 text-[11px] text-ink-500">{t("settings.mobileSync.description")}</p>
      </div>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${status?.running ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-ink-600 bg-ink-800 text-ink-400"}`}>
        <Router className="h-3 w-3" />
        {busy === "status" ? t("common.loading") : status?.running ? t("settings.mobileSync.running") : t("settings.mobileSync.stopped")}
      </span>
    </div>
    <p className="mb-3 text-[11px] leading-relaxed text-ink-400">{t("settings.mobileSync.scope")}</p>

    {status?.running && <div className="mb-3 space-y-2 rounded-md border border-ink-700 bg-ink-900/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase text-ink-500">{t("settings.mobileSync.endpoint")}</div>
          <code className="mt-1 block break-all text-xs text-accent-200">{status.endpoint}</code>
        </div>
        {status.endpoint && <Button type="button" variant="secondary" size="sm" className="bg-ink-800" onClick={() => void copy(status.endpoint!)}>
          <Copy className="mr-1 h-3 w-3" />{t("common.copy")}
        </Button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700 pt-2">
        <div>
          <div className="text-[10px] uppercase text-ink-500">{t("settings.mobileSync.code")}</div>
          {codeVisible
            ? <div className="mt-1 font-mono text-xl font-semibold tracking-[0.3em] text-ink-100">{status.pairingCode}</div>
            : <div className="mt-1 text-xs text-ink-500">{t("settings.mobileSync.codeUnavailable")}</div>}
          {codeVisible && <div className="mt-1 text-[10px] text-ink-500">{t("settings.mobileSync.expires", { time: formatRemaining(remaining) })}</div>}
        </div>
        <Button type="button" variant="secondary" size="sm" className="bg-ink-800" disabled={busy !== null} onClick={() => void run("refresh", () => window.inkforge.mobileSync.refreshPairingCode())}>
          {busy === "refresh" ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          {t("settings.mobileSync.refreshCode")}
        </Button>
      </div>
    </div>}

    <div className="flex flex-wrap items-center gap-2">
      {status?.running
        ? <Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => void run("stop", () => window.inkforge.mobileSync.stop())}>
            {busy === "stop" ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : <Router className="mr-1 h-3 w-3" />}
            {t("settings.mobileSync.stop")}
          </Button>
        : <Button type="button" variant="accentSoft" size="sm" disabled={busy !== null} onClick={() => void run("start", () => window.inkforge.mobileSync.start())}>
            {busy === "start" ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1 h-3 w-3" />}
            {t("settings.mobileSync.start")}
          </Button>}
      <label className="flex min-h-9 items-center gap-2 text-xs text-ink-300">
        <input type="checkbox" checked={status?.autoStart ?? false} disabled={!status || busy !== null} onChange={event => void changeAutoStart(event.target.checked)} />
        {t("settings.mobileSync.autoStart")}
      </label>
    </div>

    <div className="mt-3 border-t border-ink-700 pt-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-300"><Smartphone className="h-3.5 w-3.5" />{t("settings.mobileSync.devices")}</div>
      {!status?.devices.length
        ? <p className="text-[11px] text-ink-500">{t("settings.mobileSync.noDevices")}</p>
        : <ul className="space-y-2">
            {status.devices.map(device => <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-ink-900/70 px-2 py-2">
              <div className="min-w-0">
                <div className="truncate text-xs text-ink-200">{device.name}</div>
                <div className="text-[10px] text-ink-500">{t("settings.mobileSync.pairedAt", { time: new Date(device.pairedAt).toLocaleString() })}</div>
                <div className={`mt-0.5 text-[10px] ${device.lastSync ? "text-ink-400" : "text-ink-500"}`}>
                  {device.lastSync
                    ? t("settings.mobileSync.lastSync", {
                        time: new Date(device.lastSync.syncedAt).toLocaleString(),
                        projects: device.lastSync.projectCount,
                        chapters: device.lastSync.chapterCount,
                        conflicts: device.lastSync.conflictCount,
                      })
                    : t("settings.mobileSync.neverSynced")}
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-red-300 hover:bg-red-500/10" disabled={busy !== null} onClick={() => void revokeDevice(device.id, device.name)}>{t("settings.mobileSync.revoke")}</Button>
            </li>)}
          </ul>}
    </div>
    {(error || notice) && <p className={`mt-3 break-words text-[11px] ${error ? "text-red-300" : "text-emerald-300"}`} role={error ? "alert" : "status"}>{error || notice}</p>}
  </div>;
}
