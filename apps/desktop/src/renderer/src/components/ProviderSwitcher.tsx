import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ProviderRecord } from "@inkforge/shared";
import { settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";

interface ProviderSwitcherProps {
  providers: ProviderRecord[];
}

export function ProviderSwitcher({ providers }: ProviderSwitcherProps): JSX.Element {
  const activeId = useAppStore((s) => s.settings.activeProviderId);
  const setSettings = useAppStore((s) => s.setSettings);
  const openProviderPanel = useAppStore((s) => s.openProviderPanel);

  const active = useMemo(() => {
    if (activeId) {
      const match = providers.find((p) => p.id === activeId);
      if (match) return match;
    }
    return providers[0] ?? null;
  }, [activeId, providers]);

  const setActive = useMutation({
    mutationFn: (id: string) => settingsApi.set({ updates: { activeProviderId: id } }),
    onSuccess: (settings) => setSettings(settings),
  });

  if (providers.length === 0) {
    return (
      <button
        className="rounded-full bg-accent-500 px-3 py-1 text-xs font-medium text-ink-900 hover:bg-accent-400"
        onClick={() => openProviderPanel(true)}
      >
        配置 Provider
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <select
        className="rounded-full border border-ink-600 bg-ink-800 px-2 py-1 text-ink-200 focus:border-accent-500 focus:outline-none"
        value={active?.id ?? ""}
        onChange={(e) => setActive.mutate(e.target.value)}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} · {p.defaultModel}
          </option>
        ))}
      </select>
      <button
        className="rounded-md border border-ink-600 px-2 py-1 text-ink-300 hover:bg-ink-700"
        onClick={() => openProviderPanel(true)}
        title="管理 Provider"
      >
        ⚙
      </button>
    </div>
  );
}
