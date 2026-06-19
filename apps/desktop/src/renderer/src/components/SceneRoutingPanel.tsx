import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  SCENE_KEYS_ADVANCED,
  SCENE_KEYS_BASIC,
  type SceneKey,
  type SceneRoutingMode,
} from "@inkforge/shared";
import { providerApi, sceneBindingApi } from "../lib/api";
import { useT } from "../lib/i18n";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";

type StatusMessage = {
  kind: "success" | "error";
  text: string;
};

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
  "auto-writer": "续写精修",
  review: "全文审查",
  "daily-summary": "每日总结",
  letter: "角色来信",
};

export function SceneRoutingPanel(): JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();
  const { status, showStatus } = useTimedStatus<StatusMessage>();
  const reduceMotion = useReducedMotion() === true;
  const statusMotion = reduceMotion ? fadeOnly : fadeSlideUp;

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
    onMutate: () => showStatus(null),
    onSuccess: () => {
      showStatus({ kind: "success", text: "模型分配已保存。" }, 2000);
      return queryClient.invalidateQueries({ queryKey: ["scene-bindings"] });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "模型分配保存失败，请稍后重试。"),
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: sceneBindingApi.reset,
    onMutate: () => showStatus(null),
    onSuccess: () => {
      showStatus({ kind: "success", text: "已恢复默认分配。" }, 2000);
      return queryClient.invalidateQueries({ queryKey: ["scene-bindings"] });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "恢复默认分配失败，请稍后重试。"),
      });
    },
  });

  const setModeMutation = useMutation({
    mutationFn: sceneBindingApi.setMode,
    onMutate: () => showStatus(null),
    onSuccess: (_data, input) => {
      showStatus(
        {
          kind: "success",
          text: input.mode === "basic" ? "已切换到常用功能分配。" : "已切换到全部功能分配。",
        },
        2200,
      );
      return queryClient.invalidateQueries({ queryKey: ["scene-bindings"] });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "切换模型分配方式失败，请稍后重试。"),
      });
    },
  });

  const providers = providersQuery.data ?? [];
  const data = bindingsQuery.data;
  const mode: SceneRoutingMode = data?.mode ?? "basic";
  const isMutating =
    upsertMutation.isPending || resetMutation.isPending || setModeMutation.isPending;

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
            aria-label={`${label} 的模型服务`}
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs transition-[border-color,opacity] duration-200 focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            value={providerId}
            disabled={isMutating || providersQuery.isLoading || bindingsQuery.isLoading}
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
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs transition-[border-color,opacity] duration-200 focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            value={model}
            placeholder={provider?.defaultModel ?? ""}
            aria-label={`${label}使用的模型名称`}
            disabled={!providerId || isMutating || bindingsQuery.isLoading}
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
            type="button"
            aria-pressed={mode === "basic"}
            disabled={isMutating || mode === "basic"}
            className={`px-3 py-1 transition-[background-color,color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${mode === "basic" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"}`}
            onClick={() => setModeMutation.mutate({ mode: "basic" })}
          >
            常用功能（5 项）
          </button>
          <button
            type="button"
            aria-pressed={mode === "advanced"}
            disabled={isMutating || mode === "advanced"}
            className={`px-3 py-1 transition-[background-color,color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${mode === "advanced" ? "bg-accent-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"}`}
            onClick={() => setModeMutation.mutate({ mode: "advanced" })}
          >
            全部功能（9 项）
          </button>
        </div>
        <span className="text-ink-500">切换时会保留另一套选择</span>
      </div>

      <AnimatePresence initial={false}>
        {status ? (
          <motion.p
            className={`rounded-md border px-3 py-2 text-xs ${
              status.kind === "error"
                ? "border-red-500/20 bg-red-500/10 text-red-100"
                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
            }`}
            role={status.kind === "error" ? "alert" : "status"}
            variants={statusMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {status.text}
          </motion.p>
        ) : null}
      </AnimatePresence>

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
