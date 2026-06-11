import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SCENE_KEYS_ADVANCED,
  SCENE_KEYS_BASIC,
  type SceneKey,
  type SceneRoutingMode,
} from "@inkforge/shared";
import { providerApi, sceneBindingApi } from "../lib/api";
import { useT } from "../lib/i18n";

const SCENE_LABEL_BASIC: Record<string, string> = {
  outline_generation: "大纲生成",
  main_generation: "主线写作",
  extract: "文本提取与审查",
  summarize: "每日总结",
  inline: "选中片段润色/续写",
};

const SCENE_LABEL_ADVANCED: Record<string, string> = {
  analyze: "正文分析",
  quick: "选中片段处理",
  chat: "写作聊天",
  skill: "写作技能",
  tavern: "角色讨论",
  "auto-writer": "自动写作",
  review: "全文审查",
  "daily-summary": "每日总结",
  letter: "角色来信",
};

export function SceneRoutingPanel(): JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => providerApi.list(),
  });

  const bindingsQuery = useQuery({
    queryKey: ["scene-bindings"],
    queryFn: () => sceneBindingApi.list(),
  });

  const upsertMutation = useMutation({
    mutationFn: sceneBindingApi.upsert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scene-bindings"] }),
  });

  const resetMutation = useMutation({
    mutationFn: sceneBindingApi.reset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scene-bindings"] }),
  });

  const setModeMutation = useMutation({
    mutationFn: sceneBindingApi.setMode,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scene-bindings"] }),
  });

  const providers = providersQuery.data ?? [];
  const data = bindingsQuery.data;
  const mode: SceneRoutingMode = data?.mode ?? "basic";

  const bindingMap = useMemo(() => {
    const map = new Map<SceneKey, { providerId: string | null; model: string | null }>();
    if (!data) return map;
    for (const b of data.basic) map.set(b.sceneKey, { providerId: b.providerId, model: b.model });
    for (const b of data.advanced) map.set(b.sceneKey, { providerId: b.providerId, model: b.model });
    return map;
  }, [data]);

  const handleProviderChange = (
    targetMode: SceneRoutingMode,
    sceneKey: SceneKey,
    providerId: string,
  ): void => {
    if (!providerId) {
      resetMutation.mutate({ mode: targetMode, sceneKey });
      return;
    }
    const provider = providers.find((p) => p.id === providerId);
    upsertMutation.mutate({
      mode: targetMode,
      sceneKey,
      providerId,
      model: provider?.defaultModel ?? null,
    });
  };

  const handleModelChange = (
    targetMode: SceneRoutingMode,
    sceneKey: SceneKey,
    providerId: string | null,
    model: string,
  ): void => {
    if (!providerId) return;
    upsertMutation.mutate({
      mode: targetMode,
      sceneKey,
      providerId,
      model: model || null,
    });
  };

  const renderRow = (targetMode: SceneRoutingMode, sceneKey: SceneKey, label: string, dim: boolean) => {
    const bound = bindingMap.get(sceneKey);
    const providerId = bound?.providerId ?? "";
    const model = bound?.model ?? "";
    const provider = providers.find((p) => p.id === providerId);
    const knownModels: string[] = (provider as unknown as { knownModels?: string[] })?.knownModels ?? [];
    return (
      <tr key={`${targetMode}:${sceneKey}`} className={dim ? "opacity-50" : ""}>
        <td className="py-1.5 pr-3 text-ink-300">{label}</td>
        <td className="py-1.5 pr-3">
          <select
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs focus:border-accent-500 focus:outline-none"
            value={providerId}
            onChange={(e) => handleProviderChange(targetMode, sceneKey, e.target.value)}
          >
            <option value="">使用默认</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </td>
        <td className="py-1.5">
          <input
            type="text"
            list={knownModels.length ? `models-${targetMode}-${sceneKey}` : undefined}
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed"
            value={model}
            placeholder={provider?.defaultModel ?? ""}
            aria-label={`${label}使用的模型名称`}
            disabled={!providerId}
            onChange={(e) => handleModelChange(targetMode, sceneKey, providerId, e.target.value)}
          />
          {knownModels.length > 0 ? (
            <datalist id={`models-${targetMode}-${sceneKey}`}>
              {knownModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-ink-300">模型分配方式</span>
        <div className="flex overflow-hidden rounded-md border border-ink-600">
          <button
            className={`px-3 py-1 ${mode === "basic" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"}`}
            onClick={() => setModeMutation.mutate({ mode: "basic" })}
          >
            常用功能（5 项）
          </button>
          <button
            className={`px-3 py-1 ${mode === "advanced" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"}`}
            onClick={() => setModeMutation.mutate({ mode: "advanced" })}
          >
            全部功能（9 项）
          </button>
        </div>
        <span className="text-ink-500">切换时会保留另一套选择</span>
      </div>

      <details open={mode === "basic"} className="rounded-md border border-ink-700 p-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-200">
          常用功能（5 项）{mode === "basic" ? "· 当前生效" : "· 未生效"}
        </summary>
        <table className="mt-3 w-full table-fixed text-xs">
          <colgroup>
            <col className="w-32" />
            <col />
            <col className="w-44" />
          </colgroup>
          <thead>
            <tr className="text-ink-400">
              <th className="pb-1 pr-3 text-left font-normal">功能</th>
              <th className="pb-1 pr-3 text-left font-normal">模型服务</th>
              <th className="pb-1 text-left font-normal">模型名称</th>
            </tr>
          </thead>
          <tbody>
            {SCENE_KEYS_BASIC.map((key) =>
              renderRow("basic", key, SCENE_LABEL_BASIC[key] ?? key, mode !== "basic"),
            )}
          </tbody>
        </table>
      </details>

      <details open={mode === "advanced"} className="rounded-md border border-ink-700 p-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-200">
          全部功能（9 项）{mode === "advanced" ? "· 当前生效" : "· 未生效"}
        </summary>
        <table className="mt-3 w-full table-fixed text-xs">
          <colgroup>
            <col className="w-32" />
            <col />
            <col className="w-44" />
          </colgroup>
          <thead>
            <tr className="text-ink-400">
              <th className="pb-1 pr-3 text-left font-normal">功能</th>
              <th className="pb-1 pr-3 text-left font-normal">模型服务</th>
              <th className="pb-1 text-left font-normal">模型名称</th>
            </tr>
          </thead>
          <tbody>
            {SCENE_KEYS_ADVANCED.map((key) =>
              renderRow("advanced", key, SCENE_LABEL_ADVANCED[key] ?? key, mode !== "advanced"),
            )}
          </tbody>
        </table>
      </details>

      {bindingsQuery.isLoading ? (
        <p className="text-xs text-ink-500">{t("common.loading")}</p>
      ) : null}
    </div>
  );
}
