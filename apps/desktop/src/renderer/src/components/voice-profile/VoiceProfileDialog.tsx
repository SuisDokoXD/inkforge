// =============================================================================
// Voice Profile（写作声音档案）问卷对话框
// =============================================================================
// 让用户用一份结构化问卷描述自己的写作风格，后续模型生成时
// 会自动把这段写作声音加入参考，避免落入通用口吻。
//
// 设计要点：
//   - 单页滚动表单（不是多步向导）：作者一次性扫一遍更省心
//   - 每个问题给若干推荐选项 + 自由文本，"哪个都不像就自己写"
//   - 顶部"启用开关"独立于"完成时间"：可以填好但暂时关掉
//   - 保存时本地 service 自动渲染 promptBlock，renderer 不必关心模板
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Settings, X } from "lucide-react";
import { AnimatedDialog } from "../AnimatedDialog";
import { MotionSpinner } from "../MotionSpinner";
import { Button, IconButton } from "../ui";
import { voiceProfileApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";

interface Props {
  open: boolean;
  projectId: string;
  onClose(): void;
}

// 问卷字段定义：key 与服务端 FIELD_LABELS 对齐。
type QuestionSpec = {
  key: string;
  label: string;
  hint?: string;
  presets: string[];
  freeText?: boolean; // true: textarea + 输入；false: 单选 chip + 输入
};

const QUESTIONS: QuestionSpec[] = [
  {
    key: "sentence_rhythm",
    label: "句子节奏",
    hint: "决定段落的呼吸感",
    presets: ["短促有力", "中等平衡", "偏长舒缓"],
  },
  {
    key: "voice_register",
    label: "叙述语气",
    hint: "你的叙述更像哪种？",
    presets: ["口语化", "中性文笔", "偏文雅书面", "文白参半"],
  },
  {
    key: "dialogue_density",
    label: "对话密度",
    presets: ["几乎没有对话", "对话与叙述平衡", "对话占多数"],
  },
  {
    key: "pov",
    label: "叙述视角",
    presets: ["第一人称", "第三人称限制视角", "第三人称全知"],
  },
  {
    key: "tense",
    label: "时态",
    presets: ["现在时为主", "过去时为主"],
  },
  {
    key: "sensory_focus",
    label: "感官焦点",
    hint: "你最常描写的感官类型？",
    presets: ["视觉为主", "听觉敏锐", "嗅味觉强", "触觉为先", "多元综合"],
  },
  {
    key: "description_density",
    label: "描写密度",
    presets: ["极简白描", "中等点缀", "浓墨重彩"],
  },
  {
    key: "emotional_temperature",
    label: "情感温度",
    presets: ["冷峻克制", "温和细腻", "热烈外放"],
  },
  {
    key: "metaphor_style",
    label: "比喻习惯",
    presets: ["几乎不用比喻", "常规比喻", "大量原创比喻"],
  },
  {
    key: "prose_preference",
    label: "散文偏好",
    hint: "决定正文更像故事推进还是散文铺陈",
    presets: ["游记散文", "抒情散文", "生活随笔", "山水小品", "叙事散文"],
  },
  {
    key: "section_structure",
    label: "结构偏好",
    hint: "需要小标题和分节时写在这里",
    presets: [
      "使用 3-6 个小标题分节",
      "每节先写所见，再写所感",
      "按行踪推进：起程、入景、驻足、回望",
      "不用小标题，只靠段落呼吸",
    ],
  },
  {
    key: "literary_inheritance",
    label: "文学气息",
    hint: "不是仿写原句，而是吸收气质",
    presets: [
      "中国现代散文的清淡克制",
      "古典山水文的留白与节制",
      "游记传统里的行踪、景物、心绪并重",
      "白描为主，少用网络腔",
    ],
  },
  {
    key: "forbidden_words",
    label: "禁用词",
    hint: "模型写作时坚决避免使用的词（逗号分隔）",
    presets: [],
    freeText: true,
  },
  {
    key: "loved_words",
    label: "偏爱词",
    hint: "希望多出现的字眼或腔调（逗号分隔）",
    presets: [],
    freeText: true,
  },
  {
    key: "inspiration_authors",
    label: "参考笔调",
    hint: "希望整体气质靠近哪几位作者（逗号分隔）",
    presets: [],
    freeText: true,
  },
];

export function VoiceProfileDialog({ open, projectId, onClose }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const profileQuery = useQuery({
    queryKey: ["voice-profile", projectId],
    queryFn: () => voiceProfileApi.get({ projectId }),
    enabled: open,
  });

  // 本地表单状态：拷贝服务端答案到 local；保存时回写整个 answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean>(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (profileQuery.data) {
      setAnswers(profileQuery.data.answers ?? {});
      setEnabled(!!profileQuery.data.enabled);
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (open) setSaveError(null);
  }, [open]);

  const completion = useMemo(() => {
    const filled = QUESTIONS.filter((q) => (answers[q.key] ?? "").trim()).length;
    return { filled, total: QUESTIONS.length };
  }, [answers]);

  const saveMutation = useMutation({
    mutationFn: () =>
      voiceProfileApi.upsert({
        projectId,
        answers,
        enabled,
        completedAt:
          completion.filled === completion.total ? new Date().toISOString() : null,
      }),
    onMutate: () => {
      setSaveError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voice-profile", projectId] });
      onClose();
    },
    onError: (error) => {
      setSaveError(friendlyErrorMessage(error, "保存写作声音档案失败，请稍后重试。"));
    },
  });

  function setAnswer(key: string, value: string): void {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy="voice-profile-title"
      overlayClassName="flex items-center justify-center p-4"
      panelClassName="flex h-full max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl"
    >
      <motion.div
        className="flex min-h-0 flex-1 flex-col"
        variants={reduce ? fadeOnly : fadeSlideUp}
        initial="initial"
        animate="animate"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-950/60 px-4 py-3">
          <div>
            <h2 id="voice-profile-title" className="flex items-center gap-2 text-base font-semibold text-ink-100">
              <Settings className="h-4 w-4 text-accent-400" />
              写作声音档案
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              填完后，模型生成会按你的风格输出 · {completion.filled}/{completion.total} 已填写
            </p>
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            className="hover:bg-ink-800 hover:text-ink-100"
            onClick={onClose}
            aria-label="关闭写作声音档案"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <motion.label
            className="mb-4 flex cursor-pointer items-center gap-2 rounded-md border border-ink-700 bg-ink-800/50 p-3 text-sm"
            variants={reduce ? fadeOnly : fadeSlideUp}
            initial="initial"
            animate="animate"
            whileHover={hoverLift}
            whileTap={tapPress}
          >
            <input
              type="checkbox"
              aria-label="启用写作声音档案"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-accent-500"
            />
            <span className="text-ink-100">
              启用本档案 — 让模型生成跟随这套写作声音
            </span>
          </motion.label>

          <motion.ol
            className="space-y-5"
            variants={reduce ? undefined : staggerContainer}
            initial="initial"
            animate="animate"
          >
            {QUESTIONS.map((q, idx) => (
              <motion.li key={q.key} variants={reduce ? fadeOnly : staggerItem}>
                <div className="mb-2">
                  <span className="mr-2 inline-block w-6 rounded bg-ink-800 px-1.5 py-0.5 text-center text-[11px] font-mono text-ink-400">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-ink-100">{q.label}</span>
                  {q.hint && (
                    <span className="ml-2 text-[11px] text-ink-500">— {q.hint}</span>
                  )}
                </div>
                {q.presets.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {q.presets.map((preset) => {
                      const active = (answers[q.key] ?? "") === preset;
                      return (
                        <motion.button
                          key={preset}
                          type="button"
                          onClick={() => setAnswer(q.key, active ? "" : preset)}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
                            active
                              ? "bg-accent-500 text-ink-900"
                              : "bg-ink-800 text-ink-300 hover:bg-ink-700"
                          }`}
                          whileHover={hoverLift}
                          whileTap={tapPress}
                        >
                          {active && <Check className="h-3 w-3" />}
                          {preset}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
                {q.freeText ? (
                  <textarea
                    aria-label={`${q.label}自由填写`}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none"
                    placeholder="自由填写，逗号分隔"
                  />
                ) : (
                  <input
                    aria-label={`${q.label}填写`}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    className="w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none"
                    placeholder="预设之外可自行输入"
                  />
                )}
              </motion.li>
            ))}
          </motion.ol>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-ink-700 bg-ink-950/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className="text-xs text-ink-400">
              进度 {completion.filled}/{completion.total}
            </span>
            <div className="mt-1 h-1.5 max-w-40 overflow-hidden rounded-full bg-ink-800">
              <motion.div
                className="h-full rounded-full bg-accent-500"
                initial={false}
                animate={{ width: `${(completion.filled / completion.total) * 100}%` }}
              />
            </div>
            <AnimatePresence mode="wait">
              {saveError && (
                <motion.p
                  key={saveError}
                  role="alert"
                  className="mt-1 text-[11px] text-red-300"
                  variants={reduce ? fadeOnly : fadeSlideUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {saveError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="md"
              className="px-3 text-ink-300 hover:bg-ink-800 hover:text-ink-300"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="md"
              className="px-3 disabled:opacity-60"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && (
                <MotionSpinner className="h-3.5 w-3.5" />
              )}
              保存
            </Button>
          </div>
        </footer>
      </motion.div>
    </AnimatedDialog>
  );
}
