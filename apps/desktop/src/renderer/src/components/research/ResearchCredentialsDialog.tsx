import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResearchCredentialStatus, ResearchProvider } from "@inkforge/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { AnimatedDialog } from "../AnimatedDialog";
import { Badge, Button, IconButton } from "../ui";
import { researchApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";

interface ResearchCredentialsDialogProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_ROWS: Array<{
  provider: Exclude<ResearchProvider, "manual" | "llm-fallback">;
  label: string;
  hint: string;
}> = [
  {
    provider: "tavily",
    label: "网页检索",
    hint: "适合中文网页，需要服务密钥",
  },
  {
    provider: "bing",
    label: "通用搜索",
    hint: "适合广泛网页，需要服务密钥",
  },
  {
    provider: "serpapi",
    label: "聚合搜索",
    hint: "适合搜索结果聚合，需要服务密钥",
  },
];

function providerRowLabel(provider: ResearchProvider): string {
  return PROVIDER_ROWS.find((row) => row.provider === provider)?.label ?? "检索服务";
}

type StatusMessage = {
  kind: "success" | "error";
  message: string;
};

export function ResearchCredentialsDialog({
  open,
  onClose,
}: ResearchCredentialsDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { status, showStatus } = useTimedStatus<StatusMessage>();

  const statusQuery = useQuery({
    queryKey: ["research-credential-status"],
    queryFn: () => researchApi.credentialStatus({}),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setDrafts({});
      showStatus(null);
    }
  }, [open, showStatus]);

  const upsertMut = useMutation({
    mutationFn: (input: {
      provider: Exclude<ResearchProvider, "manual" | "llm-fallback">;
      apiKey: string;
    }) => researchApi.credentialUpsert(input),
    onSuccess: async (_data, input) => {
      setDrafts((prev) => ({ ...prev, [input.provider]: "" }));
      showStatus({ kind: "success", message: `${providerRowLabel(input.provider)}已保存` }, 2200);
      await queryClient.invalidateQueries({ queryKey: ["research-credential-status"] });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        message: friendlyErrorMessage(err, "保存搜索服务设置失败，请检查后重试。"),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (provider: Exclude<ResearchProvider, "manual" | "llm-fallback">) =>
      researchApi.credentialDelete({ provider }),
    onSuccess: async (_data, provider) => {
      showStatus({ kind: "success", message: `${providerRowLabel(provider)}已清除` }, 2200);
      await queryClient.invalidateQueries({ queryKey: ["research-credential-status"] });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        message: friendlyErrorMessage(err, "清除搜索服务设置失败，请稍后重试。"),
      });
    },
  });

  const statuses = statusQuery.data ?? [];
  const configuredMap = new Map(
    statuses.map((s: ResearchCredentialStatus) => [s.provider, s.configured]),
  );

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy="research-credentials-title"
      overlayClassName="flex items-center justify-center p-6"
      panelClassName="w-full max-w-lg rounded-xl border border-ink-700 bg-ink-800 p-5 shadow-2xl"
    >
      <motion.div variants={reduce ? fadeOnly : fadeSlideUp} initial="initial" animate="animate">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="research-credentials-title" className="text-sm font-semibold text-accent-300">
            搜索服务设置
          </h2>
          <IconButton
            onClick={onClose}
            size="xs"
            variant="ghost"
            className="h-7 w-7 text-ink-400 hover:bg-ink-700 hover:text-ink-200"
            aria-label="关闭搜索服务设置"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <p className="mb-3 text-[11px] text-ink-400">
          这里填写联网搜索服务的密钥。密钥只保存在本机安全存储中，不上传到任何服务器。
        </p>
        <motion.div
          className="space-y-3"
          variants={reduce ? undefined : staggerContainer}
          initial="initial"
          animate="animate"
        >
          {PROVIDER_ROWS.map((row) => {
            const configured = configuredMap.get(row.provider) ?? false;
            const draft = drafts[row.provider] ?? "";
            const inputId = `research-credential-${row.provider}`;
            const saveDisabled = draft.trim().length === 0 || upsertMut.isPending;
            const deleteDisabled = deleteMut.isPending;
            return (
              <motion.div
                key={row.provider}
                className="rounded border border-ink-700 bg-ink-900/40 p-3"
                variants={reduce ? fadeOnly : staggerItem}
              >
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-ink-200">
                    {row.label}
                    <Badge
                      tone={configured ? "success" : "neutral"}
                      className={`ml-2 rounded px-1.5 py-[1px] font-normal ${
                        configured
                          ? "bg-green-500/20 text-green-300 ring-green-500/30"
                          : "bg-ink-700 text-ink-400 ring-ink-600/70"
                      }`}
                    >
                      {configured ? "已配置" : "未配置"}
                    </Badge>
                  </span>
                  <span className="text-ink-500">{row.hint}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={inputId} className="sr-only">
                    {row.label}服务密钥
                  </label>
                  <input
                    id={inputId}
                    type="password"
                    value={draft}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.provider]: e.target.value,
                      }))
                    }
                    placeholder={configured ? "重写后覆盖旧值" : "粘贴服务密钥"}
                    className="flex-1 rounded border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-100"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={saveDisabled}
                    onClick={() =>
                      upsertMut.mutate({
                        provider: row.provider,
                        apiKey: draft.trim(),
                      })
                    }
                  >
                    保存
                  </Button>
                  <AnimatePresence initial={false}>
                    {configured && (
                      <motion.button
                        type="button"
                        onClick={() => deleteMut.mutate(row.provider)}
                        disabled={deleteDisabled}
                        className="rounded border border-red-500/40 px-2 py-1 text-[12px] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                        variants={reduce ? fadeOnly : fadeSlideUp}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        whileHover={deleteDisabled ? undefined : hoverLift}
                        whileTap={deleteDisabled ? undefined : tapPress}
                      >
                        清除
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
        <AnimatePresence mode="wait">
          {status && (
            <motion.p
              key={status.message}
              role={status.kind === "error" ? "alert" : "status"}
              className={`mt-3 text-[11px] ${
                status.kind === "error" ? "text-red-300" : "text-ink-300"
              }`}
              variants={reduce ? fadeOnly : fadeSlideUp}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {status.message}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatedDialog>
  );
}
