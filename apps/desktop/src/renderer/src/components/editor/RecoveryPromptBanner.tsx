interface RecoveryPrompt {
  content: string;
  savedAt: number;
}

interface RecoveryPromptBannerProps {
  recoveryPrompt: RecoveryPrompt;
  onRestore: (content: string) => void;
  onDiscard: () => void;
}

export function RecoveryPromptBanner({
  recoveryPrompt,
  onRestore,
  onDiscard,
}: RecoveryPromptBannerProps): JSX.Element {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-accent-600/60 bg-accent-900/20 px-3 py-2 text-xs text-accent-100">
      <div>
        检测到未保存的自动备份（{new Date(recoveryPrompt.savedAt).toLocaleString()}），
        可能来自上次异常退出。是否恢复？
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          className="rounded border border-accent-500 px-2 py-0.5 hover:bg-accent-800/40"
          onClick={() => onRestore(recoveryPrompt.content)}
        >
          恢复
        </button>
        <button
          className="rounded border border-ink-600 px-2 py-0.5 hover:bg-ink-700"
          onClick={onDiscard}
        >
          丢弃
        </button>
      </div>
    </div>
  );
}
