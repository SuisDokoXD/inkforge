import { useAppStore } from "../../stores/app-store";

interface ContextBudgetBarProps {
  sessionId: string;
}

export function ContextBudgetBar({ sessionId }: ContextBudgetBarProps): JSX.Element {
  const budget = useAppStore((s) => s.tavernBudgetState[sessionId]);

  if (!budget) {
    return (
      <div className="border-b border-ink-700 bg-ink-800/40 px-4 py-2 text-[11px] text-ink-500">
        暂无预算数据（推进一轮后显示）
      </div>
    );
  }

  const { budgetTokens, usedTokens, remainingTokens } = budget;
  const safeBudget = Math.max(1, budgetTokens);
  const percent = Math.max(0, Math.min(100, (usedTokens / safeBudget) * 100));
  const remainPct = 100 - percent;

  let color = "bg-emerald-500";
  let textColor = "text-emerald-300";
  let ring = "";
  if (remainPct <= 10) {
    color = "bg-red-500";
    textColor = "text-red-300";
    ring = "animate-pulse";
  } else if (remainPct <= 30) {
    color = "bg-accent-400";
    textColor = "text-accent-300";
  }

  return (
    <div className="border-b border-ink-700 bg-ink-800/40 px-4 py-2">
      <div className="flex items-center gap-3 text-[11px]">
        <span className={`font-medium ${textColor}`}>
          已用 {usedTokens} / {budgetTokens}
        </span>
        <div className="flex-1 h-2 rounded-full bg-ink-900 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${color} ${ring}`}
            style={{ width: `${percent.toFixed(1)}%` }}
          />
        </div>
        <span className={`${textColor} tabular-nums`}>剩余 {remainingTokens}</span>
        <span className="text-ink-500">· {percent.toFixed(0)}%</span>
      </div>
      {budget.shouldWarn && (
        <div className="mt-1 text-[10px] text-accent-300/80">
          ⚠ 预算吃紧，建议下一轮前压缩历史
        </div>
      )}
    </div>
  );
}
