import { findCatalogEntry, PROVIDER_CATALOG, type ProviderVendor } from "@inkforge/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useT } from "../../lib/i18n";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import type { OnboardingDraft } from "../../pages/OnboardingPage";

interface Props {
  draft: OnboardingDraft;
  updateDraft: (updates: Partial<OnboardingDraft>) => void;
  errorMessage: string | null;
}

const VENDOR_OPTIONS: Array<{ value: ProviderVendor; label: string }> = [
  { value: "anthropic", label: "provider.vendor.anthropic" },
  { value: "openai", label: "provider.vendor.openai" },
  { value: "gemini", label: "provider.vendor.gemini" },
  { value: "openai-compat", label: "provider.vendor.openaiCompat" },
];

const VENDOR_DEFAULT_MODEL: Record<ProviderVendor, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
  "openai-compat": "deepseek-chat",
};

const VENDOR_DEFAULT_BASE_URL: Record<ProviderVendor, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com",
  "openai-compat": "",
};

export function OnboardingStepProvider({ draft, updateDraft, errorMessage }: Props): JSX.Element {
  const t = useT();
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const selectedCatalog = draft.catalogId ? findCatalogEntry(draft.catalogId) : undefined;
  const knownModels = selectedCatalog?.knownModels ?? [];

  const resolveCatalogDescription = (id: string, fallback: string): string => {
    const key = `provider.catalog.${id}.description`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const applyCatalog = (catalogId: string) => {
    if (!catalogId) {
      updateDraft({ catalogId: "" });
      return;
    }
    const entry = findCatalogEntry(catalogId);
    if (!entry) return;
    updateDraft({
      catalogId: entry.id,
      providerLabel: entry.label,
      vendor: entry.vendor,
      baseUrl: entry.baseUrl,
      defaultModel: entry.defaultModel,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-ink-100">{t("onboarding.provider.title")}</h2>
        <p className="mt-1 text-sm text-ink-300">
          {t("onboarding.provider.subtitle")}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-ink-300" htmlFor="onboarding-provider-preset">
            {t("onboarding.provider.preset")}
          </label>
          <select
            id="onboarding-provider-preset"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            value={draft.catalogId}
            onChange={(e) => applyCatalog(e.target.value)}
          >
            <option value="">{t("onboarding.provider.custom")}</option>
            {PROVIDER_CATALOG.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <AnimatePresence initial={false}>
            {selectedCatalog && (
              <motion.p
                className="text-xs text-ink-400"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {resolveCatalogDescription(selectedCatalog.id, selectedCatalog.description)}{" "}
                {selectedCatalog.signupUrl && (
                  <a
                    className="text-accent-300 underline hover:text-accent-200"
                    href={selectedCatalog.signupUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("provider.action.getApiKey")}
                  </a>
                )}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <label className="block space-y-2" htmlFor="onboarding-provider-name">
          <span className="text-sm font-medium text-ink-300">{t("onboarding.provider.name")}</span>
          <input
            id="onboarding-provider-name"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            value={draft.providerLabel}
            onChange={(e) => updateDraft({ providerLabel: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-2" htmlFor="onboarding-provider-vendor">
            <span className="text-sm font-medium text-ink-300">{t("onboarding.provider.vendor")}</span>
            <select
              id="onboarding-provider-vendor"
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
              value={draft.vendor}
              onChange={(e) => {
                const vendor = e.target.value as ProviderVendor;
                updateDraft({
                  vendor,
                  catalogId: "",
                  baseUrl: VENDOR_DEFAULT_BASE_URL[vendor],
                  defaultModel: VENDOR_DEFAULT_MODEL[vendor],
                });
              }}
            >
              {VENDOR_OPTIONS.map((vendor) => (
                <option key={vendor.value} value={vendor.value}>
                  {t(vendor.label)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2" htmlFor="onboarding-provider-default-model">
            <span className="text-sm font-medium text-ink-300">
              {t("onboarding.provider.defaultModel")}
            </span>
            <input
              id="onboarding-provider-default-model"
              list="onboarding-provider-models"
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
              value={draft.defaultModel}
              onChange={(e) => updateDraft({ defaultModel: e.target.value })}
            />
            {knownModels.length > 0 && (
              <datalist id="onboarding-provider-models">
                {knownModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            )}
          </label>
        </div>

        <label className="block space-y-2" htmlFor="onboarding-provider-api-key">
          <span className="text-sm font-medium text-ink-300">{t("onboarding.provider.apiKey")}</span>
          <input
            id="onboarding-provider-api-key"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            type="password"
            placeholder={
              draft.vendor === "anthropic"
                ? t("onboarding.provider.apiKeyPlaceholderAnthropic")
                : t("onboarding.provider.apiKeyPlaceholderOptional")
            }
            value={draft.apiKey}
            onChange={(e) => updateDraft({ apiKey: e.target.value })}
          />
        </label>

        <label className="block space-y-2" htmlFor="onboarding-provider-base-url">
          <span className="text-sm font-medium text-ink-300">{t("onboarding.provider.baseUrl")}</span>
          <input
            id="onboarding-provider-base-url"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
            placeholder={
              draft.vendor === "openai-compat"
                ? t("onboarding.provider.baseUrlPlaceholderCompat")
                : t("onboarding.provider.baseUrlPlaceholderDefault")
            }
            value={draft.baseUrl}
            onChange={(e) => updateDraft({ baseUrl: e.target.value })}
          />
        </label>

        <AnimatePresence initial={false}>
          {errorMessage && (
            <motion.div
              className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
              role="alert"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {errorMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
