import { useEffect, useMemo, useState } from "react";
import { AnimatedDialog } from "./AnimatedDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import {
  findCatalogEntry,
  PROVIDER_CATALOG,
  type ProviderRecord,
  type ProviderVendor,
} from "@inkforge/shared";
import { providerApi, settingsApi } from "../lib/api";
import { useT } from "../lib/i18n";
import { useAppStore } from "../stores/app-store";
import { ProviderKeyManager } from "./ProviderKeyManager";
import { fadeOnly } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";

interface FormState {
  id?: string;
  catalogId: string;
  label: string;
  vendor: ProviderVendor;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  tags: string;
}

type StatusMessage = {
  kind: "info" | "success" | "error";
  text: string;
};

const DEFAULT_VENDOR_MODEL: Record<ProviderVendor, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
  "openai-compat": "deepseek-chat",
};

const DEFAULT_VENDOR_BASE_URL: Record<ProviderVendor, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com",
  "openai-compat": "",
};

const EMPTY_FORM: FormState = {
  id: undefined,
  catalogId: "anthropic",
  label: "Anthropic Claude",
  vendor: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "",
  defaultModel: "claude-sonnet-4-6",
  tags: "#writing",
};

const VENDOR_OPTIONS: Array<{ value: ProviderVendor; labelKey: string }> = [
  { value: "anthropic", labelKey: "provider.vendor.anthropic" },
  { value: "openai", labelKey: "provider.vendor.openai" },
  { value: "gemini", labelKey: "provider.vendor.gemini" },
  { value: "openai-compat", labelKey: "provider.vendor.openaiCompat" },
];

function friendlyModelServiceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!message) return "模型服务操作失败，请检查配置后重试。";
  if (/api.?key|key|unauthori[sz]ed|401|403/i.test(message)) {
    return "服务密钥无效或权限不足，请检查后重试。";
  }
  if (/base.?url|url|endpoint|openai-compat/i.test(message)) {
    return "接口地址无效，请检查模型服务的接口地址。";
  }
  if (/model|404/i.test(message)) {
    return "模型名称不可用，请换一个模型后重试。";
  }
  if (/network|fetch|timeout|ECONN|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return "网络或模型服务连接异常，请稍后重试。";
  }
  return "模型服务操作失败，请检查配置后重试。";
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function guessCatalogId(provider: ProviderRecord): string {
  const normalizedRecordBase = normalizeUrl(provider.baseUrl);
  const exact = PROVIDER_CATALOG.find((entry) => {
    if (entry.vendor !== provider.vendor) return false;
    if (normalizeUrl(entry.baseUrl) !== normalizedRecordBase) return false;
    return entry.defaultModel === provider.defaultModel;
  });
  if (exact) return exact.id;
  const byLabel = PROVIDER_CATALOG.find((entry) => entry.label.toLowerCase() === provider.label.toLowerCase());
  return byLabel?.id ?? "";
}

function toForm(provider: ProviderRecord): FormState {
  return {
    id: provider.id,
    catalogId: guessCatalogId(provider),
    label: provider.label,
    vendor: provider.vendor,
    baseUrl: provider.baseUrl,
    apiKey: "",
    defaultModel: provider.defaultModel,
    tags: provider.tags.join(" "),
  };
}

function applyCatalogToForm(prev: FormState, catalogId: string): FormState {
  if (!catalogId) return { ...prev, catalogId: "" };
  const entry = findCatalogEntry(catalogId);
  if (!entry) return { ...prev, catalogId: "" };
  return {
    ...prev,
    catalogId: entry.id,
    label: entry.label,
    vendor: entry.vendor,
    baseUrl: entry.baseUrl,
    defaultModel: entry.defaultModel,
  };
}

export function ProviderSettingsPanel(): JSX.Element | null {
  const t = useT();
  const open = useAppStore((s) => s.providerPanelOpen);
  const setOpen = useAppStore((s) => s.openProviderPanel);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const queryClient = useQueryClient();

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => providerApi.list(),
    enabled: open,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const { status, showStatus } = useTimedStatus<StatusMessage>();
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const { status: remoteFetchStatus, showStatus: showRemoteFetchStatus } =
    useTimedStatus<StatusMessage>();
  const [fetchingModels, setFetchingModels] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const handleFetchRemoteModels = async () => {
    setFetchingModels(true);
    showRemoteFetchStatus(null);
    try {
      const trimmedKey = form.apiKey.trim();
      const trimmedBase = form.baseUrl.trim();
      // Prefer ad-hoc credentials when user is editing the key/base in form;
      // fall back to saved provider record otherwise.
      const useAdhoc = trimmedKey.length > 0 || form.id === "";
      const res = useAdhoc
        ? await providerApi.listRemoteModels({
            vendor: form.vendor,
            baseUrl: trimmedBase || undefined,
            apiKey: trimmedKey || undefined,
          })
        : await providerApi.listRemoteModels({ providerId: form.id });
      setRemoteModels(res.models.map((m) => m.id));
      showRemoteFetchStatus(
        {
          kind: "success",
          text: `已读取 ${res.count} 个模型 · 用时 ${res.durationMs} 毫秒`,
        },
        3200,
      );
    } catch (err) {
      showRemoteFetchStatus({
        kind: "error",
        text: `读取失败：${friendlyModelServiceError(err)}`,
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const providers = providersQuery.data ?? [];
  const activeId = settings.activeProviderId;

  const selectedCatalog = form.catalogId ? findCatalogEntry(form.catalogId) : undefined;
  const suggestedModels = selectedCatalog?.knownModels ?? [];
  const vendorLabel = (vendor: ProviderVendor): string => {
    const labelKey = VENDOR_OPTIONS.find((item) => item.value === vendor)?.labelKey;
    return labelKey ? t(labelKey) : "模型服务";
  };

  const resolveCatalogDescription = (id: string, fallback: string): string => {
    const key = `provider.catalog.${id}.description`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const resolvedActiveId = useMemo(() => {
    if (activeId && providers.some((p) => p.id === activeId)) return activeId;
    return providers[0]?.id ?? null;
  }, [activeId, providers]);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      showStatus(null);
      showRemoteFetchStatus(null);
      setDeleteConfirming(false);
    }
  }, [open, showRemoteFetchStatus, showStatus]);

  useEffect(() => {
    setDeleteConfirming(false);
  }, [form.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = form.baseUrl.trim();
      const model = form.defaultModel.trim() || selectedCatalog?.defaultModel || DEFAULT_VENDOR_MODEL[form.vendor];
      if (form.vendor === "openai-compat" && !baseUrl) {
        throw new Error(t("provider.panel.error.baseUrlRequired"));
      }
      return providerApi.save({
        id: form.id,
        label: form.label.trim() || selectedCatalog?.label || t("provider.panel.label.untitled"),
        vendor: form.vendor,
        baseUrl,
        apiKey: form.apiKey.trim() || undefined,
        defaultModel: model,
        tags: form.tags
          .split(/\s+/)
          .map((v) => v.trim())
          .filter(Boolean),
      });
    },
    onSuccess: async (saved) => {
      showStatus({ kind: "success", text: t("provider.panel.saved") }, 2000);
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      setForm(toForm(saved));
    },
    onError: (err) => {
      showStatus({ kind: "error", text: friendlyModelServiceError(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => providerApi.delete({ id }),
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      if (resolvedActiveId === id) {
        const next = await settingsApi.set({ updates: { activeProviderId: null } });
        setSettings(next);
      }
      if (form.id === id) setForm(EMPTY_FORM);
      setDeleteConfirming(false);
      showStatus({ kind: "success", text: "已删除模型服务" }, 2000);
    },
    onError: (err) =>
      showStatus({ kind: "error", text: `删除失败：${friendlyModelServiceError(err)}` }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => providerApi.test({ id }),
    onSuccess: (result) => {
      if (result.ok) {
        showStatus(
          {
            kind: "success",
            text: t("provider.panel.status.connected", { ms: result.durationMs }),
          },
          2400,
        );
      } else {
        showStatus({
          kind: "error",
          text: t("provider.panel.status.failed", {
            error: result.error
              ? friendlyModelServiceError(new Error(result.error))
              : t("provider.panel.unknownError"),
          }),
        });
      }
    },
    onError: (err) => showStatus({ kind: "error", text: friendlyModelServiceError(err) }),
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => settingsApi.set({ updates: { activeProviderId: id } }),
    onSuccess: (next) => {
      setSettings(next);
      showStatus({ kind: "success", text: "已设为当前模型服务" }, 2000);
    },
    onError: (err) =>
      showStatus({
        kind: "error",
        text: `设置失败：${friendlyModelServiceError(err)}`,
      }),
  });

  const statusClassName =
    status?.kind === "error"
      ? "text-red-300"
      : status?.kind === "success"
        ? "text-emerald-300"
        : "text-ink-300";
  const remoteFetchStatusClassName =
    remoteFetchStatus?.kind === "error"
      ? "text-red-400"
      : remoteFetchStatus?.kind === "success"
        ? "text-emerald-400"
        : "text-ink-400";

  return (
    <AnimatedDialog
      open={open}
      onClose={() => setOpen(false)}
      overlayClassName="flex items-center justify-center p-8"
      zClassName="z-40"
      panelClassName="flex h-full max-h-[680px] w-full max-w-5xl overflow-hidden rounded-2xl border border-ink-600 bg-ink-800 text-ink-100 shadow-2xl"
    >
        <aside className="flex w-80 shrink-0 flex-col border-r border-ink-700">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <span className="text-sm font-semibold">{t("provider.panel.listTitle")}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-accent-500 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-accent-400"
              onClick={() => setForm(EMPTY_FORM)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("common.new")}
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto scrollbar-thin py-1">
            {providers.length === 0 && (
              <li className="px-4 py-6 text-xs text-ink-400">{t("provider.panel.noProviders")}</li>
            )}
            {providers.map((p) => {
              const selected = p.id === form.id;
              const isActive = p.id === resolvedActiveId;
              return (
                <li key={p.id}>
                  <button
                    className={`flex w-full flex-col items-start px-4 py-2 text-left text-sm transition-colors ${
                      selected ? "bg-accent-500/20 text-accent-200" : "hover:bg-ink-700/70"
                    }`}
                    onClick={() => setForm(toForm(p))}
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="truncate">{p.label}</span>
                      {isActive && (
                        <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-300">
                          {t("provider.panel.active")}
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 text-xs text-ink-400">
                      {vendorLabel(p.vendor)} · {p.defaultModel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
            <div>
              <h2 className="text-base font-semibold">{t("provider.panel.title")}</h2>
              <p className="text-xs text-ink-400">{t("provider.panel.subtitle")}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-700"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-auto scrollbar-thin px-5 py-4 text-sm">
            <div className="grid gap-3">
              <label className="block">
                <span className="text-ink-300">{t("provider.panel.preset")}</span>
                <select
                  className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  value={form.catalogId}
                  onChange={(e) => setForm((prev) => applyCatalogToForm(prev, e.target.value))}
                >
                  <option value="">{t("provider.panel.custom")}</option>
                  {PROVIDER_CATALOG.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                {selectedCatalog && (
                  <p className="mt-1 text-xs text-ink-400">
                    {resolveCatalogDescription(selectedCatalog.id, selectedCatalog.description)}
                    {selectedCatalog.signupUrl && (
                      <>
                        {" "}
                        <a
                          className="text-accent-300 underline hover:text-accent-200"
                          href={selectedCatalog.signupUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("provider.action.getApiKey")}
                        </a>
                      </>
                    )}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="text-ink-300">{t("provider.panel.displayName")}</span>
                <input
                  className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  value={form.label}
                  aria-label={t("provider.panel.displayName")}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-ink-300">{t("provider.panel.vendor")}</span>
                  <select
                    className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                    value={form.vendor}
                    onChange={(e) => {
                      const vendor = e.target.value as ProviderVendor;
                      setForm((f) => ({
                        ...f,
                        vendor,
                        catalogId: "",
                        baseUrl: DEFAULT_VENDOR_BASE_URL[vendor],
                        defaultModel: DEFAULT_VENDOR_MODEL[vendor],
                      }));
                    }}
                  >
                    {VENDOR_OPTIONS.map((vendor) => (
                      <option key={vendor.value} value={vendor.value}>
                        {t(vendor.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-ink-300">{t("provider.panel.defaultModel")}</span>
                  <div className="mt-1 flex gap-2">
                    <input
                      list="provider-settings-models"
                      className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                      value={form.defaultModel}
                      aria-label={t("provider.panel.defaultModel")}
                      onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-ink-600 px-2 py-1 text-xs text-ink-300 hover:bg-ink-700 disabled:opacity-50"
                      disabled={fetchingModels}
                      onClick={handleFetchRemoteModels}
                      title="从模型服务读取可用模型列表"
                    >
                      {fetchingModels ? "读取中…" : "读取模型"}
                    </button>
                  </div>
                  {(() => {
                    const merged = [...new Set([...suggestedModels, ...remoteModels])];
                    return merged.length > 0 ? (
                      <datalist id="provider-settings-models">
                        {merged.map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                    ) : null;
                  })()}
                  <AnimatePresence initial={false}>
                    {remoteFetchStatus ? (
                      <motion.p
                        className={`mt-1 text-xs ${remoteFetchStatusClassName}`}
                        role={remoteFetchStatus.kind === "error" ? "alert" : "status"}
                        variants={fadeOnly}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                      >
                        {remoteFetchStatus.text}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                  {remoteModels.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {remoteModels.slice(0, 8).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className="rounded-md border border-ink-700 px-1.5 py-0.5 text-[11px] text-ink-300 hover:border-accent-500 hover:bg-ink-700"
                          onClick={() => setForm((f) => ({ ...f, defaultModel: m }))}
                        >
                          {m}
                        </button>
                      ))}
                      {remoteModels.length > 8 ? (
                        <span className="text-[11px] text-ink-500">
                          另有 {remoteModels.length - 8} 个，可在输入框候选中选择
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </label>
              </div>

              <label className="block">
                <span className="text-ink-300">{t("provider.panel.baseUrl")}</span>
                <input
                  className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  value={form.baseUrl}
                  aria-label={t("provider.panel.baseUrl")}
                  placeholder={
                    form.vendor === "openai-compat"
                      ? "https://api.deepseek.com/v1"
                      : t("provider.panel.optional")
                  }
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-ink-300">
                  {t("provider.panel.apiKey")}{" "}
                  {form.id && (
                    <span className="text-ink-500">({t("provider.panel.apiKeyKeepExisting")})</span>
                  )}
                </span>
                <input
                  className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-sm focus:border-accent-500 focus:outline-none"
                  type="password"
                  value={form.apiKey}
                  aria-label={t("provider.panel.apiKey")}
                  placeholder={form.id ? "留空则继续使用原密钥" : "粘贴服务密钥"}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-ink-300">{t("provider.panel.tags")}</span>
                <input
                  className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  value={form.tags}
                  aria-label={t("provider.panel.tags")}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </label>
            </div>

            {form.id && (
              <div className="mt-4">
                <ProviderKeyManager providerId={form.id} />
              </div>
            )}

            <AnimatePresence mode="wait">
              {status ? (
                <motion.p
                  key={status.text}
                  role={status.kind === "error" ? "alert" : "status"}
                  className={`mt-4 text-xs ${statusClassName}`}
                  variants={fadeOnly}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {status.text}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <footer className="flex items-center justify-between border-t border-ink-700 px-5 py-3">
            <div className="flex gap-2">
              {form.id && (
                <>
                  <button
                    className="rounded-md border border-ink-600 px-3 py-1.5 text-sm hover:bg-ink-700 disabled:opacity-50"
                    onClick={() => testMutation.mutate(form.id!)}
                    disabled={testMutation.isPending}
                  >
                    {testMutation.isPending ? t("provider.panel.testing") : t("provider.panel.testConnection")}
                  </button>
                  <button
                    className="rounded-md border border-ink-600 px-3 py-1.5 text-sm hover:bg-ink-700 disabled:opacity-50"
                    onClick={() => setActiveMutation.mutate(form.id!)}
                    disabled={resolvedActiveId === form.id || setActiveMutation.isPending}
                  >
                    {resolvedActiveId === form.id ? t("provider.panel.active") : t("provider.panel.setActive")}
                  </button>
                  <AnimatePresence initial={false} mode="wait">
                    {deleteConfirming ? (
                      <motion.div
                        key="delete-confirm"
                        variants={fadeOnly}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="flex items-center gap-2"
                      >
                        <span className="max-w-52 truncate text-xs text-red-300">
                          {t("provider.panel.confirmDelete", { label: form.label })}
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700 disabled:opacity-50"
                          onClick={() => setDeleteConfirming(false)}
                          disabled={deleteMutation.isPending}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                          onClick={() => {
                            if (form.id) deleteMutation.mutate(form.id);
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? "删除中" : t("common.confirm")}
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="delete-start"
                        type="button"
                        className="rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                        onClick={() => setDeleteConfirming(true)}
                        disabled={deleteMutation.isPending}
                        variants={fadeOnly}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                      >
                        {t("common.delete")}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-ink-700 px-3 py-1.5 text-sm hover:bg-ink-600"
                onClick={() => setForm(EMPTY_FORM)}
              >
                {t("common.new")}
              </button>
              <button
                className="rounded-md bg-accent-500 px-4 py-1.5 text-sm font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-60"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending
                  ? t("provider.panel.saving")
                  : form.id
                    ? t("provider.panel.saveChanges")
                    : t("provider.panel.create")}
              </button>
            </div>
          </footer>
        </section>
    </AnimatedDialog>
  );
}
