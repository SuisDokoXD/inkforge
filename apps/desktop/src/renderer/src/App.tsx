// M9 Phase 1+2.1: global shortcuts unified + 12 lazy pages + Suspense skeleton.
import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { dailyApi, providerApi, projectApi, settingsApi } from "./lib/api";
import { useAppStore } from "./stores/app-store";
import { useT } from "./lib/i18n";
import { useGlobalShortcuts } from "./lib/use-app-shortcuts";

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
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const lang = settings.uiLanguage;

  const settingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => settingsApi.get({}),
  });

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data, setSettings]);

  useEffect(() => {
    const theme = settings.theme === "light" ? "theme-light" : "theme-dark";
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(theme);
  }, [settings.theme]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const shortcutHandlers = useMemo(
    () => ({
      onSwitchMainView: setMainView,
      onOpenSettings: () => openSettings(true),
      onOpenProviders: () => openProviderPanel(true),
      onToggleTerminal: () => toggleTerminal(),
      onOpenCommandPalette: () => setPaletteOpen((v) => !v),
    }),
    [setMainView, openSettings, openProviderPanel, toggleTerminal],
  );
  useGlobalShortcuts(shortcutHandlers);

  // M9 Phase 3.1: command palette context. copyDiag uses preload api directly.
  const paletteCtx = useMemo(
    () => ({
      setMainView,
      openSettings: () => openSettings(true),
      openProviders: () => openProviderPanel(true),
      toggleTerminal: () => toggleTerminal(),
      replayOnboarding: () => {
        void settingsApi.set({ updates: { onboardingCompleted: false } }).then((next) => {
          setSettings(next);
        });
      },
      copyDiagnostic: async () => {
        try {
          const r = await window.inkforge.diag.snapshot({});
          await navigator.clipboard.writeText(r.text);
        } catch (e) {
          // best-effort
          console.warn("[copyDiagnostic]", e);
        }
      },
    }),
    [setMainView, openSettings, openProviderPanel, toggleTerminal, setSettings],
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

  useEffect(() => {
    if (settings.onboardingCompleted) {
      setOnboarded(true);
    } else if (providersQuery.data && projectsQuery.data) {
      if (providersQuery.data.length > 0 && projectsQuery.data.length > 0) {
        setOnboarded(true);
      }
    }
  }, [providersQuery.data, projectsQuery.data, settings.onboardingCompleted]);

  useEffect(() => {
    if (!settings.onboardingCompleted) setOnboarded(false);
  }, [settings.onboardingCompleted]);

  const loading =
    !settingsLoaded ||
    providersQuery.isLoading ||
    projectsQuery.isLoading ||
    settingsQuery.isLoading;

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col">
        <TitleBar />
        <div className="flex flex-1 items-center justify-center text-ink-300">
          <div className="animate-pulse">{t("app.loading")}</div>
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
            <OnboardingPage onFinish={() => setOnboarded(true)} />
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
        <GlobalDropZone />
        <div className="flex min-h-0 flex-1">
          <ErrorBoundary label="ActivityBar" lang={lang}>
            <ActivityBar onOpenPalette={() => setPaletteOpen(true)} />
          </ErrorBoundary>
          <div className="flex min-w-0 flex-1 flex-col">
            <ErrorBoundary label={mainView} lang={lang}>
              <Suspense fallback={<PageSkeleton />}>
                {mainView === "writing" && <WorkspacePage />}
                {mainView === "skill" && <SkillPage />}
                {mainView === "character" && <CharacterPage />}
                {mainView === "tavern" && <TavernPage />}
                {mainView === "world" && <WorldPage />}
                {mainView === "research" && <ResearchPage />}
                {mainView === "review" && <ReviewPage />}
                {mainView === "bookshelf" && <BookshelfPage />}
                {mainView === "achievement" && <AchievementHallPage />}
                {mainView === "letters" && <LetterInboxPage />}
                {mainView === "outline" && <OutlinePage />}
                {mainView === "auto-writer" && <AutoWriterPage />}
                {mainView === "materials" && <MaterialsPage />}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
        <CompanionMount projectId={currentProjectId ?? null} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} ctx={paletteCtx} />
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
