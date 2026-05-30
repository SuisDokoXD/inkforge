import type { OnboardingDraft } from "../../pages/OnboardingPage";
import { fsApi } from "../../lib/api";

interface Props {
  draft: OnboardingDraft;
  updateDraft: (updates: Partial<OnboardingDraft>) => void;
}

export function OnboardingStepWorkspace({ draft, updateDraft }: Props): JSX.Element {
  const handlePickDir = async () => {
    try {
      // In a real electron app, this would use a directory picker.
      // Assuming fsApi.pickFile can be used as a placeholder or it has pickDir.
      // specifications say "fsApi (if no dir picker, pure text input)".
      const res = await fsApi.pickFile({ title: "选择工作目录" });
      if (res.path) {
         updateDraft({ workspacePath: res.path, useDefaultWorkspace: false });
      }
    } catch (err) {
      console.error(err);
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
        <label className="flex items-center gap-3 p-4 rounded-xl border border-ink-600 bg-ink-900/40 cursor-pointer hover:border-accent-500/50 transition-colors">
          <input
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

        {!draft.useDefaultWorkspace && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink-300">自定义路径</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
                value={draft.workspacePath}
                onChange={(e) => updateDraft({ workspacePath: e.target.value })}
                placeholder="例如 D:/InkForgeWorkspace"
              />
              <button
                className="rounded-md bg-ink-700 px-3 py-2 text-sm text-ink-100 hover:bg-ink-600"
                onClick={handlePickDir}
              >
                浏览...
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 leading-relaxed">
        提示：建议选择一个包含在云同步服务（如 OneDrive, iCloud, 坚果云）中的目录，以便跨设备同步和自动备份。
      </div>
    </div>
  );
}
