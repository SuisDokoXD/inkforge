// =============================================================================
// Voice Profile（写作声音档案）问卷对话框
// =============================================================================
// 让用户用一份结构化问卷把自己的写作风格"喂"给系统，所有 AI 生成走系统时
// 都自动把这段配方拼到 system prompt 里，避免 AI 用通用 GPT 口吻写小说。
//
// 设计要点：
//   - 单页滚动表单（不是多步向导）：作者一次性扫一遍更省心
//   - 每个问题给若干推荐选项 + 自由文本，"哪个都不像就自己写"
//   - 顶部"启用开关"独立于"完成时间"：可以填好但暂时关掉
//   - 保存时本地 service 自动渲染 promptBlock，renderer 不必关心模板
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Settings, X } from "lucide-react";
import { voiceProfileApi } from "../../lib/api";

interface Props {
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
    label: "语体登记",
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
    label: "视点 POV",
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
    key: "forbidden_words",
    label: "禁用词",
    hint: "AI 写作时坚决避免使用的词（逗号分隔）",
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

export function VoiceProfileDialog({ projectId, onClose }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["voice-profile", projectId],
    queryFn: () => voiceProfileApi.get({ projectId }),
  });

  // 本地表单状态：拷贝服务端答案到 local；保存时回写整个 answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (profileQuery.data) {
      setAnswers(profileQuery.data.answers ?? {});
      setEnabled(!!profileQuery.data.enabled);
    }
  }, [profileQuery.data]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voice-profile", projectId] });
      onClose();
    },
  });

  function setAnswer(key: string, value: string): void {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-full max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-950/60 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-100">
              <Settings className="h-4 w-4 text-accent-400" />
              写作声音档案
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              填完后所有 AI 生成都会按你的风格输出 · {completion.filled}/{completion.total} 已填写
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <label className="mb-4 flex cursor-pointer items-center gap-2 rounded-md border border-ink-700 bg-ink-800/50 p-3 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-accent-500"
            />
            <span className="text-ink-100">
              启用本档案 — 让 AI 生成跟随这套写作声音
            </span>
          </label>

          <ol className="space-y-5">
            {QUESTIONS.map((q, idx) => (
              <li key={q.key}>
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
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAnswer(q.key, active ? "" : preset)}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
                            active
                              ? "bg-accent-500 text-ink-900"
                              : "bg-ink-800 text-ink-300 hover:bg-ink-700"
                          }`}
                        >
                          {active && <Check className="h-3 w-3" />}
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                )}
                {q.freeText ? (
                  <textarea
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none"
                    placeholder="自由填写，逗号分隔"
                  />
                ) : (
                  <input
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    className="w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none"
                    placeholder="预设之外可自行输入"
                  />
                )}
              </li>
            ))}
          </ol>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-ink-700 bg-ink-950/60 px-4 py-3">
          <span className="text-xs text-ink-400">
            进度 {completion.filled}/{completion.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-ink-300 hover:bg-ink-800"
            >
              取消
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-accent-400 disabled:opacity-60"
            >
              {saveMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
