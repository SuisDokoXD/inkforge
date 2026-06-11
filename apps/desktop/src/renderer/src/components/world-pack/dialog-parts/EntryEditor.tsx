// =============================================================================
// EntryEditor —— 单条目编辑表单（v25 CCv3 字段加成版）
// =============================================================================
// 右栏渲染当前选中 entry 的完整字段，分两个区块：
//   基础字段：标题/类目/正文/别名/keys/position/probability
//   高级字段（折叠）：secondaryKeys + selectiveLogic + caseSensitive + constant
// 全部走 defaultValue + onBlur 提交（避免每个 keystroke 都触发 mutation）。
// =============================================================================

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  WorldEntryPosition,
  WorldEntrySelectiveLogic,
  WorldPackEntryRecord,
} from "@inkforge/shared";
import { FieldLabel } from "./DialogShell";

interface Props {
  entry: WorldPackEntryRecord;
  categoryOptions: string[];
  onUpdate(patch: Partial<WorldPackEntryRecord>): void;
}

const LOGIC_OPTIONS: Array<{ value: WorldEntrySelectiveLogic; label: string; hint: string }> = [
  { value: "and_any", label: "主关键词 + 任一辅助词", hint: "默认。没有辅助关键词时，只判断主关键词。" },
  { value: "and_all", label: "主关键词 + 全部辅助词", hint: "辅助关键词必须全部出现才会参考本条。" },
  { value: "not_any", label: "主关键词出现，辅助词都不出现", hint: "任一辅助关键词出现时，不参考本条。" },
  { value: "not_all", label: "主关键词出现，辅助词不全出现", hint: "辅助关键词不能全部同时出现。" },
];

export function EntryEditor({ entry, categoryOptions, onUpdate }: Props): JSX.Element {
  const dataListId = `category-options-${entry.id}`;
  // 高级面板默认折叠；如果当前 entry 已经用了高级字段（说明用户在意），自动展开
  const hasAdvancedConfig =
    entry.secondaryKeys.length > 0 ||
    entry.selectiveLogic !== "and_any" ||
    entry.caseSensitive ||
    entry.constant;
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(hasAdvancedConfig);

  return (
    <div className="flex flex-col gap-3 p-5">
      {/* 基础区 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>条目标题</FieldLabel>
          <input
            aria-label="条目标题"
            defaultValue={entry.title}
            onBlur={(e) =>
              e.target.value !== entry.title && onUpdate({ title: e.target.value })
            }
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
          />
        </div>
        <div>
          <FieldLabel>类目</FieldLabel>
          <input
            aria-label="类目"
            defaultValue={entry.category}
            list={dataListId}
            onBlur={(e) =>
              e.target.value !== entry.category && onUpdate({ category: e.target.value })
            }
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
            placeholder="人物 / 地点 / 物件 / 概念..."
          />
          <datalist id={dataListId}>
            {categoryOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <FieldLabel>正文设定</FieldLabel>
      <textarea
        aria-label="正文设定"
        defaultValue={entry.content}
        rows={10}
        onBlur={(e) =>
          e.target.value !== entry.content && onUpdate({ content: e.target.value })
        }
        className="resize-none rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm leading-relaxed text-ink-100 focus:border-accent-500/60 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
        placeholder="完整描述这个设定。命中后，模型写作会优先参考。"
      />

      <FieldLabel>别名（逗号分隔，会自动作为触发关键词）</FieldLabel>
      <input
        aria-label="别名"
        defaultValue={entry.aliases.join(", ")}
        onBlur={(e) => {
          const next = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (next.join(",") !== entry.aliases.join(","))
            onUpdate({ aliases: next });
        }}
        className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none"
        placeholder="同义名 / 称呼，如：林晚, 小晚"
      />

      <FieldLabel>额外触发关键词（除名字/别名之外）</FieldLabel>
      <input
        aria-label="额外触发关键词"
        defaultValue={entry.keys.join(", ")}
        onBlur={(e) => {
          const next = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (next.join(",") !== entry.keys.join(","))
            onUpdate({ keys: next });
        }}
        className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none"
        placeholder="非名字但希望命中本条的词，如：施法, 灵气"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>参考位置</FieldLabel>
          <select
            aria-label="参考位置"
            defaultValue={entry.position}
            onChange={(e) =>
              onUpdate({ position: e.target.value as WorldEntryPosition })
            }
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100"
          >
            <option value="before">写作要求前</option>
            <option value="after">写作要求后</option>
            <option value="at_depth">靠近正文上下文</option>
          </select>
        </div>
        <div>
          <FieldLabel>触发概率（0-100）</FieldLabel>
          <input
            aria-label="触发概率"
            type="number"
            min={0}
            max={100}
            defaultValue={entry.probability}
            onBlur={(e) => {
              const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              if (v !== entry.probability) onUpdate({ probability: v });
            }}
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs text-ink-300 hover:bg-ink-800/50 hover:text-ink-100"
      >
        {advancedOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        高级触发规则
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-3 rounded-md border border-ink-700 bg-ink-900/40 p-3">
          {/* constant 与 caseSensitive：单行两 toggle */}
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-200">
              <input
                aria-label="总是参考"
                type="checkbox"
                checked={entry.constant}
                onChange={(e) => onUpdate({ constant: e.target.checked })}
                className="h-3.5 w-3.5 accent-accent-500"
              />
              <span>
                <strong className="text-ink-100">总是参考</strong>
                <span className="ml-1 text-ink-400">
                  — 不判断关键词，每次写作都参考。适合“必读设定”
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-200">
              <input
                aria-label="大小写敏感"
                type="checkbox"
                checked={entry.caseSensitive}
                onChange={(e) => onUpdate({ caseSensitive: e.target.checked })}
                className="h-3.5 w-3.5 accent-accent-500"
              />
              <span>
                <strong className="text-ink-100">大小写敏感</strong>
                <span className="ml-1 text-ink-400">
                  — 英文场景才有意义；中文无差异
                </span>
              </span>
            </label>
          </div>

          <div>
            <FieldLabel>辅助关键词（逗号分隔）</FieldLabel>
            <input
              aria-label="辅助关键词"
              defaultValue={entry.secondaryKeys.join(", ")}
              onBlur={(e) => {
                const next = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (next.join(",") !== entry.secondaryKeys.join(","))
                  onUpdate({ secondaryKeys: next });
              }}
              className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-accent-500/60 focus:outline-none"
              placeholder="需要与主关键词组合判断的词，如：战斗, 紧张"
            />
            <p className="mt-1 text-[11px] text-ink-400">
              留空时只判断主关键词；填写后会配合下面的组合方式一起判断。
            </p>
          </div>

          <div>
            <FieldLabel>多关键词组合方式</FieldLabel>
            <select
              aria-label="多关键词组合方式"
              defaultValue={entry.selectiveLogic}
              onChange={(e) =>
                onUpdate({
                  selectiveLogic: e.target.value as WorldEntrySelectiveLogic,
                })
              }
              className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100"
            >
              {LOGIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-400">
              {LOGIC_OPTIONS.find((o) => o.value === entry.selectiveLogic)?.hint}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
