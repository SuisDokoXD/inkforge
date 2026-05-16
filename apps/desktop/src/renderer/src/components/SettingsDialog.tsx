import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AppSettings, Lang } from "@inkforge/shared";
import { getAnalysisThreshold } from "@inkforge/shared";
import { settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
import { SceneRoutingPanel } from "./SceneRoutingPanel";
import { SampleLibPanel } from "./SampleLibPanel";

export function SettingsDialog(): JSX.Element | null {
  const open = useAppStore((s) => s.settingsPanelOpen);
  const setOpen = useAppStore((s) => s.openSettings);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const t = useT();

  const [threshold, setThreshold] = useState<number>(settings.analysisThreshold);

  useEffect(() => {
    setThreshold(settings.analysisThreshold);
  }, [settings.analysisThreshold]);

  // M9 Phase 5: Esc to close + a11y improvements.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const settingsMutation = useMutation({
    mutationFn: (updates: Partial<AppSettings>) => settingsApi.set({ updates }),
    onSuccess: (next) => setSettings(next),
  });

  const handleLanguageChange = (lang: Lang) => {
    // Auto-retune threshold to the language default unless the user has
    // customised it recently (detected by non-default numeric value).
    const nextDefault = getAnalysisThreshold(lang);
    const currentIsDefault =
      settings.analysisThreshold === getAnalysisThreshold(settings.uiLanguage);
    const updates: Partial<AppSettings> = { uiLanguage: lang };
    if (currentIsDefault && settings.analysisThreshold !== nextDefault) {
      updates.analysisThreshold = nextDefault;
    }
    settingsMutation.mutate(updates);
  };

  const handleCopyDiag = async () => {
    try {
      const res = await window.inkforge.diag.snapshot({});
      await navigator.clipboard.writeText(res.text);
      alert(t("common.copy") + " ✓");
    } catch (err) {
      alert(t("error.generic") + ": " + String(err));
    }
  };

  const [diagText, setDiagText] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const handleShowDiag = async () => {
    setDiagLoading(true);
    try {
      const r = await window.inkforge.diag.snapshot({});
      setDiagText(r.text);
    } catch (err) {
      setDiagText(t("error.generic") + ": " + String(err));
    } finally {
      setDiagLoading(false);
    }
  };

  const handleReplayOnboarding = () => {
    // M9 Phase 1.3: 初始化完成后的用户也能重走 5 步向导。
    settingsMutation.mutate({ onboardingCompleted: false });
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8" role="dialog" aria-modal="true" aria-label={t("settings.title")} onClick={() => setOpen(false)}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-ink-600 bg-ink-800 p-6 text-ink-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("settings.title")}</h2>
          <button
            className="rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700"
            onClick={() => setOpen(false)}
            title={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto pr-1 text-sm">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.writing")}
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.analysisEnabled}
                  onChange={(e) => settingsMutation.mutate({ analysisEnabled: e.target.checked })}
                />
                <span>{t("settings.analysisEnabled")}</span>
              </label>
              <label className="flex items-center gap-3">
                <span className="text-ink-300">{t("settings.analysisThreshold")}</span>
                <input
                  type="number"
                  min={50}
                  step={50}
                  className="w-24 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value) || settings.analysisThreshold)}
                  onBlur={() => {
                    if (threshold !== settings.analysisThreshold) {
                      settingsMutation.mutate({ analysisThreshold: threshold });
                    }
                  }}
                />
                <span className="text-xs text-ink-500">
                  {t("settings.analysisThresholdHint", { n: threshold })}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <span className="text-ink-300">{t("settings.uiLanguage")}</span>
                <select
                  className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none"
                  value={settings.uiLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value as Lang)}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                </select>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.appearance")}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-ink-300">{t("settings.theme")}</span>
              <div className="flex overflow-hidden rounded-md border border-ink-600">
                <button
                  className={`px-3 py-1 text-xs ${
                    settings.theme === "dark" ? "bg-amber-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"
                  }`}
                  onClick={() => settingsMutation.mutate({ theme: "dark" })}
                >
                  {t("settings.theme.dark")}
                </button>
                <button
                  className={`px-3 py-1 text-xs ${
                    settings.theme === "light" ? "bg-amber-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"
                  }`}
                  onClick={() => settingsMutation.mutate({ theme: "light" })}
                >
                  {t("settings.theme.light")}
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              编辑器
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-ink-300">字体大小</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={14}
                    max={24}
                    step={1}
                    value={settings.editorFontSize}
                    onChange={(e) => settingsMutation.mutate({ editorFontSize: Number(e.target.value) })}
                    className="w-24"
                  />
                  <span className="w-8 text-xs text-ink-400">{settings.editorFontSize}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300">行高</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1.5}
                    max={3.0}
                    step={0.1}
                    value={settings.editorLineHeight}
                    onChange={(e) => settingsMutation.mutate({ editorLineHeight: Number(e.target.value) })}
                    className="w-24"
                  />
                  <span className="w-8 text-xs text-ink-400">{settings.editorLineHeight.toFixed(1)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300">编辑区宽度</span>
                <div className="flex overflow-hidden rounded-md border border-ink-600">
                  {(["narrow", "medium", "wide"] as const).map((w) => (
                    <button
                      key={w}
                      className={`px-3 py-1 text-xs ${settings.editorWidth === w ? "bg-amber-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"}`}
                      onClick={() => settingsMutation.mutate({ editorWidth: w })}
                    >
                      {w === "narrow" ? "窄" : w === "medium" ? "中" : "宽"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.autoIndent}
                  onChange={(e) => settingsMutation.mutate({ autoIndent: e.target.checked })}
                />
                <span className="text-ink-300">回车自动缩进两格</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.typewriterMode}
                  onChange={(e) => settingsMutation.mutate({ typewriterMode: e.target.checked })}
                />
                <span className="text-ink-300">打字机模式（光标行居中）</span>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              AI 路由
            </h3>
            <SceneRoutingPanel />
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              参考小说库 (RAG)
            </h3>
            <SampleLibPanel />
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.advanced")}
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.devModeEnabled}
                  onChange={(e) => settingsMutation.mutate({ devModeEnabled: e.target.checked })}
                />
                <div>
                  <div className="font-medium">{t("settings.devMode")}</div>
                  <div className="text-xs text-ink-400">{t("settings.devModeHint")}</div>
                </div>
              </label>
              {/* M9 Phase 6: 诊断面板 */}
              <div className="rounded-md border border-ink-700 bg-ink-900/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-300">{t("settings.diag.title")}</span>
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-[11px] text-ink-400 hover:bg-ink-700 hover:text-ink-200 disabled:opacity-50"
                    onClick={handleShowDiag}
                    disabled={diagLoading}
                  >
                    {diagLoading ? t("common.loading") : (diagText ? t("settings.diag.refresh") : t("settings.diag.show"))}
                  </button>
                </div>
                {diagText ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-ink-900 p-2 text-[11px] leading-relaxed text-ink-300">
                    {diagText}
                  </pre>
                ) : (
                  <p className="text-[11px] text-ink-500">{t("settings.diag.hint")}</p>
                )}
              </div>
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20"
                  onClick={handleReplayOnboarding}
                  title={t("settings.replayOnboarding.hint")}
                >
                  {t("settings.replayOnboarding")}
                </button>
                <button
                  className="rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700 hover:text-ink-100"
                  onClick={handleCopyDiag}
                >
                  {t("error.boundary.copyDiag")}
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
