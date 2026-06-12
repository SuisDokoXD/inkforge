import { Library, Plus, ShoppingCart, Upload } from "lucide-react";
import type { SkillDefinition, SkillScope } from "@inkforge/shared";
import {
  OUTPUT_EFFECTS,
  OUTPUT_LABELS,
  SCOPE_LABELS,
  describeTriggers,
} from "./skill-page-model";

interface SkillLibrarySidebarProps {
  skills: SkillDefinition[];
  isLoading: boolean;
  activeSkillId: string | null;
  filterScope: SkillScope | "all";
  importPending: boolean;
  onCreateNew: () => void;
  onImport: () => void;
  onOpenMarket: () => void;
  onSelectSkill: (id: string) => void;
  onFilterScopeChange: (scope: SkillScope | "all") => void;
}

export function SkillLibrarySidebar({
  skills,
  isLoading,
  activeSkillId,
  filterScope,
  importPending,
  onCreateNew,
  onImport,
  onOpenMarket,
  onSelectSkill,
  onFilterScopeChange,
}: SkillLibrarySidebarProps): JSX.Element {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-ink-700 bg-ink-800/40">
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-3 py-2 text-sm">
        <div className="min-w-0">
          <span className="flex items-center gap-2 font-medium text-accent-300">
            <Library size={16} />
            写作指令库
          </span>
          <p className="mt-0.5 truncate text-[11px] text-ink-500">
            复用润色、审校、续写等写作任务
          </p>
        </div>
        <div className="flex gap-1">
          <button
            className="flex h-8 items-center gap-1 rounded-md border border-ink-600 px-2 text-xs hover:bg-ink-700"
            onClick={onCreateNew}
            title="新建"
          >
            <Plus size={14} />
            新建
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-600 text-xs hover:bg-ink-700"
            onClick={onImport}
            disabled={importPending}
            title="导入写作指令配置"
          >
            <Upload size={14} />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-600 text-xs hover:bg-ink-700"
            onClick={onOpenMarket}
            title="写作指令市场"
          >
            <ShoppingCart size={14} />
          </button>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-700 px-3 py-2 text-xs">
        {(["all", "global", "project", "community"] as const).map((scope) => (
          <button
            key={scope}
            className={`rounded-md px-2 py-1 transition-colors ${
              filterScope === scope
                ? "bg-accent-500/20 text-accent-300"
                : "text-ink-400 hover:bg-ink-700"
            }`}
            onClick={() => onFilterScopeChange(scope)}
          >
            {scope === "all" ? "全部" : SCOPE_LABELS[scope]}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        {isLoading && (
          <div className="px-3 py-4 text-xs text-ink-500">加载中…</div>
        )}
        {skills.map((skill) => (
          <button
            key={skill.id}
            className={`flex w-full flex-col items-start gap-0.5 border-b border-ink-700/40 px-3 py-2 text-left transition-colors ${
              activeSkillId === skill.id ? "bg-ink-700/40" : "hover:bg-ink-700/20"
            }`}
            onClick={() => onSelectSkill(skill.id)}
          >
            <div className="flex w-full items-center justify-between">
              <span className="truncate text-sm font-medium text-ink-100">{skill.name}</span>
              {!skill.enabled && (
                <span className="shrink-0 rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-ink-400">
                  停用
                </span>
              )}
            </div>
            <div className="mt-1 flex max-w-full flex-wrap gap-1 text-[11px] text-ink-400">
              <span className="rounded bg-ink-900/70 px-1.5 py-0.5">
                {SCOPE_LABELS[skill.scope]}
              </span>
              <span className="rounded bg-ink-900/70 px-1.5 py-0.5">
                {OUTPUT_EFFECTS[skill.output]}
              </span>
            </div>
            <div className="mt-1 text-xs leading-5 text-ink-400">
              {describeTriggers(skill.triggers)}
            </div>
            <div className="text-[11px] text-ink-500">
              结果：{OUTPUT_LABELS[skill.output]}
            </div>
          </button>
        ))}
        {skills.length === 0 && !isLoading && (
          <div className="px-4 py-8 text-center text-xs leading-6 text-ink-500">
            还没有写作指令。点「新建」做一个润色、审校或续写工具。
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-ink-700 px-3 py-2 text-xs text-ink-500">
        {isLoading ? "—" : `${skills.length} 个`}
      </div>
    </aside>
  );
}
