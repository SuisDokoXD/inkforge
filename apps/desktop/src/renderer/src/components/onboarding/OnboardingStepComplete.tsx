export function OnboardingStepComplete(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-500/20 text-accent-500 text-4xl">
        ✍
      </div>
      <div>
        <h2 className="text-2xl font-bold text-ink-100">一切准备就绪</h2>
        <p className="mt-2 text-ink-300">
          InkForge 已为你配置好环境，开启你的创作之旅。
        </p>
      </div>

      <div className="w-full grid grid-cols-2 gap-4 text-left">
        <div className="p-4 rounded-xl border border-ink-700 bg-ink-900/40">
          <div className="text-xs font-semibold text-accent-400 uppercase tracking-wider mb-2">快捷键</div>
          <ul className="space-y-2 text-sm text-ink-200">
            <li className="flex justify-between">
              <span>写作视图</span>
              <kbd className="text-[10px] bg-ink-700 px-1 rounded">Ctrl+1</kbd>
            </li>
            <li className="flex justify-between">
              <span>分析辅助</span>
              <kbd className="text-[10px] bg-ink-700 px-1 rounded">Ctrl+Enter</kbd>
            </li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-ink-700 bg-ink-900/40">
          <div className="text-xs font-semibold text-accent-400 uppercase tracking-wider mb-2">贴士</div>
          <p className="text-xs text-ink-400 leading-relaxed">
            你可以在技能页 (Ctrl+2) 发现更多 AI 插件。在侧边栏右键章节点击“导入”可快速迁移旧稿。
          </p>
        </div>
      </div>
      
      <p className="text-sm text-accent-500 font-medium">
        点击下方按钮，进入你的写作空间。
      </p>
    </div>
  );
}
