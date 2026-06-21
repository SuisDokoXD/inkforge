import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import type {
  LLMQuickActionInput,
  LLMQuickActionKind,
  LLMQuickActionResponse,
  SkillDefinition,
  SkillOutputTarget,
} from "@inkforge/shared";
import { llmApi, skillApi } from "../lib/api";
import { AnimatedDialog } from "./AnimatedDialog";
import { fadeOnly, SPRING_SNAPPY } from "../lib/motion-tokens";
import { applySkillOutputToEditor, type SkillApplyRange } from "../lib/skill-output";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { useTimedStatus } from "../lib/use-timed-status";
import { Button, Select } from "./ui";

const CONTEXT_WINDOW = 400;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ActionDef {
  kind: LLMQuickActionKind;
  label: string;
  tip: string;
  placement: "inline-replace" | "insert-after" | "timeline" | "options";
}

const ACTIONS: ActionDef[] = [
  { kind: "polish", label: "润色", tip: "优化遣词节奏，不改情节", placement: "inline-replace" },
  { kind: "critique", label: "审查", tip: "送到写作建议，指出问题", placement: "timeline" },
  { kind: "continue", label: "续写", tip: "接在选区之后自然延展", placement: "insert-after" },
  { kind: "rephrase", label: "代入", tip: "换语气改写，给出 3 种", placement: "options" },
];

interface SelectionToolbarProps {
  editor: Editor | null;
  projectId?: string;
  chapterId?: string;
  chapterTitle?: string;
  providerId?: string | null;
  onPushFeedback?: (text: string, kind: string) => void;
  onAfterApply?: () => void;
}

interface QuickResult {
  kind: LLMQuickActionKind;
  action: ActionDef;
  from: number;
  to: number;
  response?: LLMQuickActionResponse;
  error?: string;
  loading: boolean;
}

export function SelectionToolbar(props: SelectionToolbarProps): JSX.Element | null {
  const { editor, projectId, chapterId, chapterTitle, providerId, onPushFeedback, onAfterApply } = props;
  const reduce = useReducedMotion();
  const [rect, setRect] = useState<Rect | null>(null);
  const [selectionText, setSelectionText] = useState<string>("");
  const [result, setResult] = useState<QuickResult | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const { status: skillStatus, showStatus: showSkillStatus } = useTimedStatus();
  const [candidateCount, setCandidateCount] = useState<1 | 2 | 3>(1);
  const skillMenuRef = useRef<HTMLDivElement | null>(null);
  const activeSkillRunRef = useRef<{
    runId: string;
    skillName: string;
    output: SkillOutputTarget;
    range: SkillApplyRange;
  } | null>(null);

  const selectionSkillsQuery = useQuery({
    queryKey: ["skills", "selection", projectId ?? null],
    queryFn: () => skillApi.list({ enabledOnly: true }),
  });
  const selectionSkills = useMemo<SkillDefinition[]>(() => {
    return (selectionSkillsQuery.data ?? []).filter((skill) =>
      skill.triggers.some((t) => t.type === "selection" && t.enabled),
    );
  }, [selectionSkillsQuery.data]);

  const updatePosition = useCallback(() => {
    if (!editor) {
      setRect(null);
      setSelectionText("");
      return;
    }
    const { state, view } = editor;
    const { from, to, empty } = state.selection;
    if (empty || from === to) {
      setRect(null);
      setSelectionText("");
      return;
    }
    const text = state.doc.textBetween(from, to, "\n", "\n").trim();
    if (!text) {
      setRect(null);
      setSelectionText("");
      return;
    }
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const top = Math.min(start.top, end.top);
    const left = Math.min(start.left, end.left);
    const right = Math.max(start.right, end.right);
    const bottom = Math.max(start.bottom, end.bottom);
    setRect({
      top,
      left,
      width: Math.max(80, right - left),
      height: Math.max(16, bottom - top),
    });
    setSelectionText(text);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => updatePosition();
    let blurTimer = 0;
    const handleBlur = () => {
      window.clearTimeout(blurTimer);
      // Delay so clicking toolbar doesn't kill it.
      blurTimer = window.setTimeout(() => {
        if (!editor.isFocused && !document.activeElement?.closest("[data-selection-toolbar]")) {
          setRect(null);
        }
      }, 150);
    };
    editor.on("selectionUpdate", handleUpdate);
    editor.on("blur", handleBlur);
    // scroll/resize 用 rAF 合并，避免连续事件里同步重算工具条位置造成抖动。
    let raf = 0;
    const scheduleUpdate = (): void => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        updatePosition();
      });
    };
    const onScroll = () => scheduleUpdate();
    const onResize = () => scheduleUpdate();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      editor.off("selectionUpdate", handleUpdate);
      editor.off("blur", handleBlur);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(blurTimer);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [editor, updatePosition]);

  const contextBefore = useMemo(() => {
    if (!editor) return "";
    const { from } = editor.state.selection;
    const start = Math.max(0, from - CONTEXT_WINDOW);
    return editor.state.doc.textBetween(start, from, "\n", "\n");
  }, [editor, rect]);

  const contextAfter = useMemo(() => {
    if (!editor) return "";
    const { to } = editor.state.selection;
    const end = Math.min(editor.state.doc.content.size, to + CONTEXT_WINDOW);
    return editor.state.doc.textBetween(to, end, "\n", "\n");
  }, [editor, rect]);

  const runAction = async (action: ActionDef) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setResult({ kind: action.kind, action, from, to, loading: true });
    const baseInput: LLMQuickActionInput = {
      kind: action.kind,
      selectedText: selectionText,
      contextBefore,
      contextAfter,
      providerId: providerId ?? undefined,
      projectId,
      chapterId,
    };

    // For "options" placement (rephrase/inspire) the kernel itself returns N
    // options via JSON; pass options=count and run a single call.
    // For other placements, fan out N parallel calls and merge.
    const wantsKernelOptions = action.placement === "options";
    const count = wantsKernelOptions ? Math.max(candidateCount, 3) : candidateCount;
    const inputs: LLMQuickActionInput[] = wantsKernelOptions
      ? [{ ...baseInput, options: count }]
      : Array.from({ length: count }, () => ({ ...baseInput }));

    try {
      const settled = await Promise.allSettled(inputs.map((i) => llmApi.quick(i)));
      const responses = settled
        .filter((s): s is PromiseFulfilledResult<LLMQuickActionResponse> => s.status === "fulfilled")
        .map((s) => s.value);
      const errors = settled
        .filter((s): s is PromiseRejectedResult => s.status === "rejected")
        .map((s) => friendlyErrorMessage(s.reason, "生成失败，请稍后重试。"));

      if (responses.length === 0) {
        setResult({
          kind: action.kind,
          action,
          from,
          to,
          error: errors[0] ?? "生成失败，请稍后重试。",
          loading: false,
        });
        return;
      }

      // Merge: if kernel returned options, use them directly; otherwise stack texts.
      const options =
        wantsKernelOptions && responses[0].options?.length
          ? responses[0].options
          : responses
              .map((r) => r.text ?? "")
              .filter((t) => t.length > 0);
      const totalDuration = responses.reduce((sum, r) => sum + r.durationMs, 0);
      const merged: LLMQuickActionResponse = {
        actionId: responses[0].actionId,
        kind: action.kind,
        status: "completed",
        text: options[0],
        options,
        durationMs: Math.round(totalDuration / responses.length),
        providerId: responses[0].providerId,
      };
      setResult({ kind: action.kind, action, from, to, response: merged, loading: false });
      if (merged.status === "completed" && action.placement === "timeline") {
        onPushFeedback?.(merged.text ?? "", "critique");
      }
    } catch (err) {
      setResult({
        kind: action.kind,
        action,
        from,
        to,
        error: friendlyErrorMessage(err, "生成失败，请稍后重试。"),
        loading: false,
      });
    }
  };

  const apply = (text: string) => {
    if (!editor || !result) return;
    const { from, to, action } = result;
    if (action.placement === "inline-replace" || action.placement === "options") {
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .insertContent(text)
        .run();
    } else if (action.placement === "insert-after") {
      editor
        .chain()
        .focus()
        .setTextSelection(to)
        .insertContent((text.startsWith("\n") ? "" : "\n") + text)
        .run();
    }
    onAfterApply?.();
    setResult(null);
  };

  useEffect(() => {
    if (!skillMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!skillMenuRef.current) return;
      if (!skillMenuRef.current.contains(event.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [skillMenuOpen]);

  useEffect(() => {
    const offDone = skillApi.onDone((payload) => {
      const active = activeSkillRunRef.current;
      if (!active || payload.runId !== active.runId) return;
      if (payload.status === "completed") {
        // 按 Skill 输出方式落地：非时间线输出直接写回正文（用运行时记录的选区）。
        const applied =
          active.output !== "ai-feedback" &&
          applySkillOutputToEditor(editor, active.output, payload.text ?? "", active.range);
        if (applied) {
          showSkillStatus(`「${active.skillName}」已写入正文`, 3500);
          onAfterApply?.();
        } else {
          showSkillStatus(`「${active.skillName}」已写入时间线`, 3500);
          onPushFeedback?.("", "skill");
        }
      } else if (payload.status === "failed") {
        showSkillStatus(
          `「${active.skillName}」失败：${friendlyErrorMessage(payload.error, "技能运行失败，请稍后重试。")}`,
        );
      } else if (payload.status === "cancelled") {
        showSkillStatus(`「${active.skillName}」已取消`, 3500);
      }
      activeSkillRunRef.current = null;
    });
    return () => offDone();
  }, [onPushFeedback, onAfterApply, editor, showSkillStatus]);

  const runSelectionSkill = async (skill: SkillDefinition) => {
    if (!editor || !projectId || !chapterId) return;
    setSkillMenuOpen(false);
    showSkillStatus(`「${skill.name}」运行中…`);
    const chapterText = editor.state.doc.textBetween(
      0,
      editor.state.doc.content.size,
      "\n",
      "\n",
    );
    // 记录运行时的选区，done 时即便用户已移动光标也能写回原处。
    const { from, to } = editor.state.selection;
    // 用变量默认值组装 manualVariables，让 {{vars.xxx}} 在选中运行时可用。
    const manualVariables: Record<string, string> = {};
    for (const v of skill.variables ?? []) {
      if (v.defaultValue !== undefined) manualVariables[v.key] = v.defaultValue;
    }
    try {
      const response = await skillApi.run({
        skillId: skill.id,
        projectId,
        chapterId,
        chapterTitle: chapterTitle ?? "",
        chapterText,
        selection: selectionText,
        triggerType: "selection",
        manualVariables: Object.keys(manualVariables).length > 0 ? manualVariables : undefined,
        // 非时间线输出无需落库（结果直接写进正文）。
        persist: skill.output === "ai-feedback",
      });
      activeSkillRunRef.current = {
        runId: response.runId,
        skillName: skill.name,
        output: skill.output,
        range: { from, to },
      };
    } catch (err) {
      showSkillStatus(
        `「${skill.name}」启动失败：${friendlyErrorMessage(err, "技能启动失败，请稍后重试。")}`,
      );
    }
  };

  if (!rect && !result && !skillStatus) return null;

  return (
    <>
      {rect && (
        <motion.div
          data-selection-toolbar
          className="fixed z-40 flex gap-1 rounded-lg border border-ink-600 bg-ink-800/95 px-1.5 py-1 text-xs text-ink-100 shadow-xl backdrop-blur"
          style={{
            top: Math.max(8, rect.top - 42),
            left: rect.left + rect.width / 2,
          }}
          // 工具条出现时轻微弹入。注意：motion 的内联 transform 会覆盖 Tailwind 的
          // -translate-x-1/2，所以这里改由 motion 的 x:"-50%" 负责水平居中。
          initial={reduce ? { opacity: 0, x: "-50%" } : { opacity: 0, scale: 0.92, x: "-50%" }}
          animate={{ opacity: 1, scale: 1, x: "-50%" }}
          transition={SPRING_SNAPPY}
        >
          {ACTIONS.map((action) => (
            <Button
              key={action.kind}
              title={action.tip}
              className="px-2 py-1"
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runAction(action)}
              disabled={!!result?.loading}
            >
              {action.label}
            </Button>
          ))}
          {selectionSkills.length > 0 && (
            <div ref={skillMenuRef} className="relative">
              <Button
                title="运行一个选中文本类技能"
                className="gap-0.5 px-2 py-1"
                variant="ghost"
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSkillMenuOpen((v) => !v)}
                disabled={!!result?.loading}
              >
                技能
                <span className="text-[10px] opacity-70">▾</span>
              </Button>
              {skillMenuOpen && (
                <div className="absolute left-1/2 top-full z-50 mt-1 w-56 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-800/95 py-1 text-xs shadow-xl backdrop-blur">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-ink-500">
                    选中文本触发
                  </div>
                  {selectionSkills.map((skill) => (
                    <button
                      key={skill.id}
                      className="block w-full truncate px-3 py-1.5 text-left hover:bg-ink-700"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void runSelectionSkill(skill)}
                      title={skill.prompt.slice(0, 120)}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className="px-1 text-ink-500">|</span>
          <span className="px-1 text-ink-400">{selectionText.length}字</span>
          <span className="px-1 text-ink-500">|</span>
          <label className="flex items-center gap-1 px-1 text-ink-400" title="一次生成几个可选版本">
            候选
            <Select
              className="w-auto rounded border-ink-600 bg-ink-900 px-1 py-0.5 text-xs"
              value={candidateCount}
              onChange={(e) => setCandidateCount(Number(e.target.value) as 1 | 2 | 3)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </Select>
          </label>
        </motion.div>
      )}
      <AnimatePresence initial={false}>
        {skillStatus && !rect ? (
          <motion.div
            key={skillStatus}
            data-selection-toolbar
            role={skillStatus.includes("失败") ? "alert" : "status"}
            className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-800/95 px-3 py-1.5 text-xs text-ink-200 shadow-xl backdrop-blur"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {skillStatus}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {result && (
        <ResultPopover result={result} onApply={apply} onClose={() => setResult(null)} />
      )}
    </>
  );
}

interface ResultPopoverProps {
  result: QuickResult;
  onApply: (text: string) => void;
  onClose: () => void;
}

function ResultPopover({ result, onApply, onClose }: ResultPopoverProps): JSX.Element {
  const { action, response, error, loading } = result;
  const title =
    action.kind === "polish"
      ? "润色结果"
      : action.kind === "critique"
        ? "审查意见"
        : action.kind === "continue"
          ? "续写草稿"
          : "代入改写";
  const options = response?.options ?? (response?.text ? [response.text] : []);

  return (
    <AnimatedDialog
      open
      onClose={onClose}
      ariaLabel={title}
      overlayClassName="flex items-center justify-center px-4"
      zClassName="z-50"
      panelClassName="w-full max-w-xl rounded-xl border border-ink-600 bg-ink-800 p-4 shadow-2xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
        <Button
          className="px-2 py-1"
          variant="ghost"
          size="sm"
          onClick={onClose}
        >
          关闭
        </Button>
      </div>
      {loading && (
        <div className="py-6 text-center text-sm text-ink-400">模型正在生成，请稍候…</div>
      )}
      {!loading && error && <div className="text-sm text-red-400">失败：{error}</div>}
      {!loading && response?.status === "failed" && (
        <div className="text-sm text-red-400">
          失败：{friendlyErrorMessage(response.error, "生成失败，请稍后重试。")}
        </div>
      )}
      {!loading && response?.status === "completed" && options.length > 0 && (
        <ul className="space-y-3">
          {options.map((text, idx) => (
            <li
              key={idx}
              className="rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2 text-[13px] leading-6 text-ink-100"
            >
              <div className="whitespace-pre-wrap">{text}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-ink-400">
                <span>
                  {options.length > 1 ? `方案 ${idx + 1}` : ""}
                  {response.durationMs > 0 && ` · ${(response.durationMs / 1000).toFixed(1)}s`}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(text)}
                  >
                    复制
                  </Button>
                  {action.placement !== "timeline" && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onApply(text)}
                    >
                      {action.placement === "insert-after" ? "追加" : "替换"}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AnimatedDialog>
  );
}
