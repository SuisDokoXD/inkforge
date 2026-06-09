import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SkillDefinition,
  SkillOutputTarget,
  SkillScope,
  SkillTriggerDef,
  SkillTriggerType,
  SkillVariableDef,
} from "@inkforge/shared";
import { renderSkillTemplate } from "@inkforge/skill-engine";
import { fsApi, skillApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { SkillMarketDialog } from "../components/SkillMarketDialog";
import { SkillPublishDialog } from "../components/SkillPublishDialog";

const SCOPE_LABELS: Record<SkillScope, string> = {
  global: "全局",
  project: "项目",
  community: "社区",
};

const OUTPUT_LABELS: Record<SkillOutputTarget, string> = {
  "ai-feedback": "写入时间线",
  "replace-selection": "替换选中",
  "insert-after-selection": "插入到选中后",
  "append-chapter": "追加到章末",
};

const TRIGGER_LABELS: Record<SkillTriggerType, string> = {
  selection: "选中文本",
  "every-n-chars": "每 N 字自动",
  "on-save": "章节保存",
  "on-chapter-end": "章节末尾",
  manual: "手动触发",
};

const ALL_TRIGGERS: SkillTriggerType[] = [
  "selection",
  "every-n-chars",
  "on-save",
  "on-chapter-end",
  "manual",
];

const TRIGGER_DESCRIPTIONS: Record<SkillTriggerType, string> = {
  selection: "选中文本后从悬浮工具条运行，适合润色、改写、局部审校。",
  "every-n-chars": "写到一定字数后自动运行，适合轻量提醒；不建议绑定重型生成。",
  "on-save": "保存章节时运行，适合审校、摘要、风格检查。",
  "on-chapter-end": "章节到末尾时运行，适合章末建议、伏笔检查。",
  manual: "只在编辑器里手动点击运行，最稳妥，适合多数写作工具。",
};

const PROMPT_TEMPLATES = [
  {
    name: "温柔润色",
    prompt: "请温柔润色以下选中文本，保留原意、语气和主要信息，只输出润色后的正文：\n\n{{selection}}",
  },
  {
    name: "散文细化",
    prompt:
      "请把以下文字改写得更像细腻的中文散文：保留原意，增加景物、感官和心绪层次；避免空泛形容词，只输出改写结果。\n\n{{selection}}",
  },
  {
    name: "续写一段",
    prompt:
      "请接着当前章节往下写一小段，保持人物口吻、叙事节奏和世界观一致，不要总结，不要解释。\n\n章节标题：{{chapter.title}}\n\n前文：\n{{context_before_1200}}",
  },
  {
    name: "审校建议",
    prompt:
      "请审校以下选中文本，指出最影响阅读的 3 个问题，并给出可直接修改的建议。不要重写全文。\n\n{{selection}}",
  },
];

const CORE_PLACEHOLDERS = [
  { label: "选中文本", token: "{{selection}}" },
  { label: "章节标题", token: "{{chapter.title}}" },
  { label: "全文", token: "{{chapter.text}}" },
  { label: "前文 1200 字", token: "{{context_before_1200}}" },
  { label: "角色名", token: "{{character.name}}" },
];

const ADVANCED_MACROS = [
  "{{random:雨,雪,风}}",
  "{{roll:1d6}}",
  "{{date}}",
  "{{time}}",
  "{{datetime}}",
  "{{newline}}",
];

interface EditorState {
  id: string | null;
  name: string;
  prompt: string;
  scope: SkillScope;
  output: SkillOutputTarget;
  enabled: boolean;
  triggers: SkillTriggerDef[];
  variables: SkillVariableDef[];
  temperature: string;
  maxTokens: string;
}

function emptyEditorState(): EditorState {
  return {
    id: null,
    name: "新建 Skill",
    prompt: "",
    scope: "global",
    output: "ai-feedback",
    enabled: true,
    triggers: [
      { type: "manual", enabled: true },
    ],
    variables: [],
    temperature: "0.8",
    maxTokens: "400",
  };
}

function skillToEditor(skill: SkillDefinition): EditorState {
  return {
    id: skill.id,
    name: skill.name,
    prompt: skill.prompt,
    scope: skill.scope,
    output: skill.output,
    enabled: skill.enabled,
    triggers: skill.triggers,
    variables: skill.variables ?? [],
    temperature: skill.binding.temperature?.toString() ?? "",
    maxTokens: skill.binding.maxTokens?.toString() ?? "",
  };
}

function upsertTrigger(
  list: SkillTriggerDef[],
  type: SkillTriggerType,
  patch: Partial<SkillTriggerDef>,
): SkillTriggerDef[] {
  const idx = list.findIndex((t) => t.type === type);
  if (idx === -1) {
    return [...list, { type, enabled: true, ...patch }];
  }
  const next = [...list];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

function removeTrigger(list: SkillTriggerDef[], type: SkillTriggerType): SkillTriggerDef[] {
  return list.filter((t) => t.type !== type);
}

export function SkillPage(): JSX.Element {
  const queryClient = useQueryClient();
  const activeSkillId = useAppStore((s) => s.activeSkillId);
  const setActiveSkillId = useAppStore((s) => s.setActiveSkillId);
  const [filterScope, setFilterScope] = useState<SkillScope | "all">("all");
  const [editor, setEditor] = useState<EditorState>(emptyEditorState());
  const [statusText, setStatusText] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<string>("");
  const [testRunning, setTestRunning] = useState(false);
  const [testSample, setTestSample] = useState("");
  const [previewText, setPreviewText] = useState<string>("");
  const [marketOpen, setMarketOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const skillsQuery = useQuery({
    queryKey: ["skills", filterScope],
    queryFn: () => skillApi.list(filterScope === "all" ? {} : { scope: filterScope }),
  });

  const currentSkill = useMemo(
    () => skillsQuery.data?.find((s) => s.id === activeSkillId) ?? null,
    [skillsQuery.data, activeSkillId],
  );

  useEffect(() => {
    if (currentSkill) {
      setEditor(skillToEditor(currentSkill));
    } else {
      setEditor(emptyEditorState());
    }
    setTestOutput("");
    setStatusText(null);
  }, [currentSkill]);

  useEffect(() => {
    const offChunk = skillApi.onChunk((payload) => {
      setTestOutput(payload.accumulatedText);
    });
    const offDone = skillApi.onDone((payload) => {
      setTestRunning(false);
      if (payload.status === "failed") {
        setStatusText(`运行失败：${payload.error ?? "unknown"}`);
      } else if (payload.status === "cancelled") {
        setStatusText("已取消");
      } else {
        setStatusText("运行完成");
      }
    });
    return () => {
      offChunk();
      offDone();
    };
  }, []);

  const createSkillMut = useMutation({
    mutationFn: () =>
      skillApi.create({
        name: editor.name.trim() || "未命名",
        prompt: editor.prompt,
        variables: editor.variables,
        triggers: editor.triggers,
        binding: {
          temperature: editor.temperature ? Number(editor.temperature) : undefined,
          maxTokens: editor.maxTokens ? Number(editor.maxTokens) : undefined,
        },
        output: editor.output,
        enabled: editor.enabled,
        scope: editor.scope,
      }),
    onSuccess: async (skill) => {
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      setActiveSkillId(skill.id);
      setStatusText("已创建");
    },
  });

  const updateSkillMut = useMutation({
    mutationFn: () => {
      if (!editor.id) throw new Error("no id");
      return skillApi.update({
        id: editor.id,
        name: editor.name.trim() || "未命名",
        prompt: editor.prompt,
        variables: editor.variables,
        triggers: editor.triggers,
        binding: {
          temperature: editor.temperature ? Number(editor.temperature) : undefined,
          maxTokens: editor.maxTokens ? Number(editor.maxTokens) : undefined,
        },
        output: editor.output,
        enabled: editor.enabled,
        scope: editor.scope,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      setStatusText("已保存");
    },
  });

  const deleteSkillMut = useMutation({
    mutationFn: (id: string) => skillApi.delete({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      setActiveSkillId(null);
      setStatusText("已删除");
    },
  });

  const exportMut = useMutation({
    mutationFn: async () => {
      const ids = editor.id ? [editor.id] : undefined;
      const result = await skillApi.exportJson({ ids, includeDisabled: true });
      const saved = await fsApi.saveFile({
        defaultPath: result.fileName,
        content: result.content,
      });
      return saved;
    },
    onSuccess: (saved) => {
      if (saved.path) setStatusText(`已导出到 ${saved.path}`);
      else setStatusText("已取消导出");
    },
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const picked = await fsApi.pickFile({
        title: "选择 Skill JSON",
      });
      if (!picked.path || picked.content === null) return null;
      return skillApi.importJson({
        content: picked.content,
        onConflict: "rename",
      });
    },
    onSuccess: async (report) => {
      if (!report) return;
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      setStatusText(
        `导入：共 ${report.total} · 新增 ${report.imported} · 替换 ${report.replaced} · 跳过 ${report.skipped} · 失败 ${report.errors.length}`,
      );
    },
  });

  const runTest = async () => {
    if (!editor.id) {
      setStatusText("测试运行前需先保存 Skill");
      return;
    }
    setTestOutput("");
    setStatusText("运行中…");
    setTestRunning(true);
    try {
      await skillApi.run({
        skillId: editor.id,
        projectId: "__test__",
        chapterId: "__test__",
        chapterTitle: "测试章节",
        chapterText: testSample,
        selection: testSample.slice(0, Math.min(200, testSample.length)),
        triggerType: "manual",
        persist: false,
      });
    } catch (err) {
      setTestRunning(false);
      setStatusText(`运行失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const isNew = !editor.id;
  const dirty =
    !!currentSkill &&
    (editor.name !== currentSkill.name ||
      editor.prompt !== currentSkill.prompt ||
      editor.scope !== currentSkill.scope ||
      editor.output !== currentSkill.output ||
      editor.enabled !== currentSkill.enabled ||
      JSON.stringify(editor.triggers) !== JSON.stringify(currentSkill.triggers) ||
      JSON.stringify(editor.variables) !== JSON.stringify(currentSkill.variables ?? []) ||
      editor.temperature !== (currentSkill.binding.temperature?.toString() ?? "") ||
      editor.maxTokens !== (currentSkill.binding.maxTokens?.toString() ?? ""));

  // 本地渲染预览：不打 API，直接用模板引擎把 {{...}} 占位替换出来，方便调试宏 / 变量。
  const runPreview = () => {
    const vars: Record<string, string> = {};
    for (const v of editor.variables) {
      if (v.defaultValue !== undefined) vars[v.key] = v.defaultValue;
    }
    const res = renderSkillTemplate(
      editor.prompt,
      {
        selection: testSample.slice(0, Math.min(200, testSample.length)),
        chapter: { title: "测试章节", text: testSample },
        vars,
      },
      { strict: false, emptyOnMissing: true },
    );
    const missingNote = res.missing.length
      ? `\n\n⚠ 未识别占位：${res.missing.join(", ")}`
      : "";
    setPreviewText(res.text + missingNote);
  };

  const insertPromptText = (text: string) => {
    const textarea = promptTextareaRef.current;
    const prompt = editor.prompt ?? "";
    const start = textarea?.selectionStart ?? prompt.length;
    const end = textarea?.selectionEnd ?? prompt.length;
    const nextPrompt = `${prompt.slice(0, start)}${text}${prompt.slice(end)}`;
    setEditor({ ...editor, prompt: nextPrompt });
    requestAnimationFrame(() => {
      const next = promptTextareaRef.current;
      if (!next) return;
      const cursor = start + text.length;
      next.focus();
      next.setSelectionRange(cursor, cursor);
    });
  };

  const applyPromptTemplate = (prompt: string) => {
    setEditor({ ...editor, prompt });
    requestAnimationFrame(() => promptTextareaRef.current?.focus());
  };

  return (
    <div className="flex h-full w-full bg-ink-900 text-ink-100">
      <aside className="flex w-72 shrink-0 flex-col border-r border-ink-700 bg-ink-800/40">
        <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-3 py-2 text-sm">
          <span className="text-accent-300">🧩 Skill</span>
          <div className="flex gap-1">
            <button
              className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
              onClick={() => {
                setActiveSkillId(null);
                setEditor(emptyEditorState());
              }}
              title="新建"
            >
              + 新建
            </button>
            <button
              className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
              title="导入 JSON"
            >
              ⬇
            </button>
            <button
              className="rounded-md border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700"
              onClick={() => setMarketOpen(true)}
              title="Skill 市场"
            >
              🛒
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 border-b border-ink-700 px-3 py-2 text-xs">
          {(["all", "global", "project", "community"] as const).map((v) => (
            <button
              key={v}
              className={`rounded-md px-2 py-1 transition-colors ${
                filterScope === v
                  ? "bg-accent-500/20 text-accent-300"
                  : "text-ink-400 hover:bg-ink-700"
              }`}
              onClick={() => setFilterScope(v)}
            >
              {v === "all" ? "全部" : SCOPE_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          {skillsQuery.isLoading && (
            <div className="px-3 py-4 text-xs text-ink-500">加载中…</div>
          )}
          {(skillsQuery.data ?? []).map((s) => (
            <button
              key={s.id}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-ink-700/40 px-3 py-2 text-left transition-colors ${
                activeSkillId === s.id ? "bg-ink-700/40" : "hover:bg-ink-700/20"
              }`}
              onClick={() => setActiveSkillId(s.id)}
            >
              <div className="flex w-full items-center justify-between">
                <span className="truncate text-sm">{s.name}</span>
                {!s.enabled && (
                  <span className="rounded bg-ink-700 px-1 text-xs text-ink-400">停用</span>
                )}
              </div>
              <div className="flex gap-1 text-xs text-ink-400">
                <span>{SCOPE_LABELS[s.scope]}</span>
                <span>·</span>
                <span>{s.triggers.length} 触发</span>
              </div>
            </button>
          ))}
          {(skillsQuery.data ?? []).length === 0 && !skillsQuery.isLoading && (
            <div className="px-3 py-6 text-center text-xs text-ink-500">
              暂无 Skill。点"+新建"或导入 JSON。
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-ink-700 px-3 py-2 text-xs text-ink-500">
          {skillsQuery.data ? `${skillsQuery.data.length} 个` : "—"}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-800/60 px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <input
              className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-sm focus:border-accent-500 focus:outline-none"
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder="Skill 名称"
            />
            <label className="flex items-center gap-1 text-xs text-ink-300">
              <input
                type="checkbox"
                checked={editor.enabled}
                onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
              />
              启用
            </label>
            <select
              className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs"
              value={editor.scope}
              onChange={(e) => setEditor({ ...editor, scope: e.target.value as SkillScope })}
            >
              {(Object.keys(SCOPE_LABELS) as SkillScope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-500">{statusText}</span>
            <button
              className="rounded-md border border-ink-600 px-2 py-1 hover:bg-ink-700"
              onClick={() => exportMut.mutate()}
              disabled={!editor.id || exportMut.isPending}
            >
              导出
            </button>
            <button
              className="rounded-md border border-ink-600 px-2 py-1 hover:bg-ink-700"
              onClick={() => setPublishOpen(true)}
              disabled={!editor.id}
              title="生成发布用 skill.json 和 PR 说明"
            >
              发布
            </button>
            {!isNew && (
              <button
                className="rounded-md border border-red-600/60 px-2 py-1 text-red-300 hover:bg-red-900/30"
                onClick={() => {
                  if (editor.id && confirm(`删除「${editor.name}」？`)) {
                    deleteSkillMut.mutate(editor.id);
                  }
                }}
              >
                删除
              </button>
            )}
            <button
              className="rounded-md border border-accent-500/60 bg-accent-500/20 px-3 py-1 text-accent-200 hover:bg-accent-500/30 disabled:opacity-50"
              disabled={createSkillMut.isPending || updateSkillMut.isPending || (!isNew && !dirty)}
              onClick={() => {
                if (isNew) createSkillMut.mutate();
                else updateSkillMut.mutate();
              }}
            >
              {isNew ? "创建" : "保存"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <div className="flex flex-col gap-4 p-4">
            <section className="rounded-xl border border-ink-700/70 bg-ink-800/35 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink-100">写作指令</h2>
                  <p className="mt-1 text-xs text-ink-400">
                    写清楚它要怎么处理文本。常用占位符可以点按钮插入，不需要背宏语法。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PROMPT_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      type="button"
                      className="rounded-full border border-ink-600 bg-ink-900/40 px-3 py-1 text-xs text-ink-200 transition hover:border-accent-500/70 hover:bg-accent-500/15 hover:text-accent-200"
                      onClick={() => applyPromptTemplate(tpl.prompt)}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                ref={promptTextareaRef}
                className="h-64 w-full resize-y rounded-xl border border-ink-600 bg-ink-900/80 p-3 font-mono text-sm leading-relaxed shadow-inner focus:border-accent-500 focus:outline-none"
                value={editor.prompt}
                onChange={(e) => setEditor({ ...editor, prompt: e.target.value })}
                placeholder={"例：请温柔润色以下文字，保留原意，只输出改写结果：\n\n{{selection}}"}
                aria-label="Skill Prompt"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink-500">插入上下文</span>
                {CORE_PLACEHOLDERS.map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    className="rounded-full border border-ink-700 bg-ink-900/50 px-2.5 py-1 text-xs text-ink-300 hover:border-accent-500/60 hover:text-accent-200"
                    onClick={() => insertPromptText(item.token)}
                    title={item.token}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <details className="mt-3 rounded-lg border border-ink-700/70 bg-ink-900/30 px-3 py-2">
                <summary className="cursor-pointer text-xs text-ink-400">
                  高级宏：随机、骰子、日期、换行
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ADVANCED_MACROS.map((macro) => (
                    <button
                      key={macro}
                      type="button"
                      className="rounded-md border border-ink-700 bg-ink-950/60 px-2 py-1 font-mono text-xs text-ink-300 hover:border-accent-500/60 hover:text-accent-200"
                      onClick={() => insertPromptText(macro)}
                    >
                      {macro}
                    </button>
                  ))}
                </div>
              </details>
            </section>

            <details
              className="rounded-xl border border-ink-700/70 bg-ink-800/25 p-4"
              open={editor.variables.length > 0}
            >
              <summary className="cursor-pointer text-sm font-semibold text-ink-200">
                自定义变量
                <span className="ml-2 rounded-full bg-ink-900/70 px-2 py-0.5 text-xs font-normal text-ink-400">
                  {editor.variables.length}
                </span>
              </summary>
              <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/35 p-3">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs text-ink-400">
                  <span>只有需要可复用参数时再加，例如情绪、语气、目标字数。</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-ink-600 px-2 py-1 hover:bg-ink-700"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        variables: [
                          ...editor.variables,
                          { key: "", label: "", required: false, defaultValue: "" },
                        ],
                      })
                    }
                  >
                    + 添加变量
                  </button>
                </div>
                {editor.variables.length === 0 && (
                  <div className="rounded-md border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-ink-500">
                    多数写作 Skill 不需要变量。直接用上面的占位符就够了。
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {editor.variables.map((v, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                      <input
                        className="w-28 rounded border border-ink-600 bg-ink-950/70 px-2 py-1 text-xs"
                        placeholder="变量名"
                        value={v.key}
                        aria-label="变量名"
                        onChange={(e) => {
                          const next = [...editor.variables];
                          next[idx] = { ...next[idx]!, key: e.target.value };
                          setEditor({ ...editor, variables: next });
                        }}
                      />
                      <input
                        className="w-32 rounded border border-ink-600 bg-ink-950/70 px-2 py-1 text-xs"
                        placeholder="显示名"
                        value={v.label}
                        aria-label="变量显示名"
                        onChange={(e) => {
                          const next = [...editor.variables];
                          next[idx] = { ...next[idx]!, label: e.target.value };
                          setEditor({ ...editor, variables: next });
                        }}
                      />
                      <input
                        className="min-w-40 flex-1 rounded border border-ink-600 bg-ink-950/70 px-2 py-1 text-xs"
                        placeholder="默认值"
                        value={v.defaultValue ?? ""}
                        aria-label="变量默认值"
                        onChange={(e) => {
                          const next = [...editor.variables];
                          next[idx] = { ...next[idx]!, defaultValue: e.target.value };
                          setEditor({ ...editor, variables: next });
                        }}
                      />
                      {v.key.trim() && (
                        <button
                          type="button"
                          className="rounded border border-ink-700 px-2 py-1 font-mono text-xs text-ink-300 hover:border-accent-500/60 hover:text-accent-200"
                          onClick={() => insertPromptText(`{{vars.${v.key.trim()}}}`)}
                        >
                          插入
                        </button>
                      )}
                      <label className="flex items-center gap-1 text-xs text-ink-400">
                        <input
                          type="checkbox"
                          checked={v.required}
                          onChange={(e) => {
                            const next = [...editor.variables];
                            next[idx] = { ...next[idx]!, required: e.target.checked };
                            setEditor({ ...editor, variables: next });
                          }}
                        />
                        必填
                      </label>
                      <button
                        type="button"
                        className="rounded border border-red-600/50 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            variables: editor.variables.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <section className="rounded-xl border border-ink-700/70 bg-ink-800/25 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-ink-100">触发方式</h2>
                <p className="mt-1 text-xs text-ink-400">
                  默认建议只开“手动触发”。自动触发适合审校提醒，不适合长生成。
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {ALL_TRIGGERS.map((type) => {
                  const existing = editor.triggers.find((t) => t.type === type);
                  return (
                    <div
                      key={type}
                      className={`rounded-lg border p-3 transition ${
                        existing
                          ? "border-accent-500/50 bg-accent-500/10"
                          : "border-ink-700 bg-ink-900/30"
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          className="mt-1"
                          type="checkbox"
                          checked={!!existing}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditor({
                                ...editor,
                                triggers: upsertTrigger(editor.triggers, type, {
                                  enabled: true,
                                  everyNChars: type === "every-n-chars" ? 200 : undefined,
                                  debounceMs: type === "every-n-chars" ? 10_000 : undefined,
                                  cooldownMs: type === "every-n-chars" ? 30_000 : undefined,
                                }),
                              });
                            } else {
                              setEditor({ ...editor, triggers: removeTrigger(editor.triggers, type) });
                            }
                          }}
                        />
                        <span>
                          <span className="block text-sm font-medium text-ink-100">
                            {TRIGGER_LABELS[type]}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-ink-400">
                            {TRIGGER_DESCRIPTIONS[type]}
                          </span>
                        </span>
                      </label>
                      {type === "every-n-chars" && existing && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700/70 pt-3 text-xs text-ink-400">
                          每
                          <input
                            className="w-16 rounded border border-ink-600 bg-ink-950/70 px-1 py-0.5 text-right text-ink-100"
                            type="number"
                            value={existing.everyNChars ?? 200}
                            min={50}
                            max={5000}
                            aria-label="自动触发字数间隔"
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                triggers: upsertTrigger(editor.triggers, type, {
                                  everyNChars: Number(e.target.value) || 200,
                                }),
                              })
                            }
                          />
                          字触发，至少间隔
                          <input
                            className="w-20 rounded border border-ink-600 bg-ink-950/70 px-1 py-0.5 text-right text-ink-100"
                            type="number"
                            value={existing.debounceMs ?? 10_000}
                            min={0}
                            step={1000}
                            aria-label="自动触发防抖毫秒"
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                triggers: upsertTrigger(editor.triggers, type, {
                                  debounceMs: Number(e.target.value) || 0,
                                }),
                              })
                            }
                          />
                          ms
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <div>
              <div className="mb-2 text-xs text-ink-400">模型绑定 / 输出</div>
              <div className="grid grid-cols-3 gap-3 rounded-md border border-ink-700 bg-ink-800/40 p-3 text-sm">
                <div>
                  <label className="mb-1 block text-xs text-ink-400">温度 (Temperature)</label>
                  <input
                    className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
                    type="number"
                    step="0.1"
                    min={0}
                    max={2}
                    value={editor.temperature}
                    onChange={(e) => setEditor({ ...editor, temperature: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-400">最大 Token 数</label>
                  <input
                    className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
                    type="number"
                    min={50}
                    max={8000}
                    value={editor.maxTokens}
                    onChange={(e) => setEditor({ ...editor, maxTokens: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-400">输出方式</label>
                  <select
                    className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
                    value={editor.output}
                    onChange={(e) =>
                      setEditor({ ...editor, output: e.target.value as SkillOutputTarget })
                    }
                  >
                    {(Object.keys(OUTPUT_LABELS) as SkillOutputTarget[]).map((o) => (
                      <option key={o} value={o}>
                        {OUTPUT_LABELS[o]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
                <span>测试运行（不写入时间线）</span>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border border-ink-600 px-3 py-1 hover:bg-ink-700"
                    onClick={runPreview}
                    title="本地渲染 Prompt（不调用模型、不花费）"
                  >
                    预览渲染
                  </button>
                  <button
                    className="rounded-md border border-accent-500/60 px-3 py-1 text-accent-200 hover:bg-accent-500/20 disabled:opacity-50"
                    onClick={runTest}
                    disabled={testRunning || !editor.id}
                  >
                    {testRunning ? "运行中…" : "▶ 运行"}
                  </button>
                </div>
              </div>
              <textarea
                className="h-24 w-full resize-y rounded-md border border-ink-600 bg-ink-800 p-2 text-sm"
                value={testSample}
                onChange={(e) => setTestSample(e.target.value)}
                placeholder="粘贴一段样例文本作为章节正文 / 选中片段……"
              />
              {previewText && (
                <pre className="mt-2 max-h-40 w-full overflow-auto whitespace-pre-wrap rounded-md border border-ink-700 bg-ink-800/60 p-2 text-xs text-ink-300 scrollbar-thin">
                  {previewText}
                </pre>
              )}
              <pre className="mt-2 h-32 w-full overflow-auto rounded-md border border-ink-700 bg-ink-950 p-2 text-xs text-ink-200 scrollbar-thin">
                {testOutput || "(等待输出)"}
              </pre>
            </div>
          </div>
        </div>
      </section>
      <SkillMarketDialog open={marketOpen} onClose={() => setMarketOpen(false)} />
      <SkillPublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        skillId={editor.id}
      />
    </div>
  );
}
