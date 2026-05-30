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
  { value: "single", label: "单 Key", hint: "仅使用第一条启用 key" },
  { value: "round-robin", label: "轮转", hint: "按创建时间顺序依次轮换" },
  { value: "weighted", label: "加权随机", hint: "按 weight 概率加权随机选取" },
  { value: "sticky", label: "粘滞", hint: "固定一条 key，失败冷却后再切换" },
];

function formatCooldown(iso: string | null): string {
  if (!iso) return "";
  const remaining = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "";
  const seconds = Math.ceil(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
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
      text: `冷却 ${formatCooldown(hp.cooldownUntil)}`,
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
        label: newLabel.trim() || `Key ${keys.length + 1}`,
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
      setStatus(err instanceof Error ? err.message : String(err));
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
        label: keys.find((k) => k.id === input.id)?.label ?? "Key",
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
        label: keys[0]?.label ?? "strategy",
        id: keys[0]?.id,
        strategy: next,
      }),
    onSuccess: () => invalidateAll(),
  });

  const cooldownMut = useMutation({
    mutationFn: (ms: number) =>
      providerKeyApi.upsert({
        providerId,
        label: keys[0]?.label ?? "strategy",
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
        <span className="text-sm font-medium text-ink-100">Key 管理</span>
        <span className="text-[11px] text-ink-500">
          {keys.length} 把 ·{" "}
          {health?.keys.filter((k) => !k.disabled && !k.cooldownUntil).length ?? 0}{" "}
          可用
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-ink-300">
          策略
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
          冷却（秒）
          <input
            type="number"
            min={0}
            max={3600}
            value={Math.round(cooldownMs / 1000)}
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
            暂无 key。新增一条在下方。
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
                onChange={(e) =>
                  weightMut.mutate({
                    id: key.id,
                    weight: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                disabled={weightMut.isPending}
                className="w-12 rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-center text-[11px] text-ink-100"
                title="weight"
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
                  if (confirm(`删除 key「${key.label}」？`)) {
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
          onChange={(e) => setNewLabel(e.target.value)}
          className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[12px] text-ink-100"
        />
        <input
          type="password"
          placeholder="API Key（本地加密）"
          value={newApiKey}
          onChange={(e) => setNewApiKey(e.target.value)}
          className="rounded border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[12px] text-ink-100"
        />
        <input
          type="number"
          min={0}
          placeholder="权重"
          value={newWeight}
          onChange={(e) => setNewWeight(parseInt(e.target.value) || 0)}
          className="rounded border border-ink-700 bg-ink-900 px-2 py-1 text-center text-[12px] text-ink-100"
          title="weight"
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
