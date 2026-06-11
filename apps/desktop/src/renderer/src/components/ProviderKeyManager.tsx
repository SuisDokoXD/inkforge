import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProviderHealthSnapshot,
  ProviderKeyRecord,
  ProviderKeyStrategy,
} from "@inkforge/shared";
import { providerKeyApi } from "../lib/api";

interface ProviderKeyManagerProps {
  providerId: string;
}

const STRATEGIES: Array<{ value: ProviderKeyStrategy; label: string; hint: string }> = [
  { value: "single", label: "只用第一条", hint: "始终优先使用第一条可用密钥" },
  { value: "round-robin", label: "依次使用", hint: "按添加顺序依次切换，适合多条备用密钥" },
  { value: "weighted", label: "按优先级分配", hint: "优先级越高，被选中的机会越多" },
  { value: "sticky", label: "固定优先", hint: "优先使用固定密钥，失败后再切换备用密钥" },
];

function friendlyProviderKeyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/api.?key|key/i.test(message)) return "服务密钥无效或为空，请检查后重试。";
  if (/provider/i.test(message)) return "模型服务不可用，请先检查模型服务设置。";
  if (/network|fetch|timeout|ECONN|ENOTFOUND/i.test(message)) {
    return "网络或服务连接异常，请稍后重试。";
  }
  return "操作失败，请检查输入后重试。";
}

function formatCooldown(iso: string | null): string {
  if (!iso) return "";
  const remaining = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "";
  const seconds = Math.ceil(remaining / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} 分钟`;
}

function statusBadge(
  key: ProviderKeyRecord,
  health: ProviderHealthSnapshot | undefined,
): { color: string; text: string } {
  if (key.disabled) return { color: "bg-ink-700 text-ink-400", text: "已停用" };
  const hp = health?.keys.find((k) => k.keyId === key.id);
  if (hp?.cooldownUntil && formatCooldown(hp.cooldownUntil)) {
    return {
      color: "bg-accent-500/20 text-accent-200",
      text: `暂停 ${formatCooldown(hp.cooldownUntil)}`,
    };
  }
  if (key.failCount > 0) {
    return {
      color: "bg-red-500/15 text-red-300",
      text: `失败 ${key.failCount}`,
    };
  }
  return { color: "bg-emerald-500/15 text-emerald-300", text: "可用" };
}

export function ProviderKeyManager({
  providerId,
}: ProviderKeyManagerProps): JSX.Element {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newWeight, setNewWeight] = useState(1);
  const [status, setStatus] = useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: ["provider-keys", providerId],
    queryFn: () => providerKeyApi.list({ providerId }),
  });
  const healthQuery = useQuery({
    queryKey: ["provider-health", providerId],
    queryFn: () => providerKeyApi.health({ providerId }),
    refetchInterval: 15_000,
  });

  const keys = keysQuery.data ?? [];
  const health = healthQuery.data;
  const strategy = health?.strategy ?? "single";
  const cooldownMs = health?.cooldownMs ?? 60_000;

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["provider-keys", providerId] }),
      queryClient.invalidateQueries({ queryKey: ["provider-health", providerId] }),
    ]);
  };

  const addMut = useMutation({
    mutationFn: () =>
      providerKeyApi.upsert({
        providerId,
        label: newLabel.trim() || `密钥 ${keys.length + 1}`,
        apiKey: newApiKey.trim(),
        weight: Math.max(0, Math.round(newWeight)),
      }),
    onSuccess: async () => {
      setNewLabel("");
      setNewApiKey("");
      setNewWeight(1);
      setStatus("已添加");
      await invalidateAll();
      window.setTimeout(() => setStatus(null), 2000);
    },
    onError: (err) => {
      setStatus(friendlyProviderKeyError(err));
    },
  });

  const toggleMut = useMutation({
    mutationFn: (input: { id: string; disabled: boolean }) =>
      providerKeyApi.setDisabled(input),
    onSuccess: () => invalidateAll(),
  });

  const weightMut = useMutation({
    mutationFn: (input: { id: string; weight: number }) =>
      providerKeyApi.upsert({
        providerId,
        id: input.id,
        label: keys.find((k) => k.id === input.id)?.label ?? "密钥",
        weight: input.weight,
      }),
    onSuccess: () => invalidateAll(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => providerKeyApi.delete({ id }),
    onSuccess: () => invalidateAll(),
  });

  const strategyMut = useMutation({
    mutationFn: (next: ProviderKeyStrategy) =>
      providerKeyApi.upsert({
        providerId,
        label: keys[0]?.label ?? "策略",
        id: keys[0]?.id,
        strategy: next,
      }),
    onSuccess: () => invalidateAll(),
  });

  const cooldownMut = useMutation({
    mutationFn: (ms: number) =>
      providerKeyApi.upsert({
        providerId,
        label: keys[0]?.label ?? "策略",
        id: keys[0]?.id,
        cooldownMs: ms,
      }),
    onSuccess: () => invalidateAll(),
  });

  const canAdd = useMemo(() => {
    return newApiKey.trim().length > 0 && !addMut.isPending;
  }, [newApiKey, addMut.isPending]);

  return (
    <div className="rounded-md border border-ink-700 bg-ink-900/40 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink-100">备用服务密钥</span>
        <span className="text-[11px] text-ink-500">
          {keys.length} 条 ·{" "}
          {health?.keys.filter((k) => !k.disabled && !k.cooldownUntil).length ?? 0}{" "}
          可用
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-ink-300">
          使用方式
          <select
            value={strategy}
            disabled={keys.length === 0 || strategyMut.isPending}
            onChange={(e) => strategyMut.mutate(e.target.value as ProviderKeyStrategy)}
            className="mt-0.5 w-full rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[12px] text-ink-100 disabled:opacity-50"
          >
            {STRATEGIES.map((opt) => (
              <option key={opt.value} value={opt.value} title={opt.hint}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-ink-300">
          失败后等待（秒）
          <input
            type="number"
            min={0}
            max={3600}
            value={Math.round(cooldownMs / 1000)}
            aria-label="失败后等待秒数"
            disabled={keys.length === 0 || cooldownMut.isPending}
            onChange={(e) =>
              cooldownMut.mutate(
                Math.max(0, Math.min(3600, parseInt(e.target.value) || 0)) * 1000,
              )
            }
            className="mt-0.5 w-full rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[12px] text-ink-100 disabled:opacity-50"
          />
        </label>
      </div>

      <ul className="mb-3 max-h-44 space-y-1 overflow-auto scrollbar-thin">
        {keys.length === 0 && (
          <li className="rounded border border-dashed border-ink-700 px-2 py-3 text-center text-[11px] text-ink-500">
            暂无密钥。可在下方新增一条。
          </li>
        )}
        {keys.map((key) => {
          const badge = statusBadge(key, health);
          return (
            <li
              key={key.id}
              className="flex items-center gap-2 rounded border border-ink-700 bg-ink-800/60 px-2 py-1.5"
            >
              <span className="flex-1 truncate text-[12px] text-ink-100">
                {key.label}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${badge.color}`}>
                {badge.text}
              </span>
              <input
                type="number"
                min={0}
                value={key.weight}
                aria-label={`调整「${key.label}」的优先级`}
                onChange={(e) =>
                  weightMut.mutate({
                    id: key.id,
                    weight: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                disabled={weightMut.isPending}
                className="w-12 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-center text-[11px] text-ink-100"
                title="优先级"
              />
              <button
                type="button"
                onClick={() => toggleMut.mutate({ id: key.id, disabled: !key.disabled })}
                disabled={toggleMut.isPending}
                className="rounded border border-ink-700 px-1.5 py-0.5 text-[11px] text-ink-300 hover:bg-ink-700"
              >
                {key.disabled ? "启用" : "停用"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`删除密钥「${key.label}」？`)) {
                    deleteMut.mutate(key.id);
                  }
                }}
                disabled={deleteMut.isPending}
                className="rounded border border-red-500/40 px-1.5 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20"
              >
                删除
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-[1fr_1.4fr_60px_auto] gap-2">
        <input
          type="text"
          placeholder="标签（备 1、备 2…）"
          value={newLabel}
          aria-label="备用密钥标签"
          onChange={(e) => setNewLabel(e.target.value)}
          className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[12px] text-ink-100"
        />
        <input
          type="password"
          placeholder="服务密钥（本地加密）"
          value={newApiKey}
          aria-label="备用服务密钥"
          onChange={(e) => setNewApiKey(e.target.value)}
          className="rounded border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-100"
        />
        <input
          type="number"
          min={0}
          placeholder="优先"
          value={newWeight}
          aria-label="备用密钥优先级"
          onChange={(e) => setNewWeight(parseInt(e.target.value) || 0)}
          className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-center text-[12px] text-ink-100"
          title="优先级"
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => addMut.mutate()}
          className="rounded bg-accent-500 px-3 py-1 text-[12px] font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-50"
        >
          添加
        </button>
      </div>
      {status && <p className="mt-2 text-[11px] text-ink-300">{status}</p>}
    </div>
  );
}
