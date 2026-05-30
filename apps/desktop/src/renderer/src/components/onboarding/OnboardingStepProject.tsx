import type { OnboardingDraft } from "../../pages/OnboardingPage";

interface Props {
  draft: OnboardingDraft;
  updateDraft: (updates: Partial<OnboardingDraft>) => void;
  errorMessage: string | null;
}

export function OnboardingStepProject({ draft, updateDraft, errorMessage }: Props): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-100">创建首个项目</h2>
        <p className="mt-2 text-sm text-ink-300">
          设置你的第一部小说项目。之后随时可以在应用中修改或创建新项目。
        </p>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-ink-300">项目名称</label>
        <input
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
          value={draft.projectName}
          onChange={(e) => updateDraft({ projectName: e.target.value })}
          placeholder="例如：银河帝国指南"
        />

        <label className="block text-sm font-medium text-ink-300">
          项目相对路径 (可选)
          <span className="ml-2 text-xs font-normal text-ink-500">留空则自动生成</span>
        </label>
        <input
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
          placeholder="例如：my-novel"
          value={draft.projectPath}
          onChange={(e) => updateDraft({ projectPath: e.target.value })}
        />

        <label className="block text-sm font-medium text-ink-300">每日写作目标 (字数)</label>
        <input
          className="w-32 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
          type="number"
          min={100}
          step={100}
          value={draft.dailyGoal}
          onChange={(e) => updateDraft({ dailyGoal: Number(e.target.value) || 1000 })}
        />

        {errorMessage && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
