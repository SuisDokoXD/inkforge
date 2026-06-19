import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { SyncDiffRow, type CharacterSyncResolutionInput } from "@inkforge/shared";
import { AnimatedDialog } from "../AnimatedDialog";
import { characterSyncApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly, fadeSlideUp, hoverLift, staggerContainer, staggerItem, tapPress } from "../../lib/motion-tokens";

interface SyncDiffDialogProps {
  open: boolean;
  previewData: SyncDiffRow[];
  novelCharId: string;
  tavernCardId: string;
  onClose: () => void;
  onApplied: () => void;
}

type SyncResolution = { winner: "novel" | "card"; manualValue?: string };

function fieldLabel(field: SyncDiffRow["field"]): string {
  const labels: Partial<Record<SyncDiffRow["field"], string>> = {
    persona: "人设",
    backstory: "背景",
    traits: "特征",
  };
  return labels[field] ?? field;
}

export function SyncDiffDialog({
  open,
  previewData,
  novelCharId,
  tavernCardId,
  onClose,
  onApplied,
}: SyncDiffDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const [applyError, setApplyError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, SyncResolution>>(() => {
    const initial: Record<string, SyncResolution> = {};
    previewData.forEach(row => {
      initial[row.field] = { winner: row.winner || "novel" };
    });
    return initial;
  });

  useEffect(() => {
    if (!open) return;
    const next: Record<string, SyncResolution> = {};
    previewData.forEach((row) => {
      next[row.field] = { winner: row.winner || "novel" };
    });
    setResolutions(next);
    setApplyError(null);
  }, [open, previewData]);

  const applyMut = useMutation({
    mutationFn: () =>
      characterSyncApi.apply({
        novelCharId,
        tavernCardId,
        direction: "auto",
        resolutions: Object.entries(resolutions).map(([field, res]) => ({
          field: field as CharacterSyncResolutionInput["field"],
          winner: res.winner,
        })),
      }),
    onMutate: () => {
      setApplyError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["novelCharacters"] });
      void queryClient.invalidateQueries({ queryKey: ["tavernCards"] });
      onApplied();
      onClose();
    },
    onError: (err) => {
      setApplyError(friendlyErrorMessage(err, "人物同步失败，请稍后重试。"));
    },
  });

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy="sync-diff-title"
      panelClassName="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-800 shadow-2xl"
    >
        <div className="border-b border-ink-700 px-6 py-4">
          <h2 id="sync-diff-title" className="text-lg font-bold text-accent-300">人物同步冲突</h2>
          <p className="text-xs text-ink-400 mt-1">检测到书中人物与酒馆卡内容不一致，请选择保留哪一方的数据。</p>
          <AnimatePresence initial={false}>
            {applyError ? (
              <motion.div
                className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100"
                role="alert"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {applyError}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        
        <motion.div
          className="flex-1 overflow-auto p-6 space-y-8 scrollbar-thin"
          variants={reduceMotion ? fadeOnly : staggerContainer}
          initial="initial"
          animate="animate"
        >
          {previewData.map((row) => {
            const fieldDomId = row.field.replace(/[^a-zA-Z0-9_-]/g, "-");
            const novelInputId = `sync-resolution-${fieldDomId}-novel`;
            const cardInputId = `sync-resolution-${fieldDomId}-card`;
            const selectedWinner = resolutions[row.field]?.winner ?? "novel";

            return (
              <motion.div key={row.field} className="space-y-3" variants={reduceMotion ? fadeOnly : staggerItem}>
                <h3 className="text-sm font-medium text-ink-200">{fieldLabel(row.field)}</h3>
                <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label={`${fieldLabel(row.field)} 冲突保留选项`}>
                  {/* Novel Side */}
                  <motion.label
                    htmlFor={novelInputId}
                    className={`cursor-pointer rounded-lg border p-4 transition-[border-color,background-color,box-shadow,opacity] duration-200 ${
                      selectedWinner === "novel"
                        ? "border-accent-500 bg-accent-500/10"
                        : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
                    }`}
                    whileHover={reduceMotion ? undefined : hoverLift}
                    whileTap={reduceMotion ? undefined : tapPress}
                  >
                    <input
                      id={novelInputId}
                      type="radio"
                      className="sr-only"
                      name={`sync-resolution-${row.field}`}
                      checked={selectedWinner === "novel"}
                      onChange={() => setResolutions(prev => ({ ...prev, [row.field]: { winner: "novel" } }))}
                    />
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-accent-500 uppercase tracking-tighter">书中值</span>
                      {selectedWinner === "novel" && <Check className="h-3.5 w-3.5 text-accent-500" aria-hidden />}
                    </div>
                    <div className="text-xs text-ink-300 line-clamp-6 font-mono leading-relaxed whitespace-pre-wrap">
                      {String(row.novelValue)}
                    </div>
                  </motion.label>

                  {/* Card Side */}
                  <motion.label
                    htmlFor={cardInputId}
                    className={`cursor-pointer rounded-lg border p-4 transition-[border-color,background-color,box-shadow,opacity] duration-200 ${
                      selectedWinner === "card"
                        ? "border-accent-500 bg-accent-500/10"
                        : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
                    }`}
                    whileHover={reduceMotion ? undefined : hoverLift}
                    whileTap={reduceMotion ? undefined : tapPress}
                  >
                    <input
                      id={cardInputId}
                      type="radio"
                      className="sr-only"
                      name={`sync-resolution-${row.field}`}
                      checked={selectedWinner === "card"}
                      onChange={() => setResolutions(prev => ({ ...prev, [row.field]: { winner: "card" } }))}
                    />
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-accent-500 uppercase tracking-tighter">酒馆卡值</span>
                      {selectedWinner === "card" && <Check className="h-3.5 w-3.5 text-accent-500" aria-hidden />}
                    </div>
                    <div className="text-xs text-ink-300 line-clamp-6 font-mono leading-relaxed whitespace-pre-wrap">
                      {String(row.cardValue)}
                    </div>
                  </motion.label>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <div className="border-t border-ink-700 bg-ink-900/20 px-6 py-4 flex justify-end gap-3">
          <motion.button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-400 hover:text-ink-200 transition-colors"
            whileHover={reduceMotion ? undefined : hoverLift}
            whileTap={reduceMotion ? undefined : tapPress}
          >
            取消
          </motion.button>
          <motion.button
            type="button"
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending}
            className="rounded-md bg-accent-500 px-6 py-2 text-sm font-bold text-ink-950 shadow-lg shadow-accent-500/20 transition-[background-color,box-shadow,opacity] duration-200 hover:bg-accent-400 disabled:opacity-50"
            whileHover={reduceMotion || applyMut.isPending ? undefined : hoverLift}
            whileTap={reduceMotion || applyMut.isPending ? undefined : tapPress}
          >
            {applyMut.isPending ? "应用中…" : "应用更改"}
          </motion.button>
        </div>
    </AnimatedDialog>
  );
}
