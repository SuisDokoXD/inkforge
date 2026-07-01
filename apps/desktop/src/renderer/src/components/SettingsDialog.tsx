import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AppSettings, Lang } from "@inkforge/shared";
import { getAnalysisThreshold } from "@inkforge/shared";
import { X } from "lucide-react";
import { settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
import { friendlyErrorMessage } from "../lib/friendly-error";
import {
  fadeOnly,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../lib/motion-tokens";
import { SceneRoutingPanel } from "./SceneRoutingPanel";
import { SampleLibPanel } from "./SampleLibPanel";
import { AnimatedDialog } from "./AnimatedDialog";
import { useTimedStatus } from "../lib/use-timed-status";
import { Button, IconButton, Select, TextField } from "./ui";

type CopyDiagStatus = {
  kind: "success" | "error";
  message: string;
};

export function SettingsDialog(): JSX.Element | null {
  const open = useAppStore((s) => s.settingsPanelOpen);
  const setOpen = useAppStore((s) => s.openSettings);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const patchSettings = useAppStore((s) => s.patchSettings);
  const t = useT();
  const reduceMotion = useReducedMotion() === true;

  const [threshold, setThreshold] = useState<number>(settings.analysisThreshold);
  // C9: 自定强调色草稿（本地 state，失焦/回车时提交）
  const [customAccentDraft, setCustomAccentDraft] = useState<string>(
    settings.customAccent ?? "#007AFF",
  );
  useEffect(() => {
    setCustomAccentDraft(settings.customAccent ?? "#007AFF");
  }, [settings.customAccent]);

  const [editorFontSizeDraft, setEditorFontSizeDraft] = useState<number>(
    settings.editorFontSize,
  );
  const [editorLineHeightDraft, setEditorLineHeightDraft] = useState<number>(
    settings.editorLineHeight,
  );

  useEffect(() => {
    setThreshold(settings.analysisThreshold);
  }, [settings.analysisThreshold]);

  useEffect(() => {
    setEditorFontSizeDraft(settings.editorFontSize);
  }, [settings.editorFontSize]);

  useEffect(() => {
    setEditorLineHeightDraft(settings.editorLineHeight);
  }, [settings.editorLineHeight]);

  // M9 Phase 5: Esc 关闭 + 遮罩点击关闭统一由 AnimatedDialog 处理。

  const settingsMutation = useMutation({
    mutationFn: (updates: Partial<AppSettings>) => settingsApi.set({ updates }),
    onMutate: (updates) => {
      const previous = useAppStore.getState().settings;
      patchSettings(updates);
      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) setSettings(context.previous);
    },
    onSuccess: (next) => setSettings(next),
  });
  const sectionMotion = reduceMotion ? fadeOnly : staggerItem;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };
  const settingsStatus = settingsMutation.isPending
    ? "正在保存设置…"
    : settingsMutation.isError
      ? friendlyErrorMessage(settingsMutation.error, "设置暂时无法保存，请稍后重试。")
      : "设置会自动保存";
  const settingsStatusTone = settingsMutation.isError ? "text-red-300" : "text-ink-500";
  const { status: copyDiagStatus, showStatus: showCopyDiagStatus } =
    useTimedStatus<CopyDiagStatus>();

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

  const commitEditorFontSize = (value = editorFontSizeDraft) => {
    if (value !== settings.editorFontSize) {
      settingsMutation.mutate({ editorFontSize: value });
    }
  };

  const commitEditorLineHeight = (value = editorLineHeightDraft) => {
    if (value !== settings.editorLineHeight) {
      settingsMutation.mutate({ editorLineHeight: value });
    }
  };

  const handleCopyDiag = async () => {
    showCopyDiagStatus(null);
    try {
      const res = await window.inkforge.diag.snapshot({});
      await navigator.clipboard.writeText(res.text);
      showCopyDiagStatus({ kind: "success", message: "排查信息已复制" }, 2200);
    } catch (err) {
      showCopyDiagStatus({
        kind: "error",
        message: friendlyErrorMessage(err, "复制排查信息失败，请稍后重试。"),
      });
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
      setDiagText(friendlyErrorMessage(err, "读取排查信息失败，请稍后重试。"));
    } finally {
      setDiagLoading(false);
    }
  };

  const handleReplayOnboarding = () => {
    // M9 Phase 1.3: 初始化完成后的用户也能重走 5 步向导。
    settingsMutation.mutate({ onboardingCompleted: false });
    setOpen(false);
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel={t("settings.title")}
      overlayClassName="flex items-center justify-center p-8"
      panelClassName="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-ink-700 bg-ink-900 p-6 text-ink-100 shadow-2xl"
      zClassName="z-40"
    >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{t("settings.title")}</h2>
            <AnimatePresence initial={false} mode="wait">
              <motion.p
                key={settingsStatus}
                className={`mt-1 text-[11px] ${settingsStatusTone}`}
                aria-live="polite"
                role={settingsMutation.isError ? "alert" : "status"}
                variants={reduceMotion ? fadeOnly : staggerItem}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {settingsStatus}
              </motion.p>
            </AnimatePresence>
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            className="text-ink-300 hover:bg-ink-700/60 hover:text-ink-100"
            onClick={() => setOpen(false)}
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <motion.div
          className="space-y-6 overflow-y-auto pr-1 text-sm scrollbar-thin"
          variants={reduceMotion ? fadeOnly : staggerContainer}
          initial="initial"
          animate="animate"
        >
          <motion.section variants={sectionMotion}>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.writing")}
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3" htmlFor="settings-analysis-enabled">
                <input
                  id="settings-analysis-enabled"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.analysisEnabled}
                  onChange={(e) => settingsMutation.mutate({ analysisEnabled: e.target.checked })}
                />
                <span>{t("settings.analysisEnabled")}</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-ink-300" htmlFor="settings-analysis-threshold">
                  {t("settings.analysisThreshold")}
                </label>
                <TextField
                  id="settings-analysis-threshold"
                  type="number"
                  min={50}
                  step={50}
                  aria-describedby="settings-analysis-threshold-hint"
                  className="w-24 bg-ink-900"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value) || settings.analysisThreshold)}
                  onBlur={() => {
                    if (threshold !== settings.analysisThreshold) {
                      settingsMutation.mutate({ analysisThreshold: threshold });
                    }
                  }}
                />
                <span id="settings-analysis-threshold-hint" className="text-xs text-ink-500">
                  {t("settings.analysisThresholdHint", { n: threshold })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-ink-300" htmlFor="settings-ui-language">
                  {t("settings.uiLanguage")}
                </label>
                <Select
                  id="settings-ui-language"
                  className="w-auto bg-ink-900"
                  value={settings.uiLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value as Lang)}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                </Select>
              </div>
            </div>
          </motion.section>

          <motion.section variants={sectionMotion}>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.appearance")}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-ink-300">{t("settings.theme")}</span>
              <div className="flex overflow-hidden rounded-lg border border-ink-600 bg-ink-900 p-0.5" role="group" aria-label={t("settings.theme")}>
                {([
                  ["light", t("settings.theme.light")],
                  ["paper", t("settings.theme.paper")],
                  ["sepia", t("settings.theme.sepia")],
                  ["mint", t("settings.theme.mint")],
                  ["dark", t("settings.theme.dark")],
                ] as const).map(([theme, label]) => (
                  <motion.button
                    key={theme}
                    type="button"
                    className={`rounded-md px-3 py-1 text-xs ${
                      settings.theme === theme ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-700/60"
                    }`}
                    onClick={() => settingsMutation.mutate({ theme })}
                    aria-pressed={settings.theme === theme}
                    {...buttonMotion}
                  >
                    {label}
                  </motion.button>
                ))}
              </div>
            </div>
            {/* C9: 自定强调色 */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-300">强调色</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="自定强调色"
                  value={customAccentDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomAccentDraft(v);
                    settingsMutation.mutate({ customAccent: v });
                  }}
                  className="h-7 w-8 cursor-pointer rounded border border-ink-600 bg-ink-900 p-0"
                />
                <input
                  type="text"
                  aria-label="强调色十六进制"
                  value={customAccentDraft}
                  onChange={(e) => setCustomAccentDraft(e.target.value)}
                  onBlur={() => {
                    if (/^#[0-9a-fA-F]{6}$/.test(customAccentDraft)) {
                      settingsMutation.mutate({ customAccent: customAccentDraft });
                    } else {
                      setCustomAccentDraft(settings.customAccent ?? "#007AFF");
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="h-7 w-20 rounded border border-ink-600 bg-ink-900 px-2 text-xs text-ink-100"
                  placeholder="#007AFF"
                />
                {settings.customAccent ? (
                  <motion.button
                    type="button"
                    className="rounded px-2 py-0.5 text-[10px] text-ink-500 hover:text-ink-300"
                    onClick={() => settingsMutation.mutate({ customAccent: null })}
                    {...buttonMotion}
                  >
                    重置
                  </motion.button>
                ) : null}
              </div>
            </div>
          </motion.section>

          <motion.section variants={sectionMotion}>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              编辑器
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-ink-300" htmlFor="settings-editor-font-size">
                  字体大小
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="settings-editor-font-size"
                    type="range"
                    min={14}
                    max={24}
                    step={1}
                    value={editorFontSizeDraft}
                    onChange={(e) => setEditorFontSizeDraft(Number(e.target.value))}
                    onBlur={(e) => commitEditorFontSize(Number(e.currentTarget.value))}
                    onPointerUp={(e) => commitEditorFontSize(Number(e.currentTarget.value))}
                    onKeyUp={(e) => {
                      if (
                        e.key === "ArrowLeft" ||
                        e.key === "ArrowRight" ||
                        e.key === "ArrowUp" ||
                        e.key === "ArrowDown" ||
                        e.key === "Home" ||
                        e.key === "End" ||
                        e.key === "PageUp" ||
                        e.key === "PageDown"
                      ) {
                        commitEditorFontSize(Number(e.currentTarget.value));
                      }
                    }}
                    className="w-24"
                  />
                  <output className="w-8 text-xs text-ink-400" htmlFor="settings-editor-font-size">
                    {editorFontSizeDraft}
                  </output>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-ink-300" htmlFor="settings-editor-line-height">
                  行高
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="settings-editor-line-height"
                    type="range"
                    min={1.5}
                    max={3.0}
                    step={0.1}
                    value={editorLineHeightDraft}
                    onChange={(e) => setEditorLineHeightDraft(Number(e.target.value))}
                    onBlur={(e) => commitEditorLineHeight(Number(e.currentTarget.value))}
                    onPointerUp={(e) => commitEditorLineHeight(Number(e.currentTarget.value))}
                    onKeyUp={(e) => {
                      if (
                        e.key === "ArrowLeft" ||
                        e.key === "ArrowRight" ||
                        e.key === "ArrowUp" ||
                        e.key === "ArrowDown" ||
                        e.key === "Home" ||
                        e.key === "End" ||
                        e.key === "PageUp" ||
                        e.key === "PageDown"
                      ) {
                        commitEditorLineHeight(Number(e.currentTarget.value));
                      }
                    }}
                    className="w-24"
                  />
                  <output className="w-8 text-xs text-ink-400" htmlFor="settings-editor-line-height">
                    {editorLineHeightDraft.toFixed(1)}
                  </output>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300">编辑区宽度</span>
                <div className="flex overflow-hidden rounded-lg border border-ink-600 bg-ink-900 p-0.5" role="group" aria-label="编辑区宽度">
                  {(["narrow", "medium", "wide"] as const).map((w) => (
                    <motion.button
                      key={w}
                      type="button"
                      className={`rounded-md px-3 py-1 text-xs ${settings.editorWidth === w ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-700/60"}`}
                      onClick={() => settingsMutation.mutate({ editorWidth: w })}
                      aria-pressed={settings.editorWidth === w}
                      {...buttonMotion}
                    >
                      {w === "narrow" ? "窄" : w === "medium" ? "中" : "宽"}
                    </motion.button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3" htmlFor="settings-auto-indent">
                <input
                  id="settings-auto-indent"
                  type="checkbox"
                  checked={settings.autoIndent}
                  onChange={(e) => settingsMutation.mutate({ autoIndent: e.target.checked })}
                />
                <span className="text-ink-300">回车自动缩进两格</span>
              </label>
              <label className="flex items-center gap-3" htmlFor="settings-spellcheck">
                <input
                  id="settings-spellcheck"
                  type="checkbox"
                  checked={settings.spellcheck}
                  onChange={(e) => settingsMutation.mutate({ spellcheck: e.target.checked })}
                />
                <span className="text-ink-300">启用系统拼写检查</span>
              </label>
              <label className="flex items-center gap-3" htmlFor="settings-typewriter-mode">
                <input
                  id="settings-typewriter-mode"
                  type="checkbox"
                  checked={settings.typewriterMode}
                  onChange={(e) => settingsMutation.mutate({ typewriterMode: e.target.checked })}
                />
                <span className="text-ink-300">打字机模式（光标行居中）</span>
              </label>
            </div>
          </motion.section>

          <motion.section variants={sectionMotion}>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              模型分配
            </h3>
            <SceneRoutingPanel />
          </motion.section>

          <motion.section variants={sectionMotion}>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              参考小说库
            </h3>
            <SampleLibPanel />
          </motion.section>

          <motion.section variants={sectionMotion}>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.advanced")}
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3" htmlFor="settings-dev-mode">
                <input
                  id="settings-dev-mode"
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
              <div className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-300">{t("settings.diag.title")}</span>
                  <motion.button
                    type="button"
                    className="rounded-md px-2 py-1 text-[11px] text-ink-400 hover:bg-ink-700/60 hover:text-ink-200 disabled:opacity-50"
                    onClick={handleShowDiag}
                    disabled={diagLoading}
                    aria-busy={diagLoading}
                    {...buttonMotion}
                  >
                    {diagLoading ? t("common.loading") : (diagText ? t("settings.diag.refresh") : t("settings.diag.show"))}
                  </motion.button>
                </div>
                <AnimatePresence initial={false} mode="wait">
                  {diagText ? (
                    <motion.pre
                      key="diag-text"
                      className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-900 p-2 text-[11px] leading-relaxed text-ink-300 scrollbar-thin"
                      variants={reduceMotion ? fadeOnly : staggerItem}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      {diagText}
                    </motion.pre>
                  ) : (
                    <motion.p
                      key="diag-hint"
                      className="text-[11px] text-ink-500"
                      variants={reduceMotion ? fadeOnly : staggerItem}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      {t("settings.diag.hint")}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="accentSoft"
                  size="sm"
                  className="border-accent-500/40 bg-accent-500/10 px-3 hover:bg-accent-500/20"
                  onClick={handleReplayOnboarding}
                  title={t("settings.replayOnboarding.hint")}
                >
                  {t("settings.replayOnboarding")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-ink-900 px-3"
                  onClick={handleCopyDiag}
                >
                  {t("error.boundary.copyDiag")}
                </Button>
                <AnimatePresence initial={false}>
                  {copyDiagStatus ? (
                    <motion.span
                      key="copy-diag-status"
                      role={copyDiagStatus.kind === "error" ? "alert" : "status"}
                      variants={reduceMotion ? fadeOnly : staggerItem}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className={`rounded-lg border px-2 py-1 text-[11px] ${
                        copyDiagStatus.kind === "error"
                          ? "border-red-500/40 bg-red-500/10 text-red-300"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      }`}
                    >
                      {copyDiagStatus.message}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.section>

        </motion.div>
    </AnimatedDialog>
  );
}
