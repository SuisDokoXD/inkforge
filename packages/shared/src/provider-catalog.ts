import type { ProviderVendor } from "./domain";

/**
 * Curated provider catalog used by onboarding and provider settings.
 * Runtime routing is still decided by `vendor` in the persisted provider.
 */
export interface ProviderCatalogEntry {
  /** Stable id used by UI presets. */
  id: string;
  /** Label shown to users. */
  label: string;
  /** Adapter family used by runtime createProvider(). */
  vendor: ProviderVendor;
  /** Canonical service address (may be empty for custom entries). */
  baseUrl: string;
  /** Suggested model when creating from this preset. */
  defaultModel: string;
  /** Known model ids surfaced in model suggestions. */
  knownModels: string[];
  /** Service-key signup page shown in UI. */
  signupUrl?: string;
  /** One-line explanation for UI hint text. */
  description: string;
  /** Optional tags for future filtering/grouping. */
  tags?: string[];
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    vendor: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    knownModels: [
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ],
    signupUrl: "https://console.anthropic.com/",
    description: "Claude models with strong long-context writing performance.",
    tags: ["flagship", "long-context"],
  },
  {
    id: "openai",
    label: "OpenAI",
    vendor: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    knownModels: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o3-mini"],
    signupUrl: "https://platform.openai.com/",
    description: "GPT models with broad service and tooling support.",
    tags: ["flagship"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    vendor: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.0-flash",
    knownModels: [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.0-pro-exp",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
    signupUrl: "https://aistudio.google.com/apikey",
    description: "Gemini family with strong multimodal and free-tier options.",
    tags: ["flagship", "free-tier"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    vendor: "openai-compat",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    knownModels: ["deepseek-chat", "deepseek-reasoner"],
    signupUrl: "https://platform.deepseek.com/",
    description: "DeepSeek chat/reasoning models through a compatible interface.",
    tags: ["openai-compat", "budget"],
  },
  {
    id: "moonshot",
    label: "Moonshot Kimi",
    vendor: "openai-compat",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-32k",
    knownModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2-0905-preview"],
    signupUrl: "https://platform.moonshot.cn/",
    description: "Kimi long-context models for Chinese-first workflows.",
    tags: ["openai-compat", "long-context"],
  },
  {
    id: "qwen",
    label: "Qwen (DashScope)",
    vendor: "openai-compat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    knownModels: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen2.5-72b-instruct"],
    signupUrl: "https://dashscope.console.aliyun.com/",
    description: "Alibaba Qwen models through DashScope's compatible interface.",
    tags: ["openai-compat"],
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    vendor: "openai-compat",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus",
    knownModels: ["glm-4-plus", "glm-4-air", "glm-4-flash", "glm-4-long"],
    signupUrl: "https://open.bigmodel.cn/",
    description: "GLM models from Zhipu with compatible integration.",
    tags: ["openai-compat"],
  },
  {
    id: "minimax",
    label: "MiniMax",
    vendor: "openai-compat",
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "abab6.5s-chat",
    knownModels: ["abab6.5s-chat", "abab6.5g-chat", "MiniMax-Text-01"],
    signupUrl: "https://www.minimaxi.com/",
    description: "MiniMax text models with compatible service access.",
    tags: ["openai-compat"],
  },
  {
    id: "baichuan",
    label: "Baichuan",
    vendor: "openai-compat",
    baseUrl: "https://api.baichuan-ai.com/v1",
    defaultModel: "Baichuan4",
    knownModels: ["Baichuan4", "Baichuan3-Turbo", "Baichuan3-Turbo-128k"],
    signupUrl: "https://platform.baichuan-ai.com/",
    description: "Baichuan hosted service with compatible access.",
    tags: ["openai-compat"],
  },
  {
    id: "stepfun",
    label: "StepFun",
    vendor: "openai-compat",
    baseUrl: "https://api.stepfun.com/v1",
    defaultModel: "step-1-32k",
    knownModels: ["step-1-32k", "step-1-128k", "step-2-16k"],
    signupUrl: "https://platform.stepfun.com/",
    description: "StepFun models through a compatible interface.",
    tags: ["openai-compat", "long-context"],
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    vendor: "openai-compat",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    knownModels: [
      "deepseek-ai/DeepSeek-V3",
      "Qwen/Qwen2.5-72B-Instruct",
      "meta-llama/Meta-Llama-3.1-70B-Instruct",
      "01-ai/Yi-1.5-34B-Chat",
    ],
    signupUrl: "https://siliconflow.cn/",
    description: "Open-model hub behind one compatible service address.",
    tags: ["openai-compat", "aggregator", "open-source"],
  },
  {
    id: "groq",
    label: "Groq",
    vendor: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    knownModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "qwen-qwq-32b",
    ],
    signupUrl: "https://console.groq.com/",
    description: "Ultra-low latency inference through a compatible interface.",
    tags: ["openai-compat", "fast"],
  },
  {
    id: "together",
    label: "Together AI",
    vendor: "openai-compat",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    knownModels: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-V3",
    ],
    signupUrl: "https://api.together.xyz/",
    description: "Large hosted open-source catalog with compatible access.",
    tags: ["openai-compat", "aggregator", "open-source"],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    vendor: "openai-compat",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    knownModels: [
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
      "accounts/fireworks/models/llama-v3p1-405b-instruct",
      "accounts/fireworks/models/qwen2p5-72b-instruct",
      "accounts/fireworks/models/deepseek-v3",
    ],
    signupUrl: "https://fireworks.ai/",
    description: "Fast hosted open models with compatible integration.",
    tags: ["openai-compat", "fast", "open-source"],
  },
  {
    id: "mistral",
    label: "Mistral",
    vendor: "openai-compat",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    knownModels: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
      "open-mistral-nemo",
      "codestral-latest",
    ],
    signupUrl: "https://console.mistral.ai/",
    description: "Mistral hosted service with compatible behavior.",
    tags: ["openai-compat"],
  },
  {
    id: "xai",
    label: "xAI Grok",
    vendor: "openai-compat",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    knownModels: ["grok-2-latest", "grok-2-vision-latest", "grok-beta"],
    signupUrl: "https://x.ai/",
    description: "Grok models from xAI through a compatible interface.",
    tags: ["openai-compat", "flagship"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    vendor: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4-6",
    knownModels: [
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-opus-4-7",
      "openai/gpt-4.1",
      "deepseek/deepseek-chat",
      "google/gemini-2.0-flash-exp",
    ],
    signupUrl: "https://openrouter.ai/",
    description: "Single service-key gateway for many model services.",
    tags: ["openai-compat", "aggregator"],
  },
  {
    id: "perplexity",
    label: "Perplexity Sonar",
    vendor: "openai-compat",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar",
    knownModels: ["sonar", "sonar-pro", "sonar-reasoning", "sonar-reasoning-pro"],
    signupUrl: "https://www.perplexity.ai/",
    description: "Search-grounded Sonar models through a compatible interface.",
    tags: ["openai-compat", "search-grounded"],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    vendor: "openai-compat",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    knownModels: ["llama-3.3-70b", "llama3.1-8b"],
    signupUrl: "https://cerebras.ai/",
    description: "Cerebras-hosted Llama models with compatible access.",
    tags: ["openai-compat", "fast"],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    vendor: "openai-compat",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:14b",
    knownModels: ["qwen2.5:14b", "qwen2.5:32b", "llama3.1:8b", "deepseek-r1:14b", "mistral:7b"],
    signupUrl: "https://ollama.com/",
    description: "Run local open-source models with no cloud dependency.",
    tags: ["openai-compat", "local", "free"],
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    vendor: "openai-compat",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    knownModels: ["local-model"],
    signupUrl: "https://lmstudio.ai/",
    description: "Use the LM Studio local server through a compatible interface.",
    tags: ["openai-compat", "local", "free"],
  },
  {
    id: "vllm",
    label: "自定义兼容接口",
    vendor: "openai-compat",
    baseUrl: "",
    defaultModel: "",
    knownModels: [],
    description: "Use any compatible model service by filling in the interface address and model manually.",
    tags: ["openai-compat", "custom"],
  },
];

export function findCatalogEntry(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((entry) => entry.id === id);
}

export function listCatalogVendors(vendor: ProviderVendor): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((entry) => entry.vendor === vendor);
}
