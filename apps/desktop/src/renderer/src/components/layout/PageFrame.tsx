import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  FileText,
  GitBranch,
  Globe2,
  LibraryBig,
  ListTree,
  Mail,
  Puzzle,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import type { MainView } from "../../stores/app-store";
import { Button } from "../ui";

const PAGE_META: Record<Exclude<MainView, "writing">, { title: string; description: string; section: string; Icon: typeof BookOpen }> = {
  outline: { title: "大纲", description: "把故事结构拆成可执行的章节计划。", section: "写作", Icon: ListTree },
  bookshelf: { title: "书架", description: "管理作品、项目设定和最近写作。", section: "项目", Icon: LibraryBig },
  skill: { title: "写作技能", description: "创建可重复使用的写作指令。", section: "AI 工具", Icon: Puzzle },
  tavern: { title: "酒馆", description: "让多个角色围绕当前问题协作。", section: "AI 工具", Icon: Bot },
  review: { title: "正文审查", description: "集中处理结构、节奏和连续性问题。", section: "AI 工具", Icon: ClipboardCheck },
  "auto-writer": { title: "续写精修", description: "从当前正文继续生成和整理草稿。", section: "AI 工具", Icon: Sparkles },
  character: { title: "人物", description: "维护人物卡、关系和出场信息。", section: "世界", Icon: Users },
  world: { title: "世界观", description: "整理地点、规则、组织和关系网络。", section: "世界", Icon: Globe2 },
  research: { title: "资料", description: "收集写作所需的背景资料和来源。", section: "世界", Icon: FileText },
  letters: { title: "来信", description: "查看来自角色和世界的写作提示。", section: "项目", Icon: Mail },
  achievement: { title: "成就", description: "回看持续写作留下的里程碑。", section: "统计", Icon: Trophy },
  materials: { title: "素材库", description: "保存可复用的片段、灵感和参考。", section: "项目", Icon: LibraryBig },
  stats: { title: "数据统计", description: "了解作品进度和个人写作节奏。", section: "统计", Icon: BarChart3 },
  timeline: { title: "时间线", description: "按章节查看情节事件和时间顺序。", section: "写作", Icon: GitBranch },
};

const SECTION_ITEMS: Record<string, Array<{ view: MainView; label: string }>> = {
  写作: [{ view: "writing", label: "正文" }, { view: "outline", label: "大纲" }, { view: "timeline", label: "时间线" }],
  世界: [{ view: "character", label: "人物" }, { view: "world", label: "世界观" }, { view: "research", label: "资料" }],
  "AI 工具": [{ view: "skill", label: "写作技能" }, { view: "review", label: "正文审查" }, { view: "auto-writer", label: "续写精修" }, { view: "tavern", label: "酒馆" }],
  项目: [{ view: "bookshelf", label: "书架" }, { view: "materials", label: "素材库" }, { view: "letters", label: "来信" }],
  统计: [{ view: "stats", label: "数据统计" }, { view: "achievement", label: "成就" }],
};

export function PageFrame({ view, children }: { view: Exclude<MainView, "writing">; children: ReactNode }): JSX.Element {
  const projectId = useAppStore((state) => state.currentProjectId);
  const setMainView = useAppStore((state) => state.setMainView);
  const meta = PAGE_META[view];
  const Icon = meta.Icon;

  return (
    <div className="page-frame flex min-h-0 h-full w-full flex-col bg-ink-900 text-ink-100">
      <header className="page-context-bar flex h-12 shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-800/55 px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-500">{meta.section}</span>
          <span className="text-ink-600" aria-hidden="true">/</span>
          <h1 className="truncate text-sm font-semibold text-ink-100">{meta.title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {projectId ? <span className="hidden text-xs text-ink-500 sm:inline">当前书籍已连接</span> : null}
          <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new Event("inkforge:open-command-palette"))}>
            快捷操作 <kbd className="ml-1 rounded border border-ink-600 px-1 py-0.5 text-[10px] text-ink-500">Ctrl K</kbd>
          </Button>
        </div>
      </header>
      <nav className="page-subnav flex min-h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-ink-700/80 bg-ink-900/70 px-4 scrollbar-thin" aria-label={`${meta.section}功能`}>
        <span className="mr-2 hidden shrink-0 text-xs text-ink-500 md:inline">{meta.description}</span>
        <span className="mr-1 hidden h-4 w-px bg-ink-700 md:inline" aria-hidden="true" />
        {SECTION_ITEMS[meta.section].map((item) => (
          <button
            key={item.view}
            type="button"
            onClick={() => setMainView(item.view)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors ${item.view === view ? "bg-accent-500/15 text-accent-200" : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"}`}
            aria-current={item.view === view ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="page-frame-content min-h-0 flex-1">{children}</div>
    </div>
  );
}
