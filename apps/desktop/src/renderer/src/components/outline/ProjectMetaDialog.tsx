import { memo } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  BookOpen,
  CheckCircle2,
  Feather,
  FileText,
  MapPin,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { AnimatedDialog } from "../AnimatedDialog";
import { Button, IconButton } from "../ui";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";

export interface ProjectMetaDraft {
  synopsis: string;
  genre: string;
  subGenre: string;
  tags: string;
  globalWorldview: string;
}

interface ProjectMetaDialogProps {
  open: boolean;
  draft: ProjectMetaDraft;
  busy: string | null;
  completeness: { done: number; total: number };
  onChange(patch: Partial<ProjectMetaDraft>): void;
  onClose(): void;
  onSave(): void;
}

interface MetaPreset {
  label: string;
  description: string;
  genre: string;
  subGenre: string;
  tags: string[];
  background?: string;
}

const META_PRESETS: MetaPreset[] = [
  {
    label: "现实散文",
    description: "从一件小事、一段记忆或一种情绪出发。",
    genre: "散文",
    subGenre: "现实",
    tags: ["散文", "现实", "日常", "细腻"],
  },
  {
    label: "游记见闻",
    description: "把行踪、景物、人和回望串成线。",
    genre: "散文",
    subGenre: "游记",
    tags: ["游记", "见闻", "风物", "抒情"],
  },
  {
    label: "都市情绪",
    description: "写当下社会里的关系、压力和余味。",
    genre: "现实",
    subGenre: "都市",
    tags: ["都市", "现实", "情绪", "人际"],
    background: "真实世界，当下社会；关注城市生活、工作压力、人际关系和个人心绪。",
  },
  {
    label: "家庭记忆",
    description: "围绕亲人、旧物、节日或返乡展开。",
    genre: "现实",
    subGenre: "家庭",
    tags: ["家庭", "回忆", "亲情", "年代"],
  },
  {
    label: "悬疑小说",
    description: "需要清楚的线索、误导和回收。",
    genre: "悬疑",
    subGenre: "现实悬疑",
    tags: ["悬疑", "线索", "反转", "现实"],
  },
];

function mergeTags(current: string, additions: string[]): string {
  const parts = current
    .split(/[,，、\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  for (const tag of additions) {
    if (!parts.includes(tag)) parts.push(tag);
  }
  return parts.join(", ");
}

export const ProjectMetaDialog = memo(function ProjectMetaDialog({
  open,
  draft,
  busy,
  completeness,
  onChange,
  onClose,
  onSave,
}: ProjectMetaDialogProps): JSX.Element {
  const reduce = useReducedMotion();
  const completenessPercent =
    completeness.total > 0 ? Math.round((completeness.done / completeness.total) * 100) : 0;

  const applyPreset = (preset: MetaPreset) => {
    onChange({
      genre: draft.genre.trim() ? draft.genre : preset.genre,
      subGenre: draft.subGenre.trim() ? draft.subGenre : preset.subGenre,
      tags: mergeTags(draft.tags, preset.tags),
      globalWorldview: draft.globalWorldview.trim()
        ? draft.globalWorldview
        : (preset.background ?? draft.globalWorldview),
    });
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy="outline-project-meta-title"
      zClassName="z-40"
      overlayClassName="flex items-center justify-center p-5"
      panelClassName="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl"
    >
      <motion.div
        className="flex min-h-0 flex-1 flex-col"
        variants={reduce ? fadeOnly : fadeSlideUp}
        initial="initial"
        animate="animate"
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-ink-700 bg-ink-800/45 px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-500/15 text-accent-200 ring-1 ring-accent-500/25">
            <Feather className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="outline-project-meta-title" className="text-lg font-semibold text-ink-100">
              项目设定
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-400">
              先写能确定方向的材料。散文可以只填题材和一段线索，背景不填时按真实世界处理。
            </p>
          </div>
          <div className="hidden w-36 shrink-0 pt-1 sm:block">
            <div className="flex items-center justify-between text-[11px] text-ink-500">
              <span>基础信息</span>
              <span>{completeness.done}/{completeness.total}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
              <motion.div
                className="h-full rounded-full bg-accent-500 transition-[width]"
                initial={false}
                animate={{ width: `${completenessPercent}%` }}
              />
            </div>
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            className="text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            onClick={onClose}
            aria-label="关闭项目设定"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="grid flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 overflow-y-auto p-6 scrollbar-thin">
            <motion.section
              className="border-b border-ink-700/80 pb-5"
              variants={reduce ? fadeOnly : fadeSlideUp}
              initial="initial"
              animate="animate"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-200">
                <BookOpen className="h-4 w-4 text-accent-300" />
                作品方向
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs text-ink-400">主类型</span>
                  <input
                    type="text"
                    aria-label="主类型"
                    className="mt-1 h-10 w-full rounded-md border border-ink-600 bg-ink-800/70 px-3 text-sm outline-none transition-colors placeholder:text-ink-500 focus:border-accent-500/70"
                    value={draft.genre}
                    onChange={(event) => onChange({ genre: event.target.value })}
                    placeholder="散文 / 现实 / 悬疑"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-400">子类型</span>
                  <input
                    type="text"
                    aria-label="子类型"
                    className="mt-1 h-10 w-full rounded-md border border-ink-600 bg-ink-800/70 px-3 text-sm outline-none transition-colors placeholder:text-ink-500 focus:border-accent-500/70"
                    value={draft.subGenre}
                    onChange={(event) => onChange({ subGenre: event.target.value })}
                    placeholder="游记 / 家庭 / 都市"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-400">标签</span>
                  <input
                    type="text"
                    aria-label="标签"
                    className="mt-1 h-10 w-full rounded-md border border-ink-600 bg-ink-800/70 px-3 text-sm outline-none transition-colors placeholder:text-ink-500 focus:border-accent-500/70"
                    value={draft.tags}
                    onChange={(event) => onChange({ tags: event.target.value })}
                    placeholder="散文, 现实, 细腻"
                  />
                </label>
              </div>
            </motion.section>

            <motion.section
              className="border-b border-ink-700/80 py-5"
              variants={reduce ? fadeOnly : fadeSlideUp}
              initial="initial"
              animate="animate"
            >
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-200">
                  <FileText className="h-4 w-4 text-accent-300" />
                  核心线索
                </span>
                <textarea
                  aria-label="核心线索"
                  className="h-32 w-full resize-y rounded-md border border-ink-600 bg-ink-800/70 px-3 py-2 text-sm leading-6 outline-none transition-colors placeholder:text-ink-500 focus:border-accent-500/70"
                  value={draft.synopsis}
                  onChange={(event) => onChange({ synopsis: event.target.value })}
                  placeholder="可以写一个人、一件事、一段路、一次回望。例：雨后的天竺山，同行的人渐渐沉默，我忽然想起几年前离开的县城。"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-ink-500">
                <span>人物</span>
                <span>地点</span>
                <span>事件</span>
                <span>情绪变化</span>
                <span>结尾余味</span>
              </div>
            </motion.section>

            <motion.section
              className="pt-5"
              variants={reduce ? fadeOnly : fadeSlideUp}
              initial="initial"
              animate="animate"
            >
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-200">
                  <MapPin className="h-4 w-4 text-accent-300" />
                  背景与时代语境
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-normal text-ink-500">
                    可选
                  </span>
                </span>
                <textarea
                  aria-label="背景与时代语境"
                  className="h-24 w-full resize-y rounded-md border border-ink-600 bg-ink-800/70 px-3 py-2 text-sm leading-6 outline-none transition-colors placeholder:text-ink-500 focus:border-accent-500/70"
                  value={draft.globalWorldview}
                  onChange={(event) => onChange({ globalWorldview: event.target.value })}
                  placeholder="不填也可以。填的话可写：2019 年前后的县城、春节返乡、一次天竺山旅行、单位人情、旧街道和生活习惯。"
                />
              </label>
              <p className="mt-2 text-xs leading-5 text-ink-500">
                留空时，生成会按真实世界和常识处理；散文不需要额外编一套世界规则。
              </p>
            </motion.section>
          </div>

          <aside className="border-t border-ink-700 bg-ink-800/35 p-5 lg:border-l lg:border-t-0">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-ink-200">
              <Sparkles className="h-4 w-4 text-accent-300" />
              快速起稿
            </div>
            <motion.div
              className="space-y-2"
              variants={reduce ? undefined : staggerContainer}
              initial="initial"
              animate="animate"
            >
              {META_PRESETS.map((preset) => (
                <motion.button
                  key={preset.label}
                  type="button"
                  className="w-full rounded-md border border-ink-700 bg-ink-900/50 px-3 py-2 text-left transition-colors hover:border-accent-600 hover:bg-accent-900/35"
                  onClick={() => applyPreset(preset)}
                  variants={reduce ? fadeOnly : staggerItem}
                  whileHover={hoverLift}
                  whileTap={tapPress}
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-ink-100">
                    <Tags className="h-3.5 w-3.5 text-accent-300" />
                    {preset.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-ink-500">
                    {preset.description}
                  </span>
                </motion.button>
              ))}
            </motion.div>

            <div className="mt-5 border-t border-ink-700 pt-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                散文材料
              </div>
              <ul className="space-y-1.5 text-xs leading-5 text-ink-500">
                <li>一个具体地点：山路、车站、旧楼、办公室。</li>
                <li>一段时间气味：去年夏天、疫情前后、某个春节。</li>
                <li>一个情绪转折：原本平静，后来忽然想起某人。</li>
              </ul>
            </div>
          </aside>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-ink-700 bg-ink-800/45 px-6 py-4">
          <div className="hidden min-w-0 flex-1 text-xs text-ink-500 sm:block">
            可先保存一小段线索，生成后再回来补细节。
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="py-2 hover:bg-ink-700"
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="py-2"
            disabled={busy !== null}
            onClick={onSave}
          >
            {busy === "master" ? "保存中…" : "保存"}
          </Button>
        </footer>
      </motion.div>
    </AnimatedDialog>
  );
});
