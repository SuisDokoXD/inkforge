// =============================================================================
// 作者批注面板（UI 优化版）
// =============================================================================
// 优化点：
//   - 字符计数 + 警戒色（超过 800 字以红色提示）
//   - 5 个预设模板下拉，一键追加（不覆盖现有文本）
//   - 整体配色 / spacing 提升，文本区给更大编辑空间
//   - position 选项加更明显的视觉差异（before=琥珀 / after=红，象征强约束）
// =============================================================================

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff, Sparkles, ChevronDown } from "lucide-react";
import { authorNoteApi } from "../lib/api";
import type { AuthorNotePosition } from "@inkforge/shared";

interface Props {
  projectId: string;
}

const PRESET_TEMPLATES: Array<{ name: string; text: string }> = [
  {
    name: "冷峻克制风",
    text: `- 行文克制内敛，避免堆砌华丽辞藻
- 人物情感靠动作和细节表达，不写心理活动
- 整体基调偏向冷峻、节制、留白`,
  },
  {
    name: "热血爽文风",
    text: `- 节奏明快，每章必有冲突与爽点
- 主角能力线清晰，打脸/反转节奏紧凑
- 对话生动，可适当夸张但不油腻`,
  },
  {
    name: "古典文言味",
    text: `- 行文偏古雅，可用四字短语和文言虚词
- 慎用现代外来词与网络用语
- 描写讲究意境，重虚实相生`,
  },
  {
    name: "心理细腻向",
    text: `- 重视人物内心活动与情绪流转
- 慢节奏，对白少而精
- 善用比喻与通感`,
  },
  {
    name: "禁忌词清单",
    text: `- 禁止使用"突然"、"忽然"等硬转折词
- 禁止"心中暗想"这类直陈心理
- 避免"漂亮的不像话"等网文俗语`,
  },
];

const MAX_RECOMMENDED = 800;

export function AuthorNotePanel({ projectId }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const noteQuery = useQuery({
    queryKey: ["author-note", projectId],
    queryFn: () => authorNoteApi.get({ projectId }),
  });

  const [draft, setDraft] = useState("");
  const [position, setPosition] = useState<AuthorNotePosition>("before");
  const [enabled, setEnabled] = useState(true);
  const [presetOpen, setPresetOpen] = useState(false);

  useEffect(() => {
    const n = noteQuery.data;
    if (n) {
      setDraft(n.text);
      setPosition(n.position);
      setEnabled(n.enabled);
    } else {
      setDraft("");
      setPosition("before");
      setEnabled(true);
    }
  }, [noteQuery.data]);

  const upsertMutation = useMutation({
    mutationFn: (input: {
      text?: string;
      position?: AuthorNotePosition;
      enabled?: boolean;
    }) => authorNoteApi.upsert({ projectId, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["author-note", projectId] });
    },
  });

  function saveText(): void {
    if (draft === (noteQuery.data?.text ?? "")) return;
    upsertMutation.mutate({ text: draft });
  }

  function insertPreset(preset: { name: string; text: string }): void {
    const next = draft.trim() ? `${draft.trim()}\n\n${preset.text}` : preset.text;
    setDraft(next);
    setPresetOpen(false);
    // 立即保存，免得用户漏点
    upsertMutation.mutate({ text: next });
  }

  const charCount = draft.length;
  const overLimit = charCount > MAX_RECOMMENDED;

  return (
    <div className="flex h-full w-full bg-ink-900">
      {/* ===== 左：编辑器主体 ===== */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        {/* 头部：标题 + 启用 toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink-100">
              <Pin className="h-4 w-4 text-accent-400" />
              作者批注
            </h3>
            <p className="mt-0.5 text-xs text-ink-400">
              每次模型写作和技能运行都会参考这段文字，用来稳定口吻、风格和禁忌
            </p>
          </div>
          <button
            onClick={() => {
              const next = !enabled;
              setEnabled(next);
              upsertMutation.mutate({ enabled: next });
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all ${
              enabled
                ? "bg-accent-500 text-ink-900 shadow-md shadow-accent-500/20"
                : "border border-ink-700 bg-ink-800/60 text-ink-400 hover:text-ink-200"
            }`}
            title={enabled ? "当前生效（点击禁用）" : "当前禁用（点击启用）"}
          >
            {enabled ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            {enabled ? "生效中" : "已禁用"}
          </button>
        </div>

        {/* 工具栏：预设下拉 */}
        <div className="relative">
          <button
            onClick={() => setPresetOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-1.5 text-sm text-ink-200 hover:border-accent-500/40 hover:bg-ink-800"
          >
            <Sparkles className="h-4 w-4 text-accent-400" />
            插入预设模板
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${presetOpen ? "rotate-180" : ""}`} />
          </button>
          {presetOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 w-72 overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-xl ring-1 ring-accent-500/20">
              {PRESET_TEMPLATES.map((p) => (
                <button
                  key={p.name}
                  onClick={() => insertPreset(p)}
                  className="block w-full border-b border-ink-700/60 px-3 py-2 text-left last:border-b-0 hover:bg-accent-500/10"
                >
                  <div className="text-sm font-medium text-ink-100">{p.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-400">
                    {p.text.split("\n")[0]}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 主编辑区 */}
        <div className="relative flex-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveText}
            placeholder={`例：
- 行文克制内敛，避免堆砌华丽辞藻
- 人物对话不超过两句一段
- 禁止出现"突然"、"忽然"这类硬转折词
- 整体基调偏向冷峻、节制

或点上方"插入预设模板"快速开始`}
            className="h-full w-full resize-none rounded-lg border border-ink-700 bg-ink-800/60 p-4 font-mono text-sm leading-relaxed text-ink-100 placeholder:text-ink-500 focus:border-accent-500/60 focus:bg-ink-800/80 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
          />
          {/* 字符计数 */}
          <div
            className={`absolute bottom-2 right-3 rounded-full bg-ink-900/80 px-2 py-0.5 text-[10px] backdrop-blur-sm ${
              overLimit ? "text-red-300 ring-1 ring-red-500/40" : "text-ink-500"
            }`}
            title={overLimit ? "超过推荐长度，可能挤占模型可参考内容" : ""}
          >
            {charCount}
            {overLimit ? ` / ${MAX_RECOMMENDED}（偏长）` : ""}
          </div>
        </div>

        {/* 保存指示器 */}
        {upsertMutation.isPending && (
          <div className="text-xs text-ink-500">保存中…</div>
        )}
      </div>

      {/* ===== 右：参考时机 + 说明 ===== */}
      <aside className="w-[300px] shrink-0 border-l border-ink-700 bg-ink-900/40 p-5">
        <h4 className="text-sm font-medium text-ink-200">参考时机</h4>
        <p className="mt-1 text-xs text-ink-400">
          决定模型在写作前后何时看到这段批注。越靠近输出，硬性约束越强。
        </p>

        <div className="mt-4 space-y-2">
          <PositionRadio
            value="before"
            current={position}
            label="写作前"
            hint="作为全局背景，与世界观一起提前参考"
            accent="amber"
            onChange={(v) => {
              setPosition(v);
              upsertMutation.mutate({ position: v });
            }}
          />
          <PositionRadio
            value="after"
            current={position}
            label="写作后"
            hint="更贴近输出，对硬性规则约束更强"
            accent="rose"
            onChange={(v) => {
              setPosition(v);
              upsertMutation.mutate({ position: v });
            }}
          />
        </div>

        <div className="mt-8 rounded-lg border border-ink-700 bg-ink-800/40 p-3 text-xs text-ink-400">
          <div className="font-medium text-ink-300">💡 使用建议</div>
          <ul className="mt-2 space-y-1 list-disc pl-4">
            <li>风格类约束放写作前，让模型先吸收整体口吻</li>
            <li>禁忌词、硬性规则放写作后，贴近输出更难被忽略</li>
            <li>不超过 800 字符，免得挤占有限可参考内容</li>
            <li>临时不想生效可点右上开关禁用，不必删内容</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function PositionRadio({
  value,
  current,
  label,
  hint,
  accent,
  onChange,
}: {
  value: AuthorNotePosition;
  current: AuthorNotePosition;
  label: string;
  hint: string;
  accent: "amber" | "rose";
  onChange(v: AuthorNotePosition): void;
}): JSX.Element {
  const active = current === value;
  const accentRing = accent === "rose" ? "ring-rose-400/60" : "ring-accent-400/60";
  const accentBg = accent === "rose" ? "bg-rose-500/15" : "bg-accent-500/15";
  return (
    <label
      className={`flex cursor-pointer gap-2 rounded-lg border p-3 transition-all ${
        active
          ? `border-transparent ${accentBg} ring-1 ${accentRing}`
          : "border-ink-700 bg-ink-800/40 hover:border-ink-600"
      }`}
    >
      <input
        type="radio"
        checked={active}
        onChange={() => onChange(value)}
        className={accent === "rose" ? "mt-0.5 accent-rose-500" : "mt-0.5 accent-accent-500"}
      />
      <div>
        <div className={`text-sm font-medium ${active ? "text-ink-100" : "text-ink-200"}`}>
          {label}
        </div>
        <div className="mt-0.5 text-xs text-ink-400">{hint}</div>
      </div>
    </label>
  );
}
