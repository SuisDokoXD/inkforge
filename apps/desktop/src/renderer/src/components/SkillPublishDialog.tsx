import { useQuery } from "@tanstack/react-query";
import { AnimatedDialog } from "./AnimatedDialog";
import { friendlyErrorMessage } from "../lib/friendly-error";

interface SkillPublishDialogProps {
  open: boolean;
  onClose: () => void;
  skillId: string | null;
}

export function SkillPublishDialog({
  open,
  onClose,
  skillId,
}: SkillPublishDialogProps): JSX.Element {
  const bundleQuery = useQuery({
    queryKey: ["market-publish-bundle", skillId],
    queryFn: () =>
      skillId
        ? window.inkforge.market.buildPublishBundle({ skillId })
        : Promise.resolve(null),
    enabled: open && !!skillId,
    retry: false,
  });

  const bundle = bundleQuery.data;

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel="发布到技能市场"
      overlayClassName="flex items-center justify-center p-6"
      zClassName="z-40"
      panelClassName="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl border border-ink-600 bg-ink-800 text-ink-100 shadow-2xl"
    >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-semibold">发布到技能市场</h2>
          <button
            className="rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-1 gap-4 overflow-y-auto p-5 text-sm">
          {bundleQuery.isLoading && <div className="text-ink-400">构建中…</div>}
          {bundleQuery.isError && (
            <div className="text-red-400">
              准备失败：{friendlyErrorMessage(bundleQuery.error, "发布资料准备失败，请稍后重试。")}
            </div>
          )}
          {bundle && (
            <>
              <div className="flex w-1/2 flex-col">
                <div className="mb-2 text-xs font-semibold uppercase text-ink-400">
                  技能配置
                </div>
                <textarea
                  readOnly
                  className="flex-1 rounded border border-ink-600 bg-ink-900 p-3 font-mono text-xs text-ink-200"
                  value={bundle.skillJson}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-500"
                    onClick={() => navigator.clipboard.writeText(bundle.skillJson)}
                  >
                    复制配置
                  </button>
                </div>
              </div>
              <div className="flex w-1/2 flex-col">
                <div className="mb-2 text-xs font-semibold uppercase text-ink-400">
                  发布说明
                </div>
                <pre className="flex-1 overflow-auto rounded border border-ink-600 bg-ink-900 p-3 text-xs text-ink-200">
                  {bundle.prInstructions}
                </pre>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-accent-500"
                    onClick={() =>
                      navigator.clipboard.writeText(bundle.prInstructions)
                    }
                  >
                    复制说明
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
    </AnimatedDialog>
  );
}
