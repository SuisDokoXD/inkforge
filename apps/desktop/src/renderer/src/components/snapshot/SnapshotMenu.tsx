import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, Trash2, X } from "lucide-react";
import type {
  AutoWriterAgentRole,
  ChapterSnapshotKind,
  ChapterSnapshotRecord,
  SnapshotRestoreResponse,
} from "@inkforge/shared";
import { snapshotApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";
import { MotionSpinner } from "../MotionSpinner";

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
  manual: "手动",
  "pre-ai": "模型写前",
  "post-ai": "模型写后",
  "pre-rewrite": "重写前",
  "pre-restore": "还原前",
  "auto-periodic": "定时",
};

const KIND_COLORS: Record<ChapterSnapshotKind, string> = {
  manual: "bg-accent-500/20 text-accent-200",
  "pre-ai": "bg-sky-500/20 text-sky-200",
  "post-ai": "bg-emerald-500/20 text-emerald-200",
  "pre-rewrite": "bg-orange-500/20 text-orange-200",
  "pre-restore": "bg-rose-500/20 text-rose-200",
  "auto-periodic": "bg-violet-500/20 text-violet-200",
};

type StatusMessage = {
  kind: "success" | "error";
  message: string;
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
  const [manualBackupOpen, setManualBackupOpen] = useState(false);
  const [manualLabel, setManualLabel] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    action: "restore" | "delete";
  } | null>(null);
  const { status, showStatus } = useTimedStatus<StatusMessage>();
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const itemMotion = reduceMotion ? fadeOnly : staggerItem;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

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
      setManualBackupOpen(false);
      setManualLabel("");
      showStatus({ kind: "success", message: "已创建手动备份。" }, 2200);
    },
    onError: (error) => {
      showStatus({
        kind: "error",
        message: `手动备份失败：${friendlyErrorMessage(error, "请稍后重试。")}`,
      });
    },
  });

  const restoreMut = useMutation({
    mutationFn: (snapshotId: string) => snapshotApi.restore({ snapshotId }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", chapterId] });
      onRestored?.(response);
      showStatus({ kind: "success", message: "已还原版本备份。" }, 2200);
    },
    onError: (error) => {
      showStatus({
        kind: "error",
        message: `还原失败：${friendlyErrorMessage(error, "请稍后重试。")}`,
      });
    },
    onSettled: () => {
      setRestoringId(null);
      setConfirmAction(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (snapshotId: string) => snapshotApi.delete({ snapshotId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots", chapterId] });
      setConfirmAction(null);
      showStatus({ kind: "success", message: "已删除版本备份。" }, 2200);
    },
    onError: (error) => {
      showStatus({
        kind: "error",
        message: `删除失败：${friendlyErrorMessage(error, "请稍后重试。")}`,
      });
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
      showStatus({
        kind: "error",
        message: `当前正文保存失败，无法继续版本备份操作：${friendlyErrorMessage(error, "请稍后重试。")}`,
      });
      return false;
    } finally {
      setPreparing(false);
    }
  };

  const handleManualBackup = async () => {
    showStatus(null);
    if (!(await runBeforeSnapshotAction())) return;
    createMut.mutate(manualLabel.trim() || null);
  };

  const handleRestore = async (snap: ChapterSnapshotRecord) => {
    showStatus(null);
    if (!(await runBeforeSnapshotAction())) return;
    setRestoringId(snap.id);
    setConfirmAction(null);
    restoreMut.mutate(snap.id);
  };

  const handleDelete = (snap: ChapterSnapshotRecord) => {
    setManualBackupOpen(false);
    if (snap.kind === "manual") {
      showStatus(null);
      setConfirmAction({ id: snap.id, action: "delete" });
      return;
    }
    showStatus(null);
    deleteMut.mutate(snap.id);
  };

  return (
    <motion.div
      className="flex w-[420px] max-w-full flex-col gap-2 rounded-xl border border-ink-600 bg-ink-800 p-3 text-ink-100 shadow-2xl"
      variants={panelMotion}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen aria-hidden className="h-4 w-4 text-accent-300" />
          章节版本备份
        </h3>
        {onClose && (
          <motion.button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-300 hover:bg-ink-700"
            aria-label="关闭章节版本备份"
            title="关闭"
            {...buttonMotion}
          >
            <X className="h-4 w-4" />
          </motion.button>
        )}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {manualBackupOpen ? (
          <motion.div
            key="manual-backup-form"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
            className="rounded-md border border-ink-600 bg-ink-700 p-2"
          >
            <label htmlFor="snapshot-manual-label" className="block text-xs text-ink-300">
              备份名称
              <input
                id="snapshot-manual-label"
                value={manualLabel}
                onChange={(event) => setManualLabel(event.target.value)}
                placeholder="可留空"
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-ink-100 outline-none placeholder:text-ink-500"
                aria-label="手动备份名称"
              />
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <motion.button
                type="button"
                onClick={() => {
                  setManualBackupOpen(false);
                  setManualLabel("");
                }}
                disabled={createMut.isPending || preparing}
                className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-600 disabled:cursor-default disabled:opacity-50"
                {...(createMut.isPending || preparing ? {} : buttonMotion)}
              >
                取消
              </motion.button>
              <motion.button
                type="button"
                onClick={() => void handleManualBackup()}
                disabled={createMut.isPending || preparing}
                className="inline-flex min-w-[76px] items-center justify-center gap-1 rounded bg-accent-500/20 px-2 py-1 text-xs text-accent-100 hover:bg-accent-500/30 disabled:cursor-default disabled:opacity-50"
                {...(createMut.isPending || preparing ? {} : buttonMotion)}
              >
                {preparing || createMut.isPending ? <MotionSpinner className="h-3 w-3" /> : null}
                {preparing ? "同步正文中…" : createMut.isPending ? "保存中…" : "保存备份"}
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="manual-backup-start"
            type="button"
            onClick={() => {
              showStatus(null);
              setConfirmAction(null);
              setManualBackupOpen(true);
            }}
            disabled={createMut.isPending || preparing}
            className="rounded-md border border-ink-600 bg-ink-700 px-3 py-2 text-left text-sm hover:bg-ink-600 disabled:opacity-50"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
            {...(createMut.isPending || preparing ? {} : buttonMotion)}
          >
            {preparing || createMut.isPending ? (
              <MotionSpinner className="mr-1 inline h-3.5 w-3.5" />
            ) : null}
            {preparing ? "同步正文中…" : createMut.isPending ? "保存中…" : "手动备份当前章节"}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {status ? (
          <motion.div
            key="snapshot-status"
            role={status.kind === "error" ? "alert" : "status"}
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`rounded-md border px-2 py-1 text-xs ${
              status.kind === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {status.message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
        {listQuery.isLoading && (
          <div
            className="flex items-center justify-center gap-1 py-4 text-center text-xs text-ink-400"
            role="status"
          >
            <MotionSpinner className="h-3.5 w-3.5" />
            加载中…
          </div>
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
        <motion.ul
          className="flex flex-col gap-1"
          variants={reduceMotion ? undefined : staggerContainer}
          initial={reduceMotion ? undefined : "initial"}
          animate={reduceMotion ? undefined : "animate"}
        >
          {items.map((snap) => (
            <motion.li
              key={snap.id}
              layout
              variants={itemMotion}
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
                  <motion.button
                    type="button"
                    onClick={() => {
                      showStatus(null);
                      setManualBackupOpen(false);
                      setConfirmAction({ id: snap.id, action: "restore" });
                    }}
                    disabled={restoreMut.isPending || preparing}
                    className="inline-flex min-w-[44px] items-center justify-center gap-1 rounded bg-sky-500/20 px-2 py-0.5 text-sky-200 hover:bg-sky-500/30 disabled:cursor-default disabled:opacity-50"
                    {...(restoreMut.isPending || preparing ? {} : buttonMotion)}
                  >
                    {restoringId === snap.id ? <MotionSpinner className="h-3 w-3" /> : null}
                    {restoringId === snap.id ? "还原中…" : "还原"}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => handleDelete(snap)}
                    disabled={deleteMut.isPending}
                    className="inline-flex h-6 w-7 items-center justify-center rounded bg-ink-700 text-ink-300 hover:bg-rose-500/30 hover:text-rose-200 disabled:cursor-default disabled:opacity-50"
                    aria-label={`删除版本备份 ${snap.label || KIND_LABELS[snap.kind]}`}
                    title="删除"
                    {...(deleteMut.isPending ? {} : buttonMotion)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </motion.button>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {confirmAction?.id === snap.id ? (
                  <motion.div
                    key={`confirm-${snap.id}-${confirmAction.action}`}
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="rounded-md border border-ink-700 bg-ink-950/60 px-2 py-1.5"
                  >
                    <p className="mb-1 text-[11px] text-ink-300">
                      {confirmAction.action === "restore"
                        ? "当前正文会先保存为还原前备份，可再次撤销。"
                        : "手动备份删除后不可撤销。"}
                    </p>
                    <div className="flex justify-end gap-1">
                      <motion.button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        disabled={restoreMut.isPending || deleteMut.isPending || preparing}
                        className="rounded px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-700 disabled:cursor-default disabled:opacity-50"
                        {...(restoreMut.isPending || deleteMut.isPending || preparing ? {} : buttonMotion)}
                      >
                        取消
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => {
                          if (confirmAction.action === "restore") {
                            void handleRestore(snap);
                          } else {
                            showStatus(null);
                            deleteMut.mutate(snap.id);
                          }
                        }}
                        disabled={restoreMut.isPending || deleteMut.isPending || preparing}
                        className={`inline-flex min-w-[64px] items-center justify-center gap-1 rounded px-2 py-0.5 text-[11px] disabled:cursor-default disabled:opacity-50 ${
                          confirmAction.action === "restore"
                            ? "bg-sky-500/20 text-sky-100 hover:bg-sky-500/30"
                            : "bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                        }`}
                        {...(restoreMut.isPending || deleteMut.isPending || preparing ? {} : buttonMotion)}
                      >
                        {(confirmAction.action === "restore" && restoringId === snap.id) ||
                        (confirmAction.action === "delete" && deleteMut.isPending) ? (
                          <MotionSpinner className="h-3 w-3" />
                        ) : null}
                        {confirmAction.action === "restore"
                          ? restoringId === snap.id
                            ? "还原中…"
                            : "确认还原"
                          : deleteMut.isPending
                            ? "删除中…"
                            : "确认删除"}
                      </motion.button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.li>
          ))}
        </motion.ul>
      </div>

      <div className="mt-1 text-[10px] text-ink-500">
        自动备份仅保留最近 50 条；手动备份永不清理。
      </div>
    </motion.div>
  );
}
