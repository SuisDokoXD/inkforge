export type Lang = "zh" | "en" | "ja";

export const SUPPORTED_LANGS: readonly Lang[] = ["zh", "en", "ja"] as const;

export function isLang(v: unknown): v is Lang {
  return v === "zh" || v === "en" || v === "ja";
}

export function coerceLang(v: unknown, fallback: Lang = "zh"): Lang {
  return isLang(v) ? v : fallback;
}

export function getAnalysisThreshold(lang: Lang): number {
  switch (lang) {
    case "zh":
      return 200;
    case "en":
      return 400;
    case "ja":
      return 500;
  }
}

/**
 * Count meaningful units for analysis threshold:
 *  - zh/ja: graphemes that include letters/digits
 *  - en:    whitespace-separated words
 *
 * Intl.Segmenter is available in Node 16+ and modern Chromium (Electron 30+).
 */
export function countUnits(text: string, lang: Lang): number {
  if (!text) return 0;
  if (lang === "en") {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
  if (typeof Intl !== "undefined" && typeof (Intl as { Segmenter?: unknown }).Segmenter === "function") {
    type SegmenterCtor = new (lang: string, opts: { granularity: "grapheme" }) => {
      segment(s: string): Iterable<{ segment: string }>;
    };
    const SegmenterImpl = (Intl as unknown as { Segmenter: SegmenterCtor }).Segmenter;
    const seg = new SegmenterImpl(lang, { granularity: "grapheme" });
    let n = 0;
    for (const s of seg.segment(text)) {
      if (/\p{L}|\p{N}/u.test(s.segment)) n += 1;
    }
    return n;
  }
  // Fallback: count non-whitespace chars
  return [...text].filter((ch) => !/\s/.test(ch)).length;
}

/**
 * Count the three stats for the StatusBar: Chinese/Japanese chars,
 * English words, and a rough token estimate (~4 chars per token).
 */
export interface WordStats {
  cjk: number;
  en: number;
  tokens: number;
}

export function computeWordStats(text: string): WordStats {
  if (!text) return { cjk: 0, en: 0, tokens: 0 };
  const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length;
  const tokens = Math.ceil(text.length / 4);
  return { cjk, en, tokens };
}

type Resources = Record<string, Record<Lang, string>>;

export const i18nResources: Resources = {
  // Common
  "common.save": { zh: "保存", en: "Save", ja: "保存" },
  "common.cancel": { zh: "取消", en: "Cancel", ja: "キャンセル" },
  "common.confirm": { zh: "确定", en: "Confirm", ja: "確定" },
  "common.delete": { zh: "删除", en: "Delete", ja: "削除" },
  "common.edit": { zh: "编辑", en: "Edit", ja: "編集" },
  "common.close": { zh: "关闭", en: "Close", ja: "閉じる" },
  "common.loading": { zh: "加载中…", en: "Loading…", ja: "読み込み中…" },
  "common.retry": { zh: "重试", en: "Retry", ja: "再試行" },
  "common.copy": { zh: "复制", en: "Copy", ja: "コピー" },
  "common.search": { zh: "搜索", en: "Search", ja: "検索" },
  "common.settings": { zh: "设置", en: "Settings", ja: "設定" },
  "common.back": { zh: "返回", en: "Back", ja: "戻る" },
  "common.next": { zh: "下一步", en: "Next", ja: "次へ" },
  "common.finish": { zh: "完成", en: "Finish", ja: "完了" },
  "common.open": { zh: "打开", en: "Open", ja: "開く" },
  "common.refresh": { zh: "刷新", en: "Refresh", ja: "更新" },
  "common.new": { zh: "新建", en: "New", ja: "新規" },
  "common.install": { zh: "安装", en: "Install", ja: "インストール" },
  "common.enable": { zh: "启用", en: "Enable", ja: "有効化" },
  "common.disable": { zh: "禁用", en: "Disable", ja: "無効化" },

  // App brand
  "app.name": { zh: "墨炉 · InkForge", en: "InkForge", ja: "InkForge" },
  "app.tagline": {
    zh: "小说创作工作台",
    en: "A novel writing workbench with AI companions",
    ja: "AI が静かに寄り添う小説創作ワークベンチ",
  },

  // ActivityBar / pages
  "page.workspace": { zh: "写作", en: "Write", ja: "執筆" },
  "page.skill": { zh: "写作指令", en: "Writing Instructions", ja: "執筆指示" },
  "page.character": { zh: "角色", en: "Characters", ja: "キャラ" },
  "page.tavern": { zh: "酒馆", en: "Tavern", ja: "酒場" },
  "page.world": { zh: "世界观", en: "Worldbuilding", ja: "世界設定" },
  "page.research": { zh: "资料", en: "Research", ja: "資料" },
  "page.review": { zh: "审查", en: "Review", ja: "レビュー" },

  // Editor
  "editor.placeholder": {
    zh: "开始写作…",
    en: "Start writing…",
    ja: "執筆を始めましょう…",
  },
  "editor.newChapter": { zh: "新建章节", en: "New chapter", ja: "新しい章" },
  "editor.import": { zh: "导入", en: "Import", ja: "インポート" },
  "editor.export": { zh: "导出", en: "Export", ja: "エクスポート" },

  // Crash recovery banner
  "crashBanner.title": { zh: "上次未正常退出", en: "Unclean shutdown detected", ja: "前回は正常に終了しませんでした" },
  "crashBanner.body": {
    zh: "工作区已自动恢复；如有异常请从「帮助 → 复制排查信息」导出信息。",
    en: "Workspace auto-recovered; if anything looks off, export a snapshot from Developer → Diagnostics.",
    ja: "ワークスペースは自動復旧済み。問題があれば「開発者 → 診断スナップショット」で出力してください。",
  },
  "crashBanner.dismiss": { zh: "我知道了", en: "Dismiss", ja: "閉じる" },
  "crashBanner.showDetails": { zh: "查看详情", en: "Show details", ja: "詳細を表示" },
  "crashBanner.hideDetails": { zh: "收起", en: "Hide", ja: "閉じる" },

  // Settings
  "settings.title": { zh: "设置", en: "Settings", ja: "設定" },
  "settings.section.writing": { zh: "写作", en: "Writing", ja: "執筆" },
  "settings.section.appearance": { zh: "外观", en: "Appearance", ja: "外観" },
  "settings.section.advanced": { zh: "高级", en: "Advanced", ja: "詳細設定" },
  "settings.analysisEnabled": { zh: "启用后台写作分析", en: "Enable background AI analysis", ja: "バックグラウンド AI 解析を有効化" },
  "settings.analysisThreshold": { zh: "分析触发阈值", en: "Analysis threshold", ja: "解析トリガー閾値" },
  "settings.analysisThresholdHint": {
    zh: "每写 {{n}} 字触发一次（阈值随语言自动变化）",
    en: "Fires every {{n}} words (auto-adapts to language)",
    ja: "{{n}} 文字ごとに発火（言語に応じて自動調整）",
  },
  "settings.uiLanguage": { zh: "界面语言", en: "UI language", ja: "表示言語" },
  "settings.theme": { zh: "主题", en: "Theme", ja: "テーマ" },
  "settings.theme.dark": { zh: "深色", en: "Dark", ja: "ダーク" },
  "settings.theme.light": { zh: "浅色", en: "Light", ja: "ライト" },
  "settings.theme.paper": { zh: "纸感", en: "Paper", ja: "紙" },
  "settings.devMode": { zh: "启用排查工具", en: "Enable developer mode", ja: "開発者モードを有効化" },
  "settings.devModeHint": {
    zh: "显示排查菜单、排查摘要与内嵌终端入口",
    en: "Shows the Developer menu, diagnostic snapshot, and embedded terminal",
    ja: "開発者メニュー、診断スナップショット、内蔵ターミナルを表示",
  },

  // Status bar
  "status.words": { zh: "字数", en: "Words", ja: "文字数" },
  "status.dailyGoal": { zh: "今日目标", en: "Daily goal", ja: "本日の目標" },
  "status.analysisOff": { zh: "分析已关闭", en: "Analysis off", ja: "解析オフ" },

  // Onboarding
  "onboarding.step.welcome": { zh: "欢迎", en: "Welcome", ja: "ようこそ" },
  "onboarding.step.language": { zh: "选择语言", en: "Pick a language", ja: "言語を選択" },
  "onboarding.step.workspace": { zh: "工作目录", en: "Workspace", ja: "作業フォルダ" },
  "onboarding.step.provider": { zh: "模型服务", en: "AI Provider", ja: "AI プロバイダ" },
  "onboarding.step.sample": { zh: "示例项目", en: "Sample project", ja: "サンプル" },
  "onboarding.step.done": { zh: "完成", en: "All set", ja: "完了" },
  "onboarding.language.title": {
    zh: "先选一下界面语言",
    en: "Pick your UI language",
    ja: "UI の言語を選びましょう",
  },
  "onboarding.language.note": {
    zh: "之后可以在「设置 → 写作」里随时切换。",
    en: "You can switch any time from Settings → Writing.",
    ja: "「設定 → 執筆」からいつでも切り替え可能です。",
  },

  // Errors
  // Onboarding provider (M6 catalog integration)
  "onboarding.provider.title": {
    zh: "配置模型服务",
    en: "Configure AI Provider",
    ja: "AI プロバイダー設定",
  },
  "onboarding.provider.subtitle": {
    zh: "可直接选择 DeepSeek、Kimi、Qwen、Groq、OpenRouter、Ollama 等预设。",
    en: "Choose a preset for DeepSeek, Kimi, Qwen, Groq, OpenRouter, Ollama, and more.",
    ja: "DeepSeek、Kimi、Qwen、Groq、OpenRouter、Ollama などのプリセットを選択できます。",
  },
  "onboarding.provider.preset": { zh: "模型服务预设", en: "Provider Preset", ja: "プロバイダー プリセット" },
  "onboarding.provider.custom": { zh: "自定义", en: "Custom", ja: "カスタム" },
  "onboarding.provider.name": { zh: "服务名称", en: "Provider Name", ja: "プロバイダー名" },
  "onboarding.provider.vendor": { zh: "厂商类型", en: "Vendor", ja: "ベンダー" },
  "onboarding.provider.defaultModel": { zh: "默认模型", en: "Default Model", ja: "デフォルトモデル" },
  "onboarding.provider.apiKey": { zh: "服务密钥", en: "API Key", ja: "API キー" },
  "onboarding.provider.apiKeyPlaceholderAnthropic": { zh: "粘贴服务密钥", en: "sk-ant-...", ja: "sk-ant-..." },
  "onboarding.provider.apiKeyPlaceholderOptional": {
    zh: "服务密钥（本地兼容服务可选）",
    en: "API key (optional for local openai-compat)",
    ja: "API キー（ローカル openai-compat では任意）",
  },
  "onboarding.provider.baseUrl": {
    zh: "接口地址（通用兼容服务必填）",
    en: "Base URL (optional unless openai-compat)",
    ja: "Base URL（openai-compat の場合は必須）",
  },
  "onboarding.provider.baseUrlPlaceholderCompat": {
    zh: "https://api.deepseek.com/v1",
    en: "https://api.deepseek.com/v1",
    ja: "https://api.deepseek.com/v1",
  },
  "onboarding.provider.baseUrlPlaceholderDefault": {
    zh: "留空则使用厂商默认端点",
    en: "Leave empty to use vendor default",
    ja: "空欄でベンダー既定のエンドポイントを使用",
  },
  "onboarding.error.apiKeyRequired": {
    zh: "该模型服务需要填写服务密钥。",
    en: "API key is required for this provider.",
    ja: "このプロバイダーでは API キーが必要です。",
  },
  "onboarding.error.baseUrlRequired": {
    zh: "通用兼容模型服务必须填写接口地址。",
    en: "Base URL is required for OpenAI-compatible providers.",
    ja: "OpenAI-compatible プロバイダーでは Base URL が必要です。",
  },
  "onboarding.error.projectNameRequired": {
    zh: "项目名称不能为空。",
    en: "Project name cannot be empty.",
    ja: "プロジェクト名は空にできません。",
  },
  "onboarding.action.working": { zh: "处理中...", en: "Working...", ja: "処理中..." },
  "onboarding.action.openApp": { zh: "进入应用", en: "Open App", ja: "アプリを開く" },

  // Provider panel + catalog
  "provider.vendor.anthropic": { zh: "Anthropic", en: "Anthropic", ja: "Anthropic" },
  "provider.vendor.openai": { zh: "OpenAI", en: "OpenAI", ja: "OpenAI" },
  "provider.vendor.gemini": { zh: "Gemini", en: "Gemini", ja: "Gemini" },
  "provider.vendor.openaiCompat": { zh: "通用兼容", en: "OpenAI-Compatible", ja: "OpenAI-Compatible" },
  "provider.action.getApiKey": { zh: "获取服务密钥", en: "Get API key", ja: "API キーを取得" },
  "provider.panel.listTitle": { zh: "模型服务", en: "Providers", ja: "プロバイダー" },
  "provider.panel.noProviders": {
    zh: "暂无模型服务。请在右侧创建一个。",
    en: "No providers yet. Create one on the right.",
    ja: "プロバイダーがありません。右側で作成してください。",
  },
  "provider.panel.active": { zh: "使用中", en: "Active", ja: "使用中" },
  "provider.panel.title": { zh: "模型服务设置", en: "Provider Settings", ja: "プロバイダー設定" },
  "provider.panel.subtitle": {
    zh: "支持主流模型服务，也可以接入自定义兼容接口。",
    en: "Supports Anthropic/OpenAI/Gemini and all OpenAI-compatible endpoints.",
    ja: "Anthropic/OpenAI/Gemini と OpenAI-compatible エンドポイントをサポートします。",
  },
  "provider.panel.preset": { zh: "预设", en: "Preset", ja: "プリセット" },
  "provider.panel.custom": { zh: "自定义", en: "Custom", ja: "カスタム" },
  "provider.panel.displayName": { zh: "显示名称", en: "Display Name", ja: "表示名" },
  "provider.panel.vendor": { zh: "厂商类型", en: "Vendor", ja: "ベンダー" },
  "provider.panel.defaultModel": { zh: "默认模型", en: "Default Model", ja: "デフォルトモデル" },
  "provider.panel.baseUrl": { zh: "接口地址", en: "Base URL", ja: "Base URL" },
  "provider.panel.optional": { zh: "可选", en: "Optional", ja: "任意" },
  "provider.panel.apiKey": { zh: "服务密钥", en: "API Key", ja: "API キー" },
  "provider.panel.apiKeyKeepExisting": {
    zh: "留空保持现有密钥",
    en: "leave empty to keep existing key",
    ja: "空欄で既存キーを保持",
  },
  "provider.panel.tags": { zh: "标签（空格分隔）", en: "Tags (space separated)", ja: "タグ（スペース区切り）" },
  "provider.panel.error.baseUrlRequired": {
    zh: "通用兼容模型服务必须填写接口地址。",
    en: "Base URL is required for openai-compat providers.",
    ja: "openai-compat プロバイダーでは Base URL が必要です。",
  },
  "provider.panel.label.untitled": { zh: "未命名模型服务", en: "Untitled provider", ja: "名称未設定プロバイダー" },
  "provider.panel.saved": { zh: "已保存。", en: "Saved.", ja: "保存しました。" },
  "provider.panel.unknownError": { zh: "服务暂无更多错误信息", en: "unknown error", ja: "不明なエラー" },
  "provider.panel.status.connected": {
    zh: "连接成功，用时 {{ms}} 毫秒。",
    en: "Connected in {{ms}}ms.",
    ja: "{{ms}}ms で接続成功。",
  },
  "provider.panel.status.failed": {
    zh: "连接失败：{{error}}",
    en: "Connection failed: {{error}}",
    ja: "接続失敗: {{error}}",
  },
  "provider.panel.testing": { zh: "测试中...", en: "Testing...", ja: "テスト中..." },
  "provider.panel.testConnection": { zh: "连接测试", en: "Test Connection", ja: "接続テスト" },
  "provider.panel.setActive": { zh: "设为使用中", en: "Set Active", ja: "使用中に設定" },
  "provider.panel.confirmDelete": {
    zh: "确认删除模型服务「{{label}}」？",
    en: "Delete provider \"{{label}}\"?",
    ja: "プロバイダー「{{label}}」を削除しますか？",
  },
  "provider.panel.saving": { zh: "保存中...", en: "Saving...", ja: "保存中..." },
  "provider.panel.saveChanges": { zh: "保存修改", en: "Save Changes", ja: "変更を保存" },
  "provider.panel.create": { zh: "创建", en: "Create", ja: "作成" },

  // Catalog descriptions
  "provider.catalog.anthropic.description": {
    zh: "Claude 模型，长上下文写作能力强。",
    en: "Claude models with strong long-context writing performance.",
    ja: "長文コンテキストに強い Claude モデル。",
  },
  "provider.catalog.openai.description": {
    zh: "GPT 模型家族，接口与工具链生态完善。",
    en: "GPT models with broad API/tooling support.",
    ja: "API とツール連携が広い GPT モデル群。",
  },
  "provider.catalog.gemini.description": {
    zh: "Gemini 模型，多模态能力强，免费层友好。",
    en: "Gemini family with strong multimodal and free-tier options.",
    ja: "マルチモーダルに強く、無料枠も使いやすい Gemini。",
  },
  "provider.catalog.deepseek.description": {
    zh: "DeepSeek 聊天/推理模型，通过通用兼容接口接入。",
    en: "DeepSeek chat/reasoning models via OpenAI-compatible API.",
    ja: "OpenAI-compatible API で使える DeepSeek。",
  },
  "provider.catalog.moonshot.description": {
    zh: "Kimi 长上下文模型，适合中文长文。",
    en: "Kimi long-context models for Chinese-first workflows.",
    ja: "中国語長文に向く Kimi 長文コンテキストモデル。",
  },
  "provider.catalog.qwen.description": {
    zh: "阿里 Qwen，DashScope 提供通用兼容接口。",
    en: "Alibaba Qwen models exposed with OpenAI-compatible endpoints.",
    ja: "DashScope 経由で使える Qwen モデル。",
  },
  "provider.catalog.zhipu.description": {
    zh: "Zhipu GLM 模型，通过通用兼容方式接入。",
    en: "GLM models from Zhipu with OpenAI-style integration.",
    ja: "OpenAI 互換で利用できる Zhipu GLM。",
  },
  "provider.catalog.minimax.description": {
    zh: "MiniMax 文本模型，支持通用兼容接口。",
    en: "MiniMax text models with OpenAI-compatible APIs.",
    ja: "OpenAI-compatible API で使える MiniMax。",
  },
  "provider.catalog.baichuan.description": {
    zh: "Baichuan 托管接口，通过通用兼容方式接入。",
    en: "Baichuan hosted API with OpenAI-compatible routing.",
    ja: "OpenAI 互換ルーティングで使える Baichuan。",
  },
  "provider.catalog.stepfun.description": {
    zh: "StepFun 模型，支持通用兼容接口。",
    en: "StepFun models exposed through OpenAI-compatible endpoints.",
    ja: "OpenAI-compatible エンドポイントで使える StepFun。",
  },
  "provider.catalog.siliconflow.description": {
    zh: "聚合型平台，一个通用兼容接口可接入多种开源模型。",
    en: "Open-model aggregator behind a single OpenAI-compatible endpoint.",
    ja: "1 つの OpenAI-compatible エンドポイントで複数 OSS モデルを利用。",
  },
  "provider.catalog.groq.description": {
    zh: "低延迟推理，通过通用兼容接口访问。",
    en: "Ultra-low latency inference exposed via OpenAI-compatible APIs.",
    ja: "低遅延推論を OpenAI-compatible API で利用可能。",
  },
  "provider.catalog.together.description": {
    zh: "托管开源模型目录大，支持通用兼容接入。",
    en: "Large hosted open-source catalog via OpenAI-compatible APIs.",
    ja: "多数の OSS モデルを OpenAI-compatible API で提供。",
  },
  "provider.catalog.fireworks.description": {
    zh: "高性能托管开源模型，通过通用兼容方式调用。",
    en: "Fast hosted open models with OpenAI-compatible integration.",
    ja: "高速な OSS モデルを OpenAI-compatible で利用可能。",
  },
  "provider.catalog.mistral.description": {
    zh: "Mistral 官方托管接口，支持通用兼容调用。",
    en: "Mistral hosted APIs with OpenAI-compatible behavior.",
    ja: "OpenAI-compatible 挙動の Mistral 公式 API。",
  },
  "provider.catalog.xai.description": {
    zh: "xAI Grok，提供通用兼容接口。",
    en: "Grok models from xAI via OpenAI-compatible endpoints.",
    ja: "xAI の Grok を OpenAI-compatible API で利用。",
  },
  "provider.catalog.openrouter.description": {
    zh: "单密钥接入多家模型的聚合网关。",
    en: "Single API key gateway for many model vendors.",
    ja: "1 つのキーで多数ベンダーに接続できるゲートウェイ。",
  },
  "provider.catalog.perplexity.description": {
    zh: "Perplexity Sonar，检索增强回答。",
    en: "Search-grounded Sonar models exposed via OpenAI-compatible APIs.",
    ja: "検索連携型 Sonar モデルを OpenAI-compatible API で利用。",
  },
  "provider.catalog.cerebras.description": {
    zh: "Cerebras 托管 Llama，支持通用兼容接口。",
    en: "Cerebras-hosted Llama models with OpenAI-compatible APIs.",
    ja: "Cerebras 提供の Llama を OpenAI-compatible API で利用。",
  },
  "provider.catalog.ollama.description": {
    zh: "本地运行开源模型，无需云端依赖。",
    en: "Run local open-source models with no cloud dependency.",
    ja: "クラウド不要でローカル OSS モデルを実行。",
  },
  "provider.catalog.lmstudio.description": {
    zh: "通过 LM Studio 本地服务，以通用兼容方式接入。",
    en: "Use LM Studio local server via OpenAI-compatible APIs.",
    ja: "LM Studio のローカルサーバーを OpenAI-compatible API で利用。",
  },
  "provider.catalog.vllm.description": {
    zh: "任意通用兼容接口，手动填写接口地址与模型。",
    en: "Use any OpenAI-compatible endpoint by filling in base URL/model manually.",
    ja: "任意の OpenAI-compatible エンドポイントを手動設定で利用。",
  },

  "error.generic": { zh: "出错了", en: "Something went wrong", ja: "エラーが発生しました" },
  "error.boundary.title": {
    zh: "此区域暂时无法显示",
    en: "This area could not render",
    ja: "この領域を表示できません",
  },
  "error.boundary.copyDiag": {
    zh: "复制排查信息",
    en: "Copy diagnostic snapshot",
    ja: "診断スナップショットをコピー",
  },
  // M9 Phase 1.2: navigation labels (ActivityBar) + app loading + shortcut display + replay onboarding
  "nav.aria.label":  { zh: "主导航", en: "Main navigation", ja: "メインナビゲーション" },
  "nav.writing":     { zh: "写作", en: "Write", ja: "執筆" },
  "nav.outline":     { zh: "大纲", en: "Outline", ja: "アウトライン" },
  "nav.skill":       { zh: "写作指令", en: "Writing Instructions", ja: "執筆指示" },
  "nav.character":   { zh: "人物", en: "Characters", ja: "キャラクター" },
  "nav.tavern":      { zh: "酒馆", en: "Tavern", ja: "酒場" },
  "nav.world":       { zh: "世界观", en: "World", ja: "世界観" },
  "nav.research":    { zh: "资料", en: "Research", ja: "資料" },
  "nav.review":      { zh: "审查", en: "Review", ja: "レビュー" },
  "nav.bookshelf":   { zh: "书房", en: "Bookshelf", ja: "本棚" },
  "nav.letters":     { zh: "来信", en: "Letters", ja: "手紙" },
  "nav.achievement": { zh: "成就", en: "Achievements", ja: "アチーブメント" },
  "nav.autoWriter":  { zh: "续写精修", en: "Continue & Polish", ja: "続きを整える" },
  "nav.materials":   { zh: "素材库", en: "Materials", ja: "素材ライブラリ" },
  "app.loading":     { zh: "正在打开 InkForge…", en: "Opening InkForge…", ja: "InkForge を起動中…" },
  "shortcut.settings":        { zh: "设置", en: "Settings", ja: "設定" },
  "shortcut.providers":       { zh: "模型服务面板", en: "Providers panel", ja: "Provider パネル" },
  "shortcut.terminal":        { zh: "切换终端", en: "Toggle terminal", ja: "ターミナル切替" },
  "shortcut.commandPalette":  { zh: "命令面板", en: "Command palette", ja: "コマンドパレット" },
  "settings.replayOnboarding":     { zh: "重新观看新手引导", en: "Replay onboarding", ja: "オンボーディングをもう一度" },
  "settings.replayOnboarding.hint":{ zh: "重走工作目录 / 模型服务 / 写作指令 / 项目 五步向导", en: "Walk through workspace / provider / writing instruction / project setup again", ja: "ワークスペース / Provider / 執筆指示 / プロジェクトの初期化をやり直す" },
  // M9 Phase 3.1: command palette
  "palette.aria.label":     { zh: "命令面板", en: "Command palette", ja: "コマンドパレット" },
  "palette.placeholder":    { zh: "输入命令、跳转或动作…", en: "Type a command, jump or action…", ja: "コマンドを入力…" },
  "palette.empty":          { zh: "未找到匹配的命令", en: "No matching command", ja: "一致するコマンドがありません" },
  "palette.group.navigate": { zh: "跳转", en: "Navigate", ja: "ジャンプ" },
  "palette.group.action":   { zh: "动作", en: "Actions", ja: "アクション" },
  "palette.group.tool":     { zh: "工具", en: "Tools", ja: "ツール" },
  // M9 Phase 4.3: HelpMenu + ShortcutCheatSheet
  "help.menu.title":            { zh: "帮助", en: "Help", ja: "ヘルプ" },
  "help.menu.replayOnboarding": { zh: "重看新手引导", en: "Replay onboarding", ja: "オンボーディングをもう一度" },
  "help.menu.shortcuts":        { zh: "快捷键速查", en: "Keyboard shortcuts", ja: "ショートカット一覧" },
  "help.menu.docs":             { zh: "打开文档", en: "Open docs", ja: "ドキュメントを開く" },
  "help.menu.copyDiag":         { zh: "复制排查信息", en: "Copy diagnostic snapshot", ja: "診断スナップショットをコピー" },
  "help.shortcuts.title":       { zh: "快捷键速查表", en: "Shortcut cheat sheet", ja: "ショートカット一覧" },
  "help.shortcuts.navigation":  { zh: "导航", en: "Navigation", ja: "ナビゲーション" },
  "help.shortcuts.actions":     { zh: "动作", en: "Actions", ja: "アクション" },
  "help.shortcuts.newChapter":  { zh: "新建章节", en: "New chapter", ja: "新しい章" },
  "help.shortcuts.forceAnalyze":{ zh: "强制写作分析", en: "Force AI analysis", ja: "AI 分析を強制" },
  // M9 Phase 6: 诊断面板
  "settings.diag.title":   { zh: "性能与排查", en: "Performance & diagnostics", ja: "パフォーマンスと診断" },
  "settings.diag.show":    { zh: "查看", en: "Show", ja: "表示" },
  "settings.diag.refresh": { zh: "刷新", en: "Refresh", ja: "更新" },
  "settings.diag.hint":    { zh: "点右上「查看」生成排查摘要（含启动耗时 / 数据库大小 / 处理器 / 近期错误）。", en: "Click Show to generate a diagnostic snapshot (startup time, DB size, CPU, recent errors).", ja: "「表示」をクリックして診断スナップショットを生成。" },
};

/**
 * Translate `key` using UI `lang`. Falls back to zh, then raw key.
 * Replaces `{{var}}` placeholders when `params` provided.
 */
export function t(
  key: string,
  lang: Lang,
  params?: Record<string, string | number>,
): string {
  const entry = i18nResources[key];
  let value: string;
  if (!entry) {
    value = key;
  } else {
    value = entry[lang] ?? entry.zh ?? key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
    }
  }
  return value;
}

/** List known keys (for verify:i18n). */
export function listI18nKeys(): string[] {
  return Object.keys(i18nResources);
}
