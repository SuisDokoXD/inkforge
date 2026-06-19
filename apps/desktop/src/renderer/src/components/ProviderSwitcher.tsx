import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Settings } from "lucide-react";
import type { ProviderRecord } from "@inkforge/shared";
import { settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { fadeOnly, hoverLift, SPRING_SNAPPY, tapPress } from "../lib/motion-tokens";
import { MotionSpinner } from "./MotionSpinner";

interface ProviderSwitcherProps {
  providers: ProviderRecord[];
}

export function ProviderSwitcher({ providers }: ProviderSwitcherProps): JSX.Element {
  const activeId = useAppStore((s) => s.settings.activeProviderId);
  const setSettings = useAppStore((s) => s.setSettings);
  const openProviderPanel = useAppStore((s) => s.openProviderPanel);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

  const active = useMemo(() => {
    if (activeId) {
      const match = providers.find((p) => p.id === activeId);
      if (match) return match;
    }
    return providers[0] ?? null;
  }, [activeId, providers]);

  const setActive = useMutation({
    mutationFn: (id: string) => settingsApi.set({ updates: { activeProviderId: id } }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: (settings) => setSettings(settings),
    onError: (err) => {
      setError(friendlyErrorMessage(err, "模型服务切换失败，请稍后重试。"));
    },
  });

  if (providers.length === 0) {
    return (
      <motion.button
        type="button"
        className="rounded-full bg-accent-500 px-3 py-1 text-xs font-medium text-ink-900 hover:bg-accent-400"
        onClick={() => openProviderPanel(true)}
        {...buttonMotion}
      >
        配置模型服务
      </motion.button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <select
        aria-label="选择模型服务"
        className="rounded-full border border-ink-600 bg-ink-800 px-2 py-1 text-ink-200 focus:border-accent-500 focus:outline-none disabled:cursor-default disabled:opacity-60"
        value={active?.id ?? ""}
        onChange={(e) => setActive.mutate(e.target.value)}
        disabled={setActive.isPending}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} · {p.defaultModel}
          </option>
        ))}
      </select>
      <AnimatePresence initial={false}>
        {setActive.isPending ? (
          <motion.span
            key="provider-switching"
            className="inline-flex items-center gap-1 text-[11px] text-accent-300"
            role="status"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <MotionSpinner className="h-3 w-3" />
            切换中…
          </motion.span>
        ) : null}
      </AnimatePresence>
      <motion.button
        type="button"
        className="inline-flex items-center rounded-md border border-ink-600 px-2 py-1 text-ink-300 hover:bg-ink-700"
        onClick={() => openProviderPanel(true)}
        title="管理模型服务"
        aria-label="管理模型服务"
        {...buttonMotion}
      >
        <Settings className="h-3.5 w-3.5" aria-hidden />
      </motion.button>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.span
            className="max-w-[12rem] truncate text-[11px] text-red-300"
            role="alert"
            title={error}
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {error}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
