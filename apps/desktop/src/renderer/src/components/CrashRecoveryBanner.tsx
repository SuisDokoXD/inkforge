import { useEffect, useState } from "react";
import { diagApi } from "../lib/api";
import { useT } from "../lib/i18n";

/**
 * Shown once per session when the previous run did not exit cleanly.
 * Dismissal clears the in-memory flag; the live lock file is only removed on
 * clean quit, so the signal is retained for diagnostics until then.
 */
export function CrashRecoveryBanner(): JSX.Element | null {
  const t = useT();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "hidden" }
    | { kind: "visible"; at: number | null; reason: string | null; expanded: boolean }
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    diagApi
      .crashStatus()
      .then((res) => {
        if (!active) return;
        setState(
          res.crashed
            ? { kind: "visible", at: res.crashedAt, reason: res.reason, expanded: false }
            : { kind: "hidden" },
        );
      })
      .catch(() => active && setState({ kind: "hidden" }));
    return () => {
      active = false;
    };
  }, []);

  if (state.kind !== "visible") return null;

  const when = state.at ? new Date(state.at).toLocaleString() : null;
  return (
    <div
      role="alert"
      className="border-b border-accent-500/40 bg-accent-500/10 px-4 py-2 text-sm text-accent-100"
    >
      <div className="flex items-start gap-3">
        <span className="font-semibold">{t("crashBanner.title")}</span>
        <span className="flex-1 text-accent-200/80">
          {t("crashBanner.body")}
          {when && <span className="ml-1 text-accent-200/60">({when})</span>}
        </span>
        {state.reason && (
          <button
            className="rounded border border-accent-400/40 px-2 py-0.5 text-xs hover:bg-accent-500/20"
            onClick={() =>
              setState((s) => (s.kind === "visible" ? { ...s, expanded: !s.expanded } : s))
            }
          >
            {state.expanded ? t("crashBanner.hideDetails") : t("crashBanner.showDetails")}
          </button>
        )}
        <button
          className="rounded border border-accent-400/40 px-2 py-0.5 text-xs hover:bg-accent-500/20"
          onClick={() => {
            void diagApi.crashDismiss();
            setState({ kind: "hidden" });
          }}
        >
          {t("crashBanner.dismiss")}
        </button>
      </div>
      {state.expanded && state.reason && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs text-accent-100/80">
          {state.reason}
        </pre>
      )}
    </div>
  );
}
