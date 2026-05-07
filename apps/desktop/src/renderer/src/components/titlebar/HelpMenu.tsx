// M9 Phase 4.3: TitleBar help menu — discoverable entry to documentation, shortcut sheet,
// onboarding replay, diagnostic snapshot. Lives in TitleBar to be reachable from any view.
import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { useAppStore } from "../../stores/app-store";
import { settingsApi } from "../../lib/api";
import { ShortcutCheatSheet } from "../ShortcutCheatSheet";

export function HelpMenu(): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const setSettings = useAppStore((s) => s.setSettings);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const handleReplayOnboarding = async () => {
    try {
      const next = await settingsApi.set({ updates: { onboardingCompleted: false } });
      setSettings(next);
    } finally {
      setOpen(false);
    }
  };

  const handleCopyDiag = async () => {
    try {
      const r = await window.inkforge.diag.snapshot({});
      await navigator.clipboard.writeText(r.text);
    } catch (e) {
      console.warn("[diag]", e);
    } finally {
      setOpen(false);
    }
  };

  const handleOpenDocs = () => {
    window.open("https://github.com/tompignofind123-cyber/inkforge#readme", "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("help.menu.title")}
        title={t("help.menu.title")}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded text-sm text-ink-300 hover:bg-white/10 hover:text-white"
      >
        ?
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-md border border-ink-600 bg-ink-800 py-1 text-sm shadow-2xl"
        >
          <MenuItem label={t("help.menu.replayOnboarding")} onClick={handleReplayOnboarding} />
          <MenuItem label={t("help.menu.shortcuts")} onClick={() => { setOpen(false); setSheetOpen(true); }} />
          <MenuItem label={t("help.menu.docs")} onClick={handleOpenDocs} />
          <hr className="my-1 border-ink-700" />
          <MenuItem label={t("help.menu.copyDiag")} onClick={handleCopyDiag} />
        </div>
      )}
      <ShortcutCheatSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-ink-200 hover:bg-ink-700 hover:text-ink-50"
    >
      {label}
    </button>
  );
}
