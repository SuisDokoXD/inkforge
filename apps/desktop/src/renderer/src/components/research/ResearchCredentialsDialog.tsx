import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResearchCredentialStatus, ResearchProvider } from "@inkforge/shared";
import { researchApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";

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

export function ResearchCredentialsDialog({
  open,
  onClose,
}: ResearchCredentialsDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["research-credential-status"],
    queryFn: () => researchApi.credentialStatus({}),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setDrafts({});
      setStatus(null);
    }
  }, [open]);

  const upsertMut = useMutation({
    mutationFn: (input: {
      provider: Exclude<ResearchProvider, "manual" | "llm-fallback">;
      apiKey: string;
    }) => researchApi.credentialUpsert(input),
    onSuccess: async (_data, input) => {
      setDrafts((prev) => ({ ...prev, [input.provider]: "" }));
      setStatus(`${providerRowLabel(input.provider)}已保存`);
      await queryClient.invalidateQueries({ queryKey: ["research-credential-status"] });
      window.setTimeout(() => setStatus(null), 2000);
    },
    onError: (err) => {
      setStatus(friendlyErrorMessage(err, "保存搜索服务设置失败，请检查后重试。"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (provider: Exclude<ResearchProvider, "manual" | "llm-fallback">) =>
      researchApi.credentialDelete({ provider }),
    onSuccess: async (_data, provider) => {
      setStatus(`${providerRowLabel(provider)}已清除`);
      await queryClient.invalidateQueries({ queryKey: ["research-credential-status"] });
      window.setTimeout(() => setStatus(null), 2000);
    },
  });

  if (!open) return null;

  const statuses = statusQuery.data ?? [];
  const configuredMap = new Map(
    statuses.map((s: ResearchCredentialStatus) => [s.provider, s.configured]),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-lg rounded-xl border border-ink-700 bg-ink-800 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-accent-300">搜索服务设置</h2>
          <button
            onClick={onClose}
            type="button"
            aria-label="关闭搜索服务设置"
            className="rounded px-2 py-0.5 text-sm text-ink-400 hover:bg-ink-700"
          >
            ×
          </button>
        </div>
        <p className="mb-3 text-[11px] text-ink-400">
          这里填写联网搜索服务的密钥。密钥只保存在本机安全存储中，不上传到任何服务器。
        </p>
        <div className="space-y-3">
          {PROVIDER_ROWS.map((row) => {
            const configured = configuredMap.get(row.provider) ?? false;
            const draft = drafts[row.provider] ?? "";
            return (
              <div
                key={row.provider}
                className="rounded border border-ink-700 bg-ink-900/40 p-3"
              >
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-ink-200">
                    {row.label}
                    <span
                      className={`ml-2 rounded px-1.5 py-[1px] text-[10px] ${
                        configured
                          ? "bg-green-500/20 text-green-300"
                          : "bg-ink-700 text-ink-400"
                      }`}
                    >
                      {configured ? "已配置" : "未配置"}
                    </span>
                  </span>
                  <span className="text-ink-500">{row.hint}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={draft}
                    aria-label={`${row.label}服务密钥`}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.provider]: e.target.value,
                      }))
                    }
                    placeholder={configured ? "重写后覆盖旧值" : "粘贴服务密钥"}
                    className="flex-1 rounded border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-100"
                  />
                  <button
                    type="button"
                    disabled={draft.trim().length === 0 || upsertMut.isPending}
                    onClick={() =>
                      upsertMut.mutate({
                        provider: row.provider,
                        apiKey: draft.trim(),
                      })
                    }
                    className="rounded bg-accent-500 px-3 py-1 text-[12px] font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
                  >
                    保存
                  </button>
                  {configured && (
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate(row.provider)}
                      disabled={deleteMut.isPending}
                      className="rounded border border-red-500/40 px-2 py-1 text-[12px] text-red-300 hover:bg-red-500/20"
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {status && <p className="mt-3 text-[11px] text-ink-300">{status}</p>}
      </div>
    </div>
  );
}
