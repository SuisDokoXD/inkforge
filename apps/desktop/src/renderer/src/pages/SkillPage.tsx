import { useEffect, useMemo, useState } from "react";
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
          <div className="flex flex-col gap-5 p-4">
            <div>
              <label className="mb-1 block text-xs text-ink-400">
                Prompt（占位：{"{{selection}} {{chapter.title}} {{chapter.text}} {{context_before_N}} {{character.name}} {{vars.xxx}}"}；工具宏：{"{{random:a,b,c}} {{roll:NdM}} {{time}} {{date}} {{datetime}} {{newline}}"}）
              </label>
              <textarea
                className="h-56 w-full resize-y rounded-md border border-ink-600 bg-ink-800 p-2 font-mono text-sm leading-relaxed focus:border-accent-500 focus:outline-none"
                value={editor.prompt}
                onChange={(e) => setEditor({ ...editor, prompt: e.target.value })}
                placeholder="例：请温柔润色以下文字，保留原意：{{selection}}"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
                <span>变量（在 Prompt 里用 {"{{vars.<key>}}"} 引用；运行时取默认值）</span>
                <button
                  className="rounded-md border border-ink-600 px-2 py-0.5 hover:bg-ink-700"
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
              <div className="flex flex-col gap-2 rounded-md border border-ink-700 bg-ink-800/40 p-3">
                {editor.variables.length === 0 && (
                  <div className="text-xs text-ink-500">暂无变量。</div>
                )}
                {editor.variables.map((v, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      className="w-28 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
                      placeholder="变量名"
                      value={v.key}
                      onChange={(e) => {
                        const next = [...editor.variables];
                        next[idx] = { ...next[idx]!, key: e.target.value };
                        setEditor({ ...editor, variables: next });
                      }}
                    />
                    <input
                      className="w-32 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
                      placeholder="显示名"
                      value={v.label}
                      onChange={(e) => {
                        const next = [...editor.variables];
                        next[idx] = { ...next[idx]!, label: e.target.value };
                        setEditor({ ...editor, variables: next });
                      }}
                    />
                    <input
                      className="flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
                      placeholder="默认值"
                      value={v.defaultValue ?? ""}
                      onChange={(e) => {
                        const next = [...editor.variables];
                        next[idx] = { ...next[idx]!, defaultValue: e.target.value };
                        setEditor({ ...editor, variables: next });
                      }}
                    />
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

            <div>
              <div className="mb-2 text-xs text-ink-400">触发规则</div>
              <div className="flex flex-col gap-2 rounded-md border border-ink-700 bg-ink-800/40 p-3">
                {ALL_TRIGGERS.map((type) => {
                  const existing = editor.triggers.find((t) => t.type === type);
                  return (
                    <div key={type} className="flex items-center gap-2 text-sm">
                      <input
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
                      <span className="w-24">{TRIGGER_LABELS[type]}</span>
                      {type === "every-n-chars" && existing && (
                        <div className="flex items-center gap-2 text-xs text-ink-400">
                          每
                          <input
                            className="w-16 rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-right text-ink-100"
                            type="number"
                            value={existing.everyNChars ?? 200}
                            min={50}
                            max={5000}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                triggers: upsertTrigger(editor.triggers, type, {
                                  everyNChars: Number(e.target.value) || 200,
                                }),
                              })
                            }
                          />
                          字 · debounce
                          <input
                            className="w-20 rounded border border-ink-600 bg-ink-900 px-1 py-0.5 text-right text-ink-100"
                            type="number"
                            value={existing.debounceMs ?? 10_000}
                            min={0}
                            step={1000}
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
            </div>

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
