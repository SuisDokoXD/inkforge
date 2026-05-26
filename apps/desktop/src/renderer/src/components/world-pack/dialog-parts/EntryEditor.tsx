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

// SillyTavern 风格的 selectiveLogic 中文标签 + 提示。
const LOGIC_OPTIONS: Array<{ value: WorldEntrySelectiveLogic; label: string; hint: string }> = [
  { value: "and_any", label: "AND_ANY · 主命中 且 次任一命中", hint: "默认。当 secondaryKeys 为空时退化为 '仅主命中'" },
  { value: "and_all", label: "AND_ALL · 主命中 且 次全部命中", hint: "次关键词必须全部出现" },
  { value: "not_any", label: "NOT_ANY · 主命中 且 次全没命中", hint: "次关键词出现任一就不触发" },
  { value: "not_all", label: "NOT_ALL · 主命中 且 次不全命中", hint: "次关键词不能全部同时出现" },
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
            defaultValue={entry.title}
            onBlur={(e) =>
              e.target.value !== entry.title && onUpdate({ title: e.target.value })
            }
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          />
        </div>
        <div>
          <FieldLabel>类目</FieldLabel>
          <input
            defaultValue={entry.category}
            list={dataListId}
            onBlur={(e) =>
              e.target.value !== entry.category && onUpdate({ category: e.target.value })
            }
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
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
        defaultValue={entry.content}
        rows={10}
        onBlur={(e) =>
          e.target.value !== entry.content && onUpdate({ content: e.target.value })
        }
        className="resize-none rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm leading-relaxed text-ink-100 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
        placeholder="完整描述这个设定。激活时会被注入到 LLM 上下文。"
      />

      <FieldLabel>别名（逗号分隔，会自动作为触发关键词）</FieldLabel>
      <input
        defaultValue={entry.aliases.join(", ")}
        onBlur={(e) => {
          const next = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (next.join(",") !== entry.aliases.join(","))
            onUpdate({ aliases: next });
        }}
        className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-amber-500/60 focus:outline-none"
        placeholder="同义名 / 称呼，如：林晚, 小晚"
      />

      <FieldLabel>额外触发关键词（除名字/别名之外）</FieldLabel>
      <input
        defaultValue={entry.keys.join(", ")}
        onBlur={(e) => {
          const next = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (next.join(",") !== entry.keys.join(","))
            onUpdate({ keys: next });
        }}
        className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-amber-500/60 focus:outline-none"
        placeholder="非名字但希望命中本条的词，如：施法, 灵气"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>注入位置</FieldLabel>
          <select
            defaultValue={entry.position}
            onChange={(e) =>
              onUpdate({ position: e.target.value as WorldEntryPosition })
            }
            className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100"
          >
            <option value="before">提示前（before）</option>
            <option value="after">提示后（after）</option>
            <option value="at_depth">深度插入（at_depth）</option>
          </select>
        </div>
        <div>
          <FieldLabel>触发概率（0-100）</FieldLabel>
          <input
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

      {/* 高级字段（v25 CCv3 兼容） */}
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
        高级触发规则（CCv3 兼容）
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-3 rounded-md border border-ink-700 bg-ink-900/40 p-3">
          {/* constant 与 caseSensitive：单行两 toggle */}
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-200">
              <input
                type="checkbox"
                checked={entry.constant}
                onChange={(e) => onUpdate({ constant: e.target.checked })}
                className="h-3.5 w-3.5 accent-amber-500"
              />
              <span>
                <strong className="text-ink-100">永远激活（constant）</strong>
                <span className="ml-1 text-ink-400">
                  — 跳过关键词命中，每次必注入。适合"必读设定"
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-200">
              <input
                type="checkbox"
                checked={entry.caseSensitive}
                onChange={(e) => onUpdate({ caseSensitive: e.target.checked })}
                className="h-3.5 w-3.5 accent-amber-500"
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
            <FieldLabel>次级关键词（secondary_keys，逗号分隔）</FieldLabel>
            <input
              defaultValue={entry.secondaryKeys.join(", ")}
              onBlur={(e) => {
                const next = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (next.join(",") !== entry.secondaryKeys.join(","))
                  onUpdate({ secondaryKeys: next });
              }}
              className="mt-1 w-full rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 focus:border-amber-500/60 focus:outline-none"
              placeholder="需要与主关键词组合判断的词，如：战斗, 紧张"
            />
            <p className="mt-1 text-[11px] text-ink-400">
              留空 = 不启用次级判定。配合下面的 selective_logic 使用。
            </p>
          </div>

          <div>
            <FieldLabel>多关键词组合逻辑（selective_logic）</FieldLabel>
            <select
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
