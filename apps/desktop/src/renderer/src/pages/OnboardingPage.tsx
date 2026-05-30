import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { findCatalogEntry, type ProviderVendor } from "@inkforge/shared";
import { projectApi, providerApi, settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";
import { fadeSlideUp, fadeOnly } from "../lib/motion-tokens";
import { OnboardingStepper } from "../components/onboarding/OnboardingStepper";
import { OnboardingStepWorkspace } from "../components/onboarding/OnboardingStepWorkspace";
import { OnboardingStepProvider } from "../components/onboarding/OnboardingStepProvider";
import { OnboardingStepSkills } from "../components/onboarding/OnboardingStepSkills";
import { OnboardingStepProject } from "../components/onboarding/OnboardingStepProject";
import { OnboardingStepComplete } from "../components/onboarding/OnboardingStepComplete";

interface OnboardingPageProps {
  onFinish: () => void;
}

export type OnboardingDraft = {
  step: number;
  workspacePath: string;
  useDefaultWorkspace: boolean;
  catalogId: string;
  providerLabel: string;
  vendor: ProviderVendor;
  apiKey: string;
  defaultModel: string;
  baseUrl: string;
  projectName: string;
  projectPath: string;
  dailyGoal: number;
};

const DEFAULT_VENDOR_MODEL: Record<ProviderVendor, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
  "openai-compat": "deepseek-chat",
};

const DEFAULT_DRAFT: OnboardingDraft = {
  step: 0,
  workspacePath: "",
  useDefaultWorkspace: true,
  catalogId: "anthropic",
  providerLabel: "Claude",
  vendor: "anthropic",
  apiKey: "",
  defaultModel: "claude-sonnet-4-6",
  baseUrl: "",
  projectName: "My First Novel",
  projectPath: "",
  dailyGoal: 1000,
};

const DRAFT_KEY = "inkforge:onboarding:draft";

export function OnboardingPage({ onFinish }: OnboardingPageProps): JSX.Element {
  const t = useT();
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) return { ...DEFAULT_DRAFT, ...JSON.parse(saved) };
    } catch {
      // ignore invalid persisted draft
    }
    return DEFAULT_DRAFT;
  });

  const updateDraft = (updates: Partial<OnboardingDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...updates };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const queryClient = useQueryClient();
  const setSettings = useAppStore((s) => s.setSettings);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolveDefaultModel = (): string => {
    const explicit = draft.defaultModel.trim();
    if (explicit) return explicit;
    const fromCatalog = draft.catalogId ? findCatalogEntry(draft.catalogId)?.defaultModel.trim() : "";
    if (fromCatalog) return fromCatalog;
    return DEFAULT_VENDOR_MODEL[draft.vendor];
  };

  const saveProvider = useMutation({
    mutationFn: () =>
      providerApi.save({
        label: draft.providerLabel.trim() || t("provider.panel.label.untitled"),
        vendor: draft.vendor,
        baseUrl: draft.baseUrl.trim(),
        apiKey: draft.apiKey.trim() || undefined,
        defaultModel: resolveDefaultModel(),
        tags: ["#writing"],
      }),
  });

  const createProject = useMutation({
    mutationFn: () => {
      const trimmedPath = draft.projectPath.trim();
      return projectApi.create({
        name: draft.projectName.trim(),
        ...(trimmedPath ? { path: trimmedPath } : {}),
        dailyGoal: draft.dailyGoal,
      });
    },
  });

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      const next = await settingsApi.set({ updates: { onboardingCompleted: true } });
      setSettings(next);
      return next;
    },
    onSuccess: () => {
      sessionStorage.removeItem(DRAFT_KEY);
      onFinish();
    },
  });

  const handleNext = async () => {
    setErrorMessage(null);
    try {
      if (draft.step === 1) {
        const needsApiKey = draft.vendor !== "openai-compat";
        if (needsApiKey && !draft.apiKey.trim()) {
          setErrorMessage(t("onboarding.error.apiKeyRequired"));
          return;
        }
        if (draft.vendor === "openai-compat" && !draft.baseUrl.trim()) {
          setErrorMessage(t("onboarding.error.baseUrlRequired"));
          return;
        }
        const provider = await saveProvider.mutateAsync();
        try {
          const settings = await settingsApi.set({ updates: { activeProviderId: provider.id } });
          setSettings(settings);
        } catch {
          // ignore active provider persistence errors in onboarding
        }
        await queryClient.invalidateQueries({ queryKey: ["providers"] });
      } else if (draft.step === 3) {
        if (!draft.projectName.trim()) {
          setErrorMessage(t("onboarding.error.projectNameRequired"));
          return;
        }
        await createProject.mutateAsync();
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
      } else if (draft.step === 4) {
        await completeOnboarding.mutateAsync();
        return;
      }

      updateDraft({ step: draft.step + 1 });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    if (draft.step > 0) updateDraft({ step: draft.step - 1 });
  };

  const isPending = saveProvider.isPending || createProject.isPending || completeOnboarding.isPending;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 p-8">
      <div className="w-full max-w-2xl rounded-2xl bg-ink-800/80 p-8 shadow-2xl ring-1 ring-ink-600/40 backdrop-blur">
        <OnboardingStepper currentStep={draft.step} />

        {/* 步骤切换用 AnimatePresence mode="wait"：旧步骤淡出后新步骤淡入+轻微上移，
            与全局页面过渡同一套动效；reduced-motion 下退化为纯淡入淡出。
            key 绑定 draft.step，切步即触发进出场。 */}
        <div className="mt-8 min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={draft.step}
              variants={reduce ? fadeOnly : fadeSlideUp}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {draft.step === 0 && <OnboardingStepWorkspace draft={draft} updateDraft={updateDraft} />}
              {draft.step === 1 && (
                <OnboardingStepProvider draft={draft} updateDraft={updateDraft} errorMessage={errorMessage} />
              )}
              {draft.step === 2 && <OnboardingStepSkills />}
              {draft.step === 3 && (
                <OnboardingStepProject draft={draft} updateDraft={updateDraft} errorMessage={errorMessage} />
              )}
              {draft.step === 4 && <OnboardingStepComplete />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex justify-between border-t border-ink-700 pt-6">
          <button
            className={`rounded-lg px-4 py-2 text-sm text-ink-300 hover:bg-ink-700 hover:text-ink-100 ${
              draft.step === 0 || draft.step === 4 ? "invisible" : ""
            }`}
            onClick={handleBack}
            disabled={isPending}
          >
            {t("common.back")}
          </button>

          <button
            className="flex min-w-[120px] items-center justify-center rounded-lg bg-accent-500 px-6 py-2 font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-60"
            onClick={handleNext}
            disabled={isPending}
          >
            {isPending
              ? t("onboarding.action.working")
              : draft.step === 4
                ? t("onboarding.action.openApp")
                : t("common.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
