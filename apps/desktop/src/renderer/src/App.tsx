// M9 Phase 1+2.1: global shortcuts unified + 12 lazy pages + Suspense skeleton.
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { dailyApi, providerApi, projectApi, settingsApi } from "./lib/api";
import type { AppSettings } from "@inkforge/shared";
import { useAppStore } from "./stores/app-store";
import type { MainView } from "./stores/app-store";
import { useT } from "./lib/i18n";
import { fadeOnly, fadeSlideUp, type PageTransitionDirection } from "./lib/motion-tokens";
import { NAV_SHORTCUTS } from "./lib/shortcuts";
import { useGlobalShortcuts } from "./lib/use-app-shortcuts";
import { useWindowResizePerf } from "./lib/use-window-resize-perf";
import { useTimedStatus } from "./lib/use-timed-status";

import { OnboardingPage } from "./pages/OnboardingPage";
import { WorkspacePage } from "./pages/WorkspacePage";

const SkillPage = lazy(() => import("./pages/SkillPage").then((m) => ({ default: m.SkillPage })));
const CharacterPage = lazy(() => import("./pages/CharacterPage").then((m) => ({ default: m.CharacterPage })));
const TavernPage = lazy(() => import("./pages/TavernPage").then((m) => ({ default: m.TavernPage })));
const WorldPage = lazy(() => import("./pages/WorldPage").then((m) => ({ default: m.WorldPage })));
const OutlinePage = lazy(() => import("./pages/OutlinePage").then((m) => ({ default: m.OutlinePage })));
const ResearchPage = lazy(() => import("./pages/ResearchPage").then((m) => ({ default: m.ResearchPage })));
const ReviewPage = lazy(() => import("./pages/ReviewPage").then((m) => ({ default: m.ReviewPage })));
const AutoWriterPage = lazy(() => import("./pages/AutoWriterPage").then((m) => ({ default: m.AutoWriterPage })));
const MaterialsPage = lazy(() => import("./pages/MaterialsPage").then((m) => ({ default: m.MaterialsPage })));
const StatsPage = lazy(() => import("./pages/StatsPage").then((m) => ({ default: m.StatsPage })));  // C4
const TimelinePage = lazy(() => import("./pages/TimelinePage").then((m) => ({ default: m.TimelinePage })));  // C12
const AchievementHallPage = lazy(() => import("./pages/AchievementHallPage").then((m) => ({ default: m.AchievementHallPage })));
const LetterInboxPage = lazy(() => import("./pages/LetterInboxPage").then((m) => ({ default: m.LetterInboxPage })));
const BookshelfPage = lazy(() => import("./components/bookshelf").then((m) => ({ default: m.BookshelfPage })));

import { ActivityBar } from "./components/ActivityBar";
import { AchievementToast } from "./components/achievement";
import { Companion } from "./components/companion";
import { ReminderToast } from "./components/log";
import { TitleBar } from "./components/titlebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CrashRecoveryBanner } from "./components/CrashRecoveryBanner";
import { GlobalDropZone } from "./components/GlobalDropZone";
import { PageSkeleton } from "./components/PageSkeleton";
import { CommandPalette } from "./components/CommandPalette";
import { AnimatedPage } from "./components/AnimatedPage";
import { SettingsDialog } from "./components/SettingsDialog";
import { LetterArrivalToast } from "./components/LetterArrivalToast";

const MAIN_VIEW_ORDER = new Map<MainView, number>(
  NAV_SHORTCUTS.map((item, index) => [item.view, index]),
);

type DiagnosticStatus = { kind: "success" | "error"; text: string };

function getPageTransitionDirection(
  previousView: MainView,
  nextView: MainView,
): PageTransitionDirection {
  if (previousView === nextView) return 0;
  const previousIndex = MAIN_VIEW_ORDER.get(previousView);
  const nextIndex = MAIN_VIEW_ORDER.get(nextView);
  if (previousIndex === undefined || nextIndex === undefined) return 0;
  return nextIndex > previousIndex ? 1 : -1;
}

// 按当前主视图返回对应页面元素。抽成函数让 <AnimatePresence> 只需包一个带 key 的子节点，
// 避免在 JSX 里铺 13 行 `mainView === x && <X/>` 条件渲染。
function renderPage(mainView: MainView): JSX.Element | null {
  switch (mainView) {
    case "writing":
      return <WorkspacePage />;
    case "skill":
      return <SkillPage />;
    case "character":
      return <CharacterPage />;
    case "tavern":
      return <TavernPage />;
    case "world":
      return <WorldPage />;
    case "research":
      return <ResearchPage />;
    case "review":
      return <ReviewPage />;
    case "bookshelf":
      return <BookshelfPage />;
    case "achievement":
      return <AchievementHallPage />;
    case "letters":
      return <LetterInboxPage />;
    case "outline":
      return <OutlinePage />;
    case "auto-writer":
      return <AutoWriterPage />;
    case "materials":
      return <MaterialsPage />;
    case "stats":  // C4
      return <StatsPage />;
    case "timeline":  // C12
      return <TimelinePage />;
    default:
      return null;
  }
}

export function App(): JSX.Element {
  const t = useT();
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const settingsLoaded = useAppStore((s) => s.settingsLoaded);
  const mainView = useAppStore((s) => s.mainView);
  const setMainView = useAppStore((s) => s.setMainView);
  const openSettings = useAppStore((s) => s.openSettings);
  const openProviderPanel = useAppStore((s) => s.openProviderPanel);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const patchSettings = useAppStore((s) => s.patchSettings);
  const rightPanel = useAppStore((s) => s.rightPanel);
  const setRightPanel = useAppStore((s) => s.setRightPanel);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const lang = settings.uiLanguage;
  const terminalEnabled = settings.devModeEnabled;
  const previousMainViewRef = useRef(mainView);
  const reduceMotion = useReducedMotion() === true;
  const statusMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const { status: diagStatus, showStatus: showDiagStatus } = useTimedStatus<DiagnosticStatus>();
  const pageTransitionDirection = getPageTransitionDirection(
    previousMainViewRef.current,
    mainView,
  );

  const settingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => settingsApi.get({}),
  });

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data, setSettings]);

  useEffect(() => {
    const theme = settings.theme === "paper" ? "theme-paper"
      : settings.theme === "light" ? "theme-light"
      : settings.theme === "sepia" ? "theme-sepia"
      : settings.theme === "mint" ? "theme-mint"
      : "theme-dark";
    document.documentElement.classList.remove("theme-light", "theme-dark", "theme-paper", "theme-sepia", "theme-mint");
    document.documentElement.classList.add(theme);
  }, [settings.theme]);

  // C9: 自定义强调色——覆盖 CSS --accent-500 为自选颜色。
  // 用 HSL 派生其他色阶：50=极暗 900=极亮，中间线性插值。
  useEffect(() => {
    if (settings.customAccent && /^#[0-9a-fA-F]{6}$/.test(settings.customAccent)) {
      // 将 hex 转为 RGB 数值用于 CSS 变量
      const hex = settings.customAccent.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const root = document.documentElement.style;
      root.setProperty("--accent-custom-r", String(r));
      root.setProperty("--accent-custom-g", String(g));
      root.setProperty("--accent-custom-b", String(b));
      root.setProperty("--accent-custom-active", "1");
    } else {
      document.documentElement.style.removeProperty("--accent-custom-active");
    }
  }, [settings.customAccent]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const shortcutHandlers = useMemo(
    () => ({
      onSwitchMainView: setMainView,
      onOpenSettings: () => openSettings(true),
      onOpenProviders: () => openProviderPanel(true),
      onToggleTerminal: () => {
        if (terminalEnabled) toggleTerminal();
      },
      onOpenCommandPalette: () => setPaletteOpen((v) => !v),
      terminalEnabled,
    }),
    [setMainView, openSettings, openProviderPanel, toggleTerminal, terminalEnabled],
  );
  useGlobalShortcuts(shortcutHandlers);
  useWindowResizePerf();

  useEffect(() => {
    previousMainViewRef.current = mainView;
  }, [mainView]);

  useEffect(() => {
    if (!terminalEnabled) toggleTerminal(false);
  }, [terminalEnabled, toggleTerminal]);

  const persistSettings = useCallback(
    (updates: Partial<AppSettings>) => {
      patchSettings(updates);
      void settingsApi.set({ updates }).then(setSettings).catch(() => {});
    },
    [patchSettings, setSettings],
  );

  // A4: 命令面板上下文——扩展支持项目/写作级操作。
  const paletteCtx = useMemo(
    () => ({
      setMainView,
      openSettings: () => openSettings(true),
      openProviders: () => openProviderPanel(true),
      toggleTerminal: () => {
        if (terminalEnabled) toggleTerminal();
      },
      replayOnboarding: () => {
        void settingsApi.set({ updates: { onboardingCompleted: false } }).then((next) => {
          setSettings(next);
        });
      },
      copyDiagnostic: async () => {
        try {
          const r = await window.inkforge.diag.snapshot({});
          await navigator.clipboard.writeText(r.text);
          showDiagStatus({ kind: "success", text: "诊断信息已复制。" }, 2400);
        } catch {
          showDiagStatus({ kind: "error", text: "无法复制诊断信息，请稍后重试。" });
        }
      },
      // 项目/写作级（在 App 层提供，具体逻辑由 WorkspacePage 注入）
      createChapter: () => window.dispatchEvent(new Event("inkforge:create-chapter")),
      openExport: () => window.dispatchEvent(new Event("inkforge:open-export")),
      toggleFocusMode: () => persistSettings({ focusMode: !settings.focusMode }),
      toggleTypewriterMode: () => persistSettings({ typewriterMode: !settings.typewriterMode }),
      runManualAnalyze: () => window.dispatchEvent(new Event("inkforge:manual-analyze")),
      toggleRightPanel: () => setRightPanel(rightPanel === "timeline" ? "chat" : "timeline"),
      setEditorWidth: (width: "narrow" | "medium" | "wide") => persistSettings({ editorWidth: width }),
      adjustFontSize: (delta: number) => persistSettings({ editorFontSize: Math.max(14, Math.min(24, settings.editorFontSize + delta)) }),
      insertHeading: (level: 1 | 2) => window.dispatchEvent(new CustomEvent("inkforge:editor-command", { detail: { action: "insert-heading", level } })),
      insertSceneBreak: () => window.dispatchEvent(new CustomEvent("inkforge:editor-command", { detail: { action: "insert-scene-break" } })),
      insertFullWidthIndent: () => window.dispatchEvent(new CustomEvent("inkforge:editor-command", { detail: { action: "insert-indent" } })),
      jumpHeading: (direction: "previous" | "next") => window.dispatchEvent(new CustomEvent("inkforge:editor-command", { detail: { action: "jump-heading", direction } })),
      hasProject: !!currentProjectId,
      isWriting: mainView === "writing",
    }),
    [
      setMainView,
      openSettings,
      openProviderPanel,
      toggleTerminal,
      persistSettings,
      terminalEnabled,
      setSettings,
      showDiagStatus,
      currentProjectId,
      mainView,
      rightPanel,
      setRightPanel,
      settings.editorFontSize,
      settings.focusMode,
      settings.typewriterMode,
    ],
  );

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => providerApi.list(),
    enabled: settingsQuery.isSuccess,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
    enabled: providersQuery.isSuccess,
  });

  const [onboarded, setOnboarded] = useState(false);
  // 标记初次判定是否已完成：用于区分「首次加载的自动跳过启发式」与「用户主动重看引导」。
  const onboardDecidedRef = useRef(false);

  useEffect(() => {
    // 已完成引导 → 直接进入主界面。
    if (settings.onboardingCompleted) {
      onboardDecidedRef.current = true;
      setOnboarded(true);
      return;
    }
    // 未完成：等 provider / project 数据就绪后再判定。
    if (!providersQuery.data || !projectsQuery.data) return;
    if (!onboardDecidedRef.current) {
      // 首次判定：老用户（已有 provider + 项目）自动跳过引导；全新用户展示引导。
      onboardDecidedRef.current = true;
      setOnboarded(providersQuery.data.length > 0 && projectsQuery.data.length > 0);
    } else {
      // 判定过之后 onboardingCompleted 仍为 false，只可能是用户主动「重看引导」→ 强制展示，
      // 不再被随后的 React-Query 重新拉取（data 引用变化）误关掉。
      setOnboarded(false);
    }
  }, [providersQuery.data, projectsQuery.data, settings.onboardingCompleted]);

  const loading =
    !settingsLoaded ||
    providersQuery.isLoading ||
    projectsQuery.isLoading ||
    settingsQuery.isLoading;

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col">
        <TitleBar />
        <div className="min-h-0 flex-1">
          <PageSkeleton label={t("app.loading")} />
        </div>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <ErrorBoundary label="Onboarding" lang={lang}>
        <div className="flex h-full w-full flex-col">
          <TitleBar />
          <div className="min-h-0 flex-1">
            {/* 完成引导：乐观更新 store（OnboardingPage 已持久化 onboardingCompleted=true），
                让上面的判定 effect 走「已完成」分支并稳定保持在主界面。 */}
            <OnboardingPage
              onFinish={() => {
                setSettings({ ...settings, onboardingCompleted: true });
                setOnboarded(true);
              }}
            />
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary label="InkForge" lang={lang}>
      <div className="flex h-full w-full flex-col">
        <TitleBar />
        <CrashRecoveryBanner />
        <ReminderToast />
        <AchievementToast />
        <LetterArrivalToast />
        <GlobalDropZone />
        <AnimatePresence initial={false}>
          {diagStatus ? (
            <motion.div
              role={diagStatus.kind === "error" ? "alert" : "status"}
              className={`fixed right-4 top-12 z-[70] max-w-sm rounded-md border px-3 py-2 text-xs shadow-2xl ${
                diagStatus.kind === "error"
                  ? "border-rose-500/30 bg-rose-500/15 text-rose-100"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
              }`}
              variants={statusMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {diagStatus.text}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex min-h-0 flex-1">
          <ErrorBoundary label="ActivityBar" lang={lang}>
            <ActivityBar onOpenPalette={() => setPaletteOpen(true)} />
          </ErrorBoundary>
          <div className="flex min-w-0 flex-1 flex-col">
            <ErrorBoundary label={mainView} lang={lang}>
              {/* mode="wait"：旧页退场完成后新页再进场，贴近 macOS 单窗口切换的清晰感。
                  initial={false}：首屏不播放进场，避免应用启动时闪一下。 */}
              <AnimatePresence mode="wait" initial={false}>
                <AnimatedPage key={mainView} direction={pageTransitionDirection}>
                  <Suspense fallback={<PageSkeleton label={t("app.loading")} />}>
                    {renderPage(mainView)}
                  </Suspense>
                </AnimatedPage>
              </AnimatePresence>
            </ErrorBoundary>
          </div>
        </div>
        <CompanionMount projectId={currentProjectId ?? null} />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          ctx={paletteCtx}
          terminalEnabled={terminalEnabled}
        />
        <SettingsDialog />
      </div>
    </ErrorBoundary>
  );
}

function CompanionMount({ projectId }: { projectId: string | null }): JSX.Element {
  const dailyQuery = useQuery({
    queryKey: ["daily-progress", projectId],
    queryFn: () => dailyApi.progress({ projectId: projectId ?? "" }),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });
  const dailyAchieved = useCallback(() => {
    const r = dailyQuery.data;
    if (!r) return false;
    return r.goalHit;
  }, [dailyQuery.data])();
  return <Companion dailyAchieved={dailyAchieved} />;
}
