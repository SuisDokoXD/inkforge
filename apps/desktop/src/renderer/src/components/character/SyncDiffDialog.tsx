import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SyncDiffRow, type CharacterSyncResolutionInput } from "@inkforge/shared";
import { characterSyncApi } from "../../lib/api";

interface SyncDiffDialogProps {
  open: boolean;
  previewData: SyncDiffRow[];
  novelCharId: string;
  tavernCardId: string;
  onClose: () => void;
  onApplied: () => void;
}

export function SyncDiffDialog({
  open,
  previewData,
  novelCharId,
  tavernCardId,
  onClose,
  onApplied,
}: SyncDiffDialogProps): JSX.Element | null {
  if (!open) return null;

  const queryClient = useQueryClient();
  const [resolutions, setResolutions] = useState<Record<string, { winner: "novel" | "card"; manualValue?: string }>>(() => {
    const initial: any = {};
    previewData.forEach(row => {
      initial[row.field] = { winner: row.winner || "novel" };
    });
    return initial;
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["novelCharacters"] });
      queryClient.invalidateQueries({ queryKey: ["tavernCards"] });
      onApplied();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-xl border border-ink-700 bg-ink-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="border-b border-ink-700 px-6 py-4">
          <h2 className="text-lg font-bold text-accent-300">人物同步冲突</h2>
          <p className="text-xs text-ink-400 mt-1">检测到书中人物与酒馆卡内容不一致，请选择保留哪一方的数据。</p>
        </div>
        
        <div className="flex-1 overflow-auto p-6 space-y-8 scrollbar-thin">
          {previewData.map((row) => (
            <div key={row.field} className="space-y-3">
              <h3 className="text-sm font-medium text-ink-200 capitalize">{row.field}</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Novel Side */}
                <div 
                  onClick={() => setResolutions(prev => ({ ...prev, [row.field]: { winner: "novel" } }))}
                  className={`cursor-pointer rounded-lg border p-4 transition-all ${
                    resolutions[row.field]?.winner === "novel" 
                      ? "border-accent-500 bg-accent-500/10" 
                      : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-accent-500 uppercase tracking-tighter">书中值</span>
                    {resolutions[row.field]?.winner === "novel" && <span className="text-accent-500 text-xs">✓</span>}
                  </div>
                  <div className="text-xs text-ink-300 line-clamp-6 font-mono leading-relaxed whitespace-pre-wrap">
                    {String(row.novelValue)}
                  </div>
                </div>

                {/* Card Side */}
                <div 
                  onClick={() => setResolutions(prev => ({ ...prev, [row.field]: { winner: "card" } }))}
                  className={`cursor-pointer rounded-lg border p-4 transition-all ${
                    resolutions[row.field]?.winner === "card" 
                      ? "border-accent-500 bg-accent-500/10" 
                      : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-accent-500 uppercase tracking-tighter">酒馆卡值</span>
                    {resolutions[row.field]?.winner === "card" && <span className="text-accent-500 text-xs">✓</span>}
                  </div>
                  <div className="text-xs text-ink-300 line-clamp-6 font-mono leading-relaxed whitespace-pre-wrap">
                    {String(row.cardValue)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-ink-700 bg-ink-900/20 px-6 py-4 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-400 hover:text-ink-200 transition-colors"
          >
            取消
          </button>
          <button 
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending}
            className="rounded-md bg-accent-500 px-6 py-2 text-sm font-bold text-ink-950 hover:bg-accent-400 transition-all shadow-lg shadow-accent-500/20 disabled:opacity-50"
          >
            {applyMut.isPending ? "应用中..." : "应用更改"}
          </button>
        </div>
      </div>
    </div>
  );
}
