import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutoWriterAgentRole,
  ChapterSnapshotKind,
  ChapterSnapshotRecord,
  SnapshotRestoreResponse,
} from "@inkforge/shared";
import { snapshotApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";

export interface SnapshotMenuProps {
  chapterId: string;
  projectId: string;
  /** 还原后回调：上层用它刷新编辑器内容 / chapter store。 */
  onRestored?: (response: SnapshotRestoreResponse) => void;
  /** 创建或还原版本备份前调用；编辑器可借此先保存当前未保存正文。 */
  onBeforeSnapshotAction?: () => Promise<void> | void;
  /** 关闭菜单。父组件控制打开状态。 */
  onClose?: () => void;
  /** 列表上限，默认 50。 */
  limit?: number;
  /** 仅显示某些 kind。默认全部。 */
  kinds?: ChapterSnapshotKind[];
}

const KIND_LABELS: Record<ChapterSnapshotKind, string> = {
  manual: "📌 手动",
  "pre-ai": "↻ 模型写前",
  "post-ai": "✓ 模型写后",
  "pre-rewrite": "↻ 重写前",
  "pre-restore": "↶ 还原前",
  "auto-periodic": "⏱ 定时",
};

const KIND_COLORS: Record<ChapterSnapshotKind, string> = {
  manual: "bg-accent-500/20 text-accent-200",
  "pre-ai": "bg-sky-500/20 text-sky-200",
  "post-ai": "bg-emerald-500/20 text-emerald-200",
  "pre-rewrite": "bg-orange-500/20 text-orange-200",
  "pre-restore": "bg-rose-500/20 text-rose-200",
  "auto-periodic": "bg-violet-500/20 text-violet-200",
};

const AGENT_ROLE_LABELS: Record<AutoWriterAgentRole, string> = {
  planner: "结构规划",
  writer: "正文起草",
  critic: "逐段校阅",
  reflector: "整理记录",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return d.toISOString().slice(0, 10);
}

/**
 * 通用版本备份菜单组件。可挂在任意位置（编辑器顶栏 / 书房章节卡片旁 / 命令面板）。
 * PR-3 不主动挂载到现有页面，仅作为 PR-4/PR-7 的复用组件。
 */
export function SnapshotMenu({
  chapterId,
  projectId,
  onRestored,
  onBeforeSnapshotAction,
  onClose,
  limit = 50,
  kinds,
}: SnapshotMenuProps): JSX.Element {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const listQuery = useQuery({
    queryKey: ["snapshots", chapterId, kinds, limit],
    queryFn: () => snapshotApi.list({ chapterId, limit, kinds }),
    staleTime: 5_000,
  });

  const createMut = useMutation({
    mutationFn: (label: string | null) =>
      snapshotApi.create({ chapterId, projectId, kind: "manual", label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", chapterId] });
    },
  });

  const restoreMut = useMutation({
    mutationFn: (snapshotId: string) => snapshotApi.restore({ snapshotId }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", chapterId] });
      onRestored?.(response);
    },
    onSettled: () => setRestoringId(null),
  });

  const deleteMut = useMutation({
    mutationFn: (snapshotId: string) => snapshotApi.delete({ snapshotId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", chapterId] });
    },
  });

  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const runBeforeSnapshotAction = async (): Promise<boolean> => {
    if (!onBeforeSnapshotAction) return true;
    setPreparing(true);
    try {
      await onBeforeSnapshotAction();
      return true;
    } catch (error) {
      window.alert(
        `当前正文保存失败，无法继续版本备份操作：${friendlyErrorMessage(error, "请稍后重试。")}`,
      );
      return false;
    } finally {
      setPreparing(false);
    }
  };

  const handleManualBackup = async () => {
    const label = window.prompt("为这次手动备份命名（可留空）：", "");
    if (label === null) return;
    if (!(await runBeforeSnapshotAction())) return;
    createMut.mutate(label.trim() || null);
  };

  const handleRestore = async (snap: ChapterSnapshotRecord) => {
    const ok = window.confirm(
      `还原到「${snap.label || KIND_LABELS[snap.kind]}」？\n\n` +
        "当前正文会先保存为还原前备份，可再次撤销。",
    );
    if (!ok) return;
    if (!(await runBeforeSnapshotAction())) return;
    setRestoringId(snap.id);
    restoreMut.mutate(snap.id);
  };

  const handleDelete = (snap: ChapterSnapshotRecord) => {
    if (snap.kind === "manual") {
      const ok = window.confirm(
        `删除手动备份「${snap.label || snap.id.slice(0, 8)}」？此操作不可撤销。`,
      );
      if (!ok) return;
    }
    deleteMut.mutate(snap.id);
  };

  return (
    <div className="flex w-[420px] max-w-full flex-col gap-2 rounded-xl border border-ink-600 bg-ink-800 p-3 text-ink-100 shadow-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">📚 章节版本备份</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
            aria-label="关闭章节版本备份"
            title="关闭"
          >
            ✕
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleManualBackup()}
        disabled={createMut.isPending || preparing}
        className="rounded-md border border-ink-600 bg-ink-700 px-3 py-2 text-left text-sm hover:bg-ink-600 disabled:opacity-50"
      >
        {preparing ? "同步正文中…" : createMut.isPending ? "保存中…" : "📌 手动备份当前章节"}
      </button>

      <div className="max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
        {listQuery.isLoading && (
          <div className="py-4 text-center text-xs text-ink-400">加载中…</div>
        )}
        {listQuery.isError && (
          <div className="py-4 text-center text-xs text-red-400">
            加载失败：{friendlyErrorMessage(listQuery.error, "版本备份读取失败，请稍后重试。")}
          </div>
        )}
        {listQuery.isSuccess && items.length === 0 && (
          <div className="py-4 text-center text-xs text-ink-400">
            暂无版本备份。点上方按钮创建第一个。
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {items.map((snap) => (
            <li
              key={snap.id}
              className="flex flex-col gap-1 rounded-md border border-ink-700 bg-ink-900/40 p-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${KIND_COLORS[snap.kind]}`}
                >
                  {KIND_LABELS[snap.kind]}
                </span>
                {snap.label && (
                  <span className="truncate text-ink-100" title={snap.label}>
                    {snap.label}
                  </span>
                )}
                <span className="ml-auto text-ink-400">{formatTime(snap.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-ink-400">
                <span>{snap.wordCount} 字</span>
                {snap.agentRole && <span>· {AGENT_ROLE_LABELS[snap.agentRole]}</span>}
                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => void handleRestore(snap)}
                    disabled={restoreMut.isPending || preparing}
                    className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                  >
                    {restoringId === snap.id ? "还原中…" : "↶ 还原"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(snap)}
                    disabled={deleteMut.isPending}
                    className="rounded bg-ink-700 px-2 py-0.5 text-ink-300 hover:bg-rose-500/30 hover:text-rose-200 disabled:opacity-50"
                    aria-label={`删除版本备份 ${snap.label || KIND_LABELS[snap.kind]}`}
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-1 text-[10px] text-ink-500">
        自动备份仅保留最近 50 条；手动备份永不清理。
      </div>
    </div>
  );
}
