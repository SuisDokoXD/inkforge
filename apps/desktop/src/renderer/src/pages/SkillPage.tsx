import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpenText,
  Check,
  ChevronRight,
  Download,
  FlaskConical,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { SkillOutputTarget, SkillScope } from "@inkforge/shared";
import { renderSkillTemplate } from "@inkforge/skill-engine";
import { fsApi, skillApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { SkillMarketDialog } from "../components/SkillMarketDialog";
import { SkillPublishDialog } from "../components/SkillPublishDialog";
import { SkillLibrarySidebar } from "../components/skill/SkillLibrarySidebar";
import { Badge, Button, Select, TextField, Textarea } from "../components/ui";
import { fadeOnly } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";
import {
  ADVANCED_MACROS,
  ALL_TRIGGERS,
  CORE_PLACEHOLDERS,
  OUTPUT_DESCRIPTIONS,
  OUTPUT_LABELS,
  PROMPT_TEMPLATES,
  SCOPE_LABELS,
  TRIGGER_DESCRIPTIONS,
  TRIGGER_LABELS,
  describeTriggers,
  emptyEditorState,
  removeTrigger,
  skillToEditor,
  upsertTrigger,
  type EditorState,
} from "../components/skill/skill-page-model";

type SkillPageStatus = {
  kind: "info" | "success" | "error";
  text: string;
};

export function SkillPage(): JSX.Element {
  const queryClient = useQueryClient();
  const activeSkillId = useAppStore((s) => s.activeSkillId);
  const setActiveSkillId = useAppStore((s) => s.setActiveSkillId);
  const [filterScope, setFilterScope] = useState<SkillScope | "all">("all");
  const [editor, setEditor] = useState<EditorState>(emptyEditorState());
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const { status, showStatus } = useTimedStatus<SkillPageStatus>();
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
    setDeleteConfirming(false);
    if (currentSkill) {
      setEditor(skillToEditor(currentSkill));
    } else {
      setEditor(emptyEditorState());
    }
    setTestOutput("");
  }, [currentSkill]);

  useEffect(() => {
    const offChunk = skillApi.onChunk((payload) => {
      setTestOutput(payload.accumulatedText);
    });
    const offDone = skillApi.onDone((payload) => {
      setTestRunning(false);
      if (payload.status === "failed") {
        showStatus({
          kind: "error",
          text: `运行失败：${friendlyErrorMessage(payload.error, "指令运行失败，请检查内容后重试。")}`,
        });
      } else if (payload.status === "cancelled") {
        showStatus({ kind: "info", text: "已取消" }, 1800);
      } else {
        showStatus({ kind: "success", text: "运行完成" }, 2200);
      }
    });
    return () => {
      offChunk();
      offDone();
    };
  }, [showStatus]);

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
      showStatus({ kind: "success", text: "已创建" }, 2200);
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: `创建失败：${friendlyErrorMessage(err, "写作指令创建失败，请检查内容后重试。")}`,
      });
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
      showStatus({ kind: "success", text: "已保存" }, 2200);
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: `保存失败：${friendlyErrorMessage(err, "写作指令保存失败，请稍后重试。")}`,
      });
    },
  });

  const deleteSkillMut = useMutation({
    mutationFn: (id: string) => skillApi.delete({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      setActiveSkillId(null);
      setDeleteConfirming(false);
      showStatus({ kind: "success", text: "已删除" }, 2200);
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: `删除失败：${friendlyErrorMessage(err, "写作指令删除失败，请稍后重试。")}`,
      });
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
      if (saved.path) showStatus({ kind: "success", text: `已导出到 ${saved.path}` }, 5000);
      else showStatus({ kind: "info", text: "已取消导出" }, 1800);
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: `导出失败：${friendlyErrorMessage(err, "写作指令导出失败，请稍后重试。")}`,
      });
    },
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const picked = await fsApi.pickFile({
        title: "选择写作指令配置文件",
      });
      if (!picked.path || picked.content === null) return null;
      return skillApi.importJson({
        content: picked.content,
        onConflict: "rename",
      });
    },
    onSuccess: async (report) => {
      if (!report) {
        showStatus({ kind: "info", text: "已取消导入" }, 1800);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      showStatus(
        {
          kind: report.errors.length > 0 ? "error" : "success",
          text: `导入完成：共 ${report.total} · 新增 ${report.imported} · 替换 ${report.replaced} · 跳过 ${report.skipped} · 失败 ${report.errors.length}`,
        },
        report.errors.length > 0 ? undefined : 4000,
      );
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: `导入失败：${friendlyErrorMessage(err, "写作指令导入失败，请检查文件后重试。")}`,
      });
    },
  });

  const runTest = async () => {
    if (!editor.id) {
      showStatus({ kind: "error", text: "测试运行前需先保存指令" }, 2800);
      return;
    }
    setTestOutput("");
    showStatus({ kind: "info", text: "运行中…" });
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
      showStatus({
        kind: "error",
        text: `运行失败：${friendlyErrorMessage(err, "指令运行失败，请检查内容后重试。")}`,
      });
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
  const statusIsError = status?.kind === "error";
  const statusClassName =
    status?.kind === "error"
      ? "text-red-300"
      : status?.kind === "success"
        ? "text-emerald-300"
        : "text-ink-500";

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
      ? `\n\n有未识别的内容按钮：${res.missing.join(", ")}`
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
      <SkillLibrarySidebar
        skills={skillsQuery.data ?? []}
        isLoading={skillsQuery.isLoading}
        activeSkillId={activeSkillId}
        filterScope={filterScope}
        importPending={importMut.isPending}
        onCreateNew={() => {
          showStatus(null);
          setActiveSkillId(null);
          setEditor(emptyEditorState());
        }}
        onImport={() => importMut.mutate()}
        onOpenMarket={() => setMarketOpen(true)}
        onSelectSkill={(skillId) => {
          showStatus(null);
          setActiveSkillId(skillId);
        }}
        onFilterScopeChange={setFilterScope}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-ink-700 bg-ink-800/60 px-4 py-2 text-sm">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TextField
              className="h-9 w-72 bg-ink-900 font-medium"
              aria-label="写作指令名称"
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder="指令名称，例如：温柔润色"
            />
            <label className="flex h-9 items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 px-2 text-xs text-ink-300">
              <input
                type="checkbox"
                aria-label="启用写作指令"
                checked={editor.enabled}
                onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
              />
              启用
            </label>
            <Select
              className="h-9 w-auto bg-ink-900 py-0 text-xs"
              value={editor.scope}
              aria-label="写作指令使用范围"
              onChange={(e) => setEditor({ ...editor, scope: e.target.value as SkillScope })}
            >
              {(Object.keys(SCOPE_LABELS) as SkillScope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </Select>
            <div className="hidden min-w-0 items-center gap-2 text-xs text-ink-500 xl:flex">
              <ChevronRight size={14} />
              <span className="truncate">{describeTriggers(editor.triggers)}</span>
              <span>·</span>
              <span>{OUTPUT_LABELS[editor.output]}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <AnimatePresence initial={false}>
              {status && (
                <motion.span
                  className={`max-w-56 truncate ${statusClassName}`}
                  title={status.text}
                  role={statusIsError ? "alert" : "status"}
                  variants={fadeOnly}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {status.text}
                </motion.span>
              )}
            </AnimatePresence>
            <Button
              className="h-8"
              size="sm"
              onClick={() => exportMut.mutate()}
              disabled={!editor.id || exportMut.isPending}
            >
              <Download size={13} />
              导出
            </Button>
            <Button
              className="h-8"
              size="sm"
              onClick={() => setPublishOpen(true)}
              disabled={!editor.id}
              title="生成发布用配置和说明"
            >
              <Send size={13} />
              发布
            </Button>
            {!isNew && (
              <AnimatePresence initial={false} mode="wait">
                {deleteConfirming ? (
                  <motion.div
                    key="delete-confirm"
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex h-8 items-center gap-1"
                  >
                    <Button
                      type="button"
                      className="h-8"
                      size="sm"
                      onClick={() => setDeleteConfirming(false)}
                      disabled={deleteSkillMut.isPending}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      className="h-8"
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (editor.id) deleteSkillMut.mutate(editor.id);
                      }}
                      disabled={deleteSkillMut.isPending}
                    >
                      {deleteSkillMut.isPending ? "删除中" : "确认删除"}
                    </Button>
                  </motion.div>
                ) : (
                  <Button
                    key="delete-start"
                    type="button"
                    className="h-8"
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteConfirming(true)}
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Trash2 size={13} />
                    删除
                  </Button>
                )}
              </AnimatePresence>
            )}
            <Button
              className="h-8"
              variant="primary"
              size="sm"
              disabled={createSkillMut.isPending || updateSkillMut.isPending || (!isNew && !dirty)}
              onClick={() => {
                if (isNew) createSkillMut.mutate();
                else updateSkillMut.mutate();
              }}
            >
              <Save size={13} />
              {isNew ? "创建" : "保存"}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <div className="flex flex-col gap-4 p-4">
            <section className="rounded-xl border border-ink-700 bg-ink-800/30 p-4">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-base font-semibold text-ink-100">
                    把常用写作要求做成可复用指令
                  </h1>
                  <p className="mt-1 text-xs leading-6 text-ink-400">
                    一条指令要说明三件事：读取哪段内容、什么时候出现、结果是否直接改正文。保存后，它会出现在编辑器工具栏、选中文本浮层，或按你设置的方式自动运行。
                  </p>
                </div>
                <Badge
                  tone={editor.enabled ? "success" : "neutral"}
                  size="md"
                  className="shrink-0 rounded-md"
                >
                  {editor.enabled ? "已启用" : "已停用"}
                </Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-md border border-ink-700 bg-ink-950/60 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-ink-100">
                    <Sparkles size={15} className="text-accent-300" />
                    1. 写明任务和边界
                  </div>
                  <p className="text-xs leading-5 text-ink-500">
                    例如保留原意、只输出正文、不重写全文，再点内容按钮指定要读的文字。
                  </p>
                </div>
                <div className="rounded-md border border-ink-700 bg-ink-950/60 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-ink-100">
                    <BookOpenText size={15} className="text-accent-300" />
                    2. 选择出现时机
                  </div>
                  <p className="text-xs leading-5 text-ink-500">
                    手动点击最稳；选中文本适合润色；保存或字数触发更适合轻量提醒。
                  </p>
                </div>
                <div className="rounded-md border border-ink-700 bg-ink-950/60 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-ink-100">
                    <Check size={15} className="text-accent-300" />
                    3. 决定是否改正文
                  </div>
                  <p className="text-xs leading-5 text-ink-500">
                    不确定时先只显示建议；确认稳定后，再改成替换选区或插入正文。
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-ink-700/70 bg-ink-800/35 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink-100">指令内容</h2>
                  <p className="mt-1 text-xs text-ink-400">
                    像给写作助手写一条明确要求。下方内容按钮会在运行时换成选区、章节正文或前文上下文。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-500">套用模板</span>
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

              <Textarea
                ref={promptTextareaRef}
                className="h-56 rounded-xl bg-ink-950/80 p-3 font-mono leading-relaxed shadow-inner"
                value={editor.prompt}
                onChange={(e) => setEditor({ ...editor, prompt: e.target.value })}
                placeholder={"例：请温柔润色我选中的文字，保留原意和长度，只输出改写后的正文。\n\n需要插入正文、选区或章节信息时，点下方内容按钮。"}
                aria-label="写作指令内容"
              />

              <div className="mt-3 rounded-lg border border-ink-700 bg-ink-950/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-ink-300">插入可读取的写作内容</span>
                  <span className="text-[11px] text-ink-500">点击即可插入到光标位置</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {CORE_PLACEHOLDERS.map((item) => (
                    <button
                      key={item.token}
                      type="button"
                      className="rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-left transition hover:border-accent-500/60 hover:bg-accent-500/10"
                      onClick={() => insertPromptText(item.token)}
                      title={`插入：${item.label}`}
                    >
                      <span className="block text-xs font-medium text-ink-200">{item.label}</span>
                      <span className="mt-1 block text-[11px] text-accent-700 dark:text-accent-300">
                        点击插入
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-500">{item.help}</span>
                    </button>
                  ))}
                </div>
              </div>

              <details className="mt-3 rounded-lg border border-ink-700/70 bg-ink-900/30 px-3 py-2">
                <summary className="cursor-pointer text-xs text-ink-400">
                  少数情况下才需要：随机、骰子、日期、换行
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ADVANCED_MACROS.map((macro) => (
                    <button
                      key={macro.token}
                      type="button"
                      className="rounded-md border border-ink-700 bg-ink-950/60 px-2 py-1 text-xs text-ink-300 hover:border-accent-500/60 hover:text-accent-200"
                      onClick={() => insertPromptText(macro.token)}
                      title={`插入：${macro.label}`}
                    >
                      {macro.label}
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
                自定义填空项
                <Badge className="ml-2 font-normal" tone="neutral" size="sm">
                  {editor.variables.length}
                </Badge>
              </summary>
              <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/35 p-3">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs text-ink-400">
                  <span>只有需要反复填写同类内容时再加，例如情绪、语气、目标字数。</span>
                  <Button
                    type="button"
                    className="shrink-0"
                    size="sm"
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
                    + 添加填空项
                  </Button>
                </div>
                {editor.variables.length === 0 && (
                  <div className="rounded-md border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-ink-500">
                    多数写作指令不需要填空项。直接用上面的内容按钮就够了。
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {editor.variables.map((v, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                      <TextField
                        className="w-28 bg-ink-950/70 px-2 py-1 text-xs"
                        aria-label="填空项名称"
                        placeholder="填空项名称"
                        value={v.key}
                        onChange={(e) => {
                          const next = [...editor.variables];
                          next[idx] = { ...next[idx]!, key: e.target.value };
                          setEditor({ ...editor, variables: next });
                        }}
                      />
                      <TextField
                        className="w-32 bg-ink-950/70 px-2 py-1 text-xs"
                        aria-label="填空项显示名称"
                        placeholder="显示名称"
                        value={v.label}
                        onChange={(e) => {
                          const next = [...editor.variables];
                          next[idx] = { ...next[idx]!, label: e.target.value };
                          setEditor({ ...editor, variables: next });
                        }}
                      />
                      <TextField
                        className="min-w-40 flex-1 bg-ink-950/70 px-2 py-1 text-xs w-auto"
                        aria-label="填空项默认内容"
                        placeholder="默认内容"
                        value={v.defaultValue ?? ""}
                        onChange={(e) => {
                          const next = [...editor.variables];
                          next[idx] = { ...next[idx]!, defaultValue: e.target.value };
                          setEditor({ ...editor, variables: next });
                        }}
                      />
                      {v.key.trim() && (
                        <Button
                          type="button"
                          className="font-mono"
                          size="sm"
                          onClick={() => insertPromptText(`{{vars.${v.key.trim()}}}`)}
                        >
                          插入
                        </Button>
                      )}
                      <label className="flex items-center gap-1 text-xs text-ink-400">
                        <input
                          type="checkbox"
                          aria-label="设为必填"
                          checked={v.required}
                          onChange={(e) => {
                            const next = [...editor.variables];
                            next[idx] = { ...next[idx]!, required: e.target.checked };
                            setEditor({ ...editor, variables: next });
                          }}
                        />
                        必填
                      </label>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            variables: editor.variables.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        删除
                      </Button>
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
                          aria-label={`启用触发方式：${TRIGGER_LABELS[type]}`}
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
                          <TextField
                            className="w-16 bg-ink-950/70 px-1 py-0.5 text-right text-xs"
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
                          <TextField
                            className="w-20 bg-ink-950/70 px-1 py-0.5 text-right text-xs"
                            type="number"
                            value={existing.debounceMs ?? 10_000}
                            min={0}
                            step={1000}
                            aria-label="自动触发等待时间"
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                triggers: upsertTrigger(editor.triggers, type, {
                                  debounceMs: Number(e.target.value) || 0,
                                }),
                              })
                            }
                          />
                          毫秒
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-ink-700/70 bg-ink-800/25 p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-ink-100">结果怎么处理</h2>
                <p className="mt-1 text-xs text-ink-400">
                  先选“只显示建议”最安全；确认效果稳定后，再改成替换或插入正文。
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {(Object.keys(OUTPUT_LABELS) as SkillOutputTarget[]).map((output) => (
                  <button
                    key={output}
                    type="button"
                    onClick={() => setEditor({ ...editor, output })}
                    className={`rounded-lg border p-3 text-left transition ${
                      editor.output === output
                        ? "border-accent-500/60 bg-accent-500/12"
                        : "border-ink-700 bg-ink-900/35 hover:bg-ink-800"
                    }`}
                  >
                    <span className="block text-sm font-medium text-ink-100">
                      {OUTPUT_LABELS[output]}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-ink-500">
                      {OUTPUT_DESCRIPTIONS[output]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-ink-400">创造性</label>
                  <TextField
                    className="bg-ink-900 px-2 py-1"
                    type="number"
                    step="0.1"
                    min={0}
                    max={2}
                    value={editor.temperature}
                    aria-label="创造性"
                    onChange={(e) => setEditor({ ...editor, temperature: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-ink-500">越低越稳，越高越发散。</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-400">最长输出</label>
                  <TextField
                    className="bg-ink-900 px-2 py-1"
                    type="number"
                    min={50}
                    max={8000}
                    value={editor.maxTokens}
                    aria-label="最长输出"
                    onChange={(e) => setEditor({ ...editor, maxTokens: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-ink-500">润色可小一些，续写可适当放大。</p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-ink-700/70 bg-ink-800/25 p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
                <span className="flex items-center gap-2">
                  <FlaskConical size={14} />
                  测试一下
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={runPreview}
                    title="预览最终发送给模型的内容（不调用模型、不产生生成消耗）"
                  >
                    预览发送内容
                  </Button>
                  <Button
                    variant="accentSoft"
                    size="sm"
                    onClick={runTest}
                    disabled={testRunning || !editor.id}
                  >
                    {testRunning ? "运行中…" : "试运行指令"}
                  </Button>
                </div>
              </div>
              <p className="mb-2 text-xs leading-5 text-ink-500">
                粘贴一段样例文字，先“预览发送内容”检查内容按钮是否取到了正确文字；保存后才能试运行。
              </p>
              <Textarea
                className="h-24 rounded-md bg-ink-800 p-2"
                value={testSample}
                aria-label="测试样例文本"
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
            </section>
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
