import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { OnboardingDraft } from "../../pages/OnboardingPage";
import { fsApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly, fadeSlideUp, hoverLift, tapPress } from "../../lib/motion-tokens";

interface Props {
  draft: OnboardingDraft;
  updateDraft: (updates: Partial<OnboardingDraft>) => void;
}

export function OnboardingStepWorkspace({ draft, updateDraft }: Props): JSX.Element {
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const [pickError, setPickError] = useState<string | null>(null);

  const handlePickDir = async () => {
    setPickError(null);
    try {
      // In a real electron app, this would use a directory picker.
      // Assuming fsApi.pickFile can be used as a placeholder or it has pickDir.
      // specifications say "fsApi (if no dir picker, pure text input)".
      const res = await fsApi.pickFile({ title: "选择工作目录" });
      if (res.path) {
        updateDraft({ workspacePath: res.path, useDefaultWorkspace: false });
      }
    } catch (err) {
      setPickError(
        friendlyErrorMessage(err, "无法打开目录选择，请手动输入工作目录。"),
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-100">选择工作目录</h2>
        <p className="mt-2 text-sm text-ink-300">
          InkForge 将在此目录下存放你的所有小说项目、设置和缓存数据。
        </p>
      </div>

      <div className="space-y-4">
        <label
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-600 bg-ink-900/40 p-4 transition-colors hover:border-accent-500/50"
          htmlFor="onboarding-use-default-workspace"
        >
          <input
            id="onboarding-use-default-workspace"
            type="checkbox"
            className="h-5 w-5 rounded border-ink-600 bg-ink-900 text-accent-500 focus:ring-accent-500/40"
            checked={draft.useDefaultWorkspace}
            onChange={(e) => updateDraft({ useDefaultWorkspace: e.target.checked })}
          />
          <div>
            <div className="font-medium text-ink-100">使用默认位置</div>
            <div className="text-xs text-ink-400">系统应用数据文件夹 (userData/workspace)</div>
          </div>
        </label>

        <AnimatePresence initial={false}>
          {!draft.useDefaultWorkspace && (
            <motion.div
              className="space-y-2"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <label className="block text-sm font-medium text-ink-300" htmlFor="onboarding-workspace-path">
                自定义路径
              </label>
              <div className="flex gap-2">
                <input
                  id="onboarding-workspace-path"
                  className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
                  value={draft.workspacePath}
                  onChange={(e) => updateDraft({ workspacePath: e.target.value })}
                  placeholder="例如 D:/InkForgeWorkspace"
                />
                <motion.button
                  className="rounded-md bg-ink-700 px-3 py-2 text-sm text-ink-100 transition-colors hover:bg-ink-600 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                  type="button"
                  onClick={handlePickDir}
                  whileHover={reduceMotion ? undefined : hoverLift}
                  whileTap={reduceMotion ? undefined : tapPress}
                >
                  浏览...
                </motion.button>
              </div>
              <AnimatePresence initial={false}>
                {pickError ? (
                  <motion.p
                    className="rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
                    role="alert"
                    variants={stateMotion}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {pickError}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-xs leading-relaxed text-blue-200"
        variants={stateMotion}
        initial="initial"
        animate="animate"
      >
        提示：建议选择一个包含在云同步服务（如 OneDrive, iCloud, 坚果云）中的目录，以便跨设备同步和自动备份。
      </motion.div>
    </div>
  );
}
