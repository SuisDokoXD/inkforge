import { useEffect, useMemo, useState } from "react";
import { AnimatedDialog } from "./AnimatedDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [remoteFetchStatus, setRemoteFetchStatus] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  const handleFetchRemoteModels = async () => {
    setFetchingModels(true);
    setRemoteFetchStatus(null);
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
      setRemoteFetchStatus(`✓ 拉到 ${res.count} 个模型 · ${res.durationMs}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRemoteFetchStatus(`✗ 拉取失败：${msg}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const providers = providersQuery.data ?? [];
  const activeId = settings.activeProviderId;

  const selectedCatalog = form.catalogId ? findCatalogEntry(form.catalogId) : undefined;
  const suggestedModels = selectedCatalog?.knownModels ?? [];

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
      setTestStatus(null);
      setSaveStatus(null);
    }
  }, [open]);

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
      setSaveStatus(t("provider.panel.saved"));
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      setForm(toForm(saved));
      setTimeout(() => setSaveStatus(null), 2000);
    },
    onError: (err) => {
      setSaveStatus(err instanceof Error ? err.message : String(err));
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
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => providerApi.test({ id }),
    onSuccess: (result) => {
      if (result.ok) {
        setTestStatus(t("provider.panel.status.connected", { ms: result.durationMs }));
      } else {
        setTestStatus(
          t("provider.panel.status.failed", {
            error: result.error ?? t("provider.panel.unknownError"),
          }),
        );
      }
    },
    onError: (err) => setTestStatus(err instanceof Error ? err.message : String(err)),
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => settingsApi.set({ updates: { activeProviderId: id } }),
    onSuccess: (next) => setSettings(next),
  });

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
              className="rounded bg-accent-500 px-2 py-1 text-xs font-medium text-ink-900 hover:bg-accent-400"
              onClick={() => setForm(EMPTY_FORM)}
            >
              + {t("common.new")}
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
                      {p.vendor} · {p.defaultModel}
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
              className="rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700"
              onClick={() => setOpen(false)}
              title={t("common.close")}
            >
              ×
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
                      onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-ink-600 px-2 py-1 text-xs text-ink-300 hover:bg-ink-700 disabled:opacity-50"
                      disabled={fetchingModels}
                      onClick={handleFetchRemoteModels}
                      title="从 provider API 拉取可用模型列表"
                    >
                      {fetchingModels ? "拉取中…" : "📡 拉取"}
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
                  {remoteFetchStatus ? (
                    <p
                      className={`mt-1 text-xs ${
                        remoteFetchStatus.startsWith("✓") ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {remoteFetchStatus}
                    </p>
                  ) : null}
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
                        <span className="text-[11px] text-ink-500">… +{remoteModels.length - 8} 个 (用 datalist 下拉)</span>
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
                  placeholder={form.id ? "******" : "sk-..."}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-ink-300">{t("provider.panel.tags")}</span>
                <input
                  className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </label>
            </div>

            {form.id && (
              <div className="mt-4">
                <ProviderKeyManager providerId={form.id} />
              </div>
            )}

            {(saveStatus || testStatus) && <p className="mt-4 text-xs text-ink-300">{saveStatus ?? testStatus}</p>}
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
                  <button
                    className="rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    onClick={() => {
                      if (form.id && window.confirm(t("provider.panel.confirmDelete", { label: form.label }))) {
                        deleteMutation.mutate(form.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    {t("common.delete")}
                  </button>
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
