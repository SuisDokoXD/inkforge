// =============================================================================
// 卡牌融合对话框（UI 优化版）
// =============================================================================
// 优化点：
//   - 双栏布局：左=源卡 + 融合要求，右=预览 / 思考动画
//   - 源卡用迷你卡片样式展示（沿用 WorldPackCard 的视觉语言）
//   - AI 调用期间用脉动 + 进度文案，不留白等
//   - 顶栏带返回操作的清晰流程：源卡确认 → 生成预览 → 校对 → 保存
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X, Sparkles, Save, RefreshCw, ArrowRight, Wand2 } from "lucide-react";
import { worldPackApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { AnimatedDialog } from "../AnimatedDialog";
import { MotionSpin } from "../MotionSpinner";
import {
  DUR,
  EASE_IN_OUT,
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";
import type {
  WorldPackFuseResponse,
  WorldPackRecord,
} from "@inkforge/shared";

interface Props {
  open: boolean;
  sourcePackIds: string[];
  onClose(): void;
  onFused(): void;
}

const FUSION_TIPS = [
  "正在阅读所有源卡设定…",
  "分析重叠概念与冲突…",
  "按你的融合要求重新编织世界观…",
  "生成融合后的条目…",
  "整理最终输出…",
];

export function FusionDialog({
  open,
  sourcePackIds,
  onClose,
  onFused,
}: Props): JSX.Element {
  const [brief, setBrief] = useState("");
  const [preview, setPreview] = useState<WorldPackFuseResponse["suggestion"] | null>(
    null,
  );
  const [tipIndex, setTipIndex] = useState(0);
  const tipIntervalRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const openRef = useRef(open);
  const reduce = useReducedMotion();
  const titleId = "world-pack-fusion-title";
  openRef.current = open;

  const stopTipRotation = useCallback((): void => {
    if (tipIntervalRef.current !== null) {
      window.clearInterval(tipIntervalRef.current);
      tipIntervalRef.current = null;
    }
  }, []);

  const startTipRotation = useCallback((): void => {
    stopTipRotation();
    setTipIndex(0);
    const startedAt = Date.now();
    tipIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setTipIndex(Math.min(FUSION_TIPS.length - 1, Math.floor(elapsed / 3000)));
    }, 500);
  }, [stopTipRotation]);

  const clearResetTimer = useCallback((): void => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopTipRotation();
      clearResetTimer();
    },
    [stopTipRotation, clearResetTimer],
  );

  const sourcePacksQuery = useQuery({
    queryKey: ["world-pack-fusion-sources", sourcePackIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        sourcePackIds.map((id) => worldPackApi.get({ id })),
      );
      return results.filter(Boolean);
    },
    enabled: open && sourcePackIds.length > 0,
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      worldPackApi.fuse({
        sourcePackIds,
        brief: brief.trim(),
        persist: false,
      }),
    onMutate: () => {
      // Visual guidance only; actual model progress is reported by the mutation.
      startTipRotation();
    },
    onSettled: () => {
      stopTipRotation();
      setTipIndex(0);
    },
    onSuccess: (r) => {
      if (openRef.current) setPreview(r.suggestion);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (suggestion: WorldPackFuseResponse["suggestion"]) =>
      worldPackApi.fuse({
        sourcePackIds,
        brief: brief.trim(),
        persist: true,
        suggestion,
      }),
    onSuccess: () => onFused(),
  });

  useEffect(() => {
    clearResetTimer();
    if (open) return;
    stopTipRotation();
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setBrief("");
      setPreview(null);
      setTipIndex(0);
      previewMutation.reset();
      saveMutation.reset();
    }, DUR.fast * 1000);
    return clearResetTimer;
  }, [open]);

  const sourcePacks = useMemo(
    () => (sourcePacksQuery.data ?? []).filter((p): p is NonNullable<typeof p> => !!p),
    [sourcePacksQuery.data],
  );

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      overlayClassName="flex items-center justify-center p-4 backdrop-blur-sm"
      panelClassName="relative h-[88vh] w-[1100px] max-w-[96vw] overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-ink-900 shadow-2xl ring-1 ring-fuchsia-500/30"
    >
      <motion.div
        className="h-full"
        variants={reduce ? fadeOnly : fadeSlideUp}
        initial="initial"
        animate="animate"
      >
        {/* 顶栏 */}
        <div className="flex items-center gap-3 border-b border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-900/30 via-fuchsia-700/20 to-fuchsia-900/30 px-5 py-3">
          <Wand2 className="h-5 w-5 text-fuchsia-300" />
          <div className="flex-1">
            <div id={titleId} className="text-base font-semibold text-fuchsia-200">
              卡牌融合
            </div>
            <div className="text-[11px] text-fuchsia-300/70">
              多张世界观卡 → 模型整理 → 一张新卡
            </div>
          </div>
          <motion.button
            onClick={onClose}
            className="rounded-md p-1.5 text-fuchsia-200 hover:bg-fuchsia-500/20"
            title="关闭"
            aria-label="关闭卡牌融合"
            whileHover={hoverLift}
            whileTap={tapPress}
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        {/* 双栏内容 */}
        <div className="flex h-[calc(88vh-56px)]">
          {/* 左栏：源卡 + brief */}
          <motion.aside
            className="flex w-[420px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-ink-700 bg-ink-900/40 p-5"
            variants={reduce ? fadeOnly : staggerContainer}
            initial="initial"
            animate="animate"
          >
            <SectionLabel index={1} active>
              源卡（{sourcePacks.length}）
            </SectionLabel>
            {sourcePacksQuery.isLoading ? (
              <motion.div
                className="grid grid-cols-2 gap-2"
                variants={reduce ? fadeOnly : staggerContainer}
              >
                {Array.from({ length: Math.max(2, sourcePackIds.length) }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="skeleton-shimmer h-24 rounded-lg border border-ink-700 bg-ink-800/60"
                    variants={reduce ? fadeOnly : staggerItem}
                  />
                ))}
              </motion.div>
            ) : sourcePacksQuery.isError ? (
              <motion.div
                role="alert"
                className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300"
                variants={reduce ? fadeOnly : staggerItem}
              >
                源卡读取失败：{friendlyErrorMessage(sourcePacksQuery.error)}
              </motion.div>
            ) : (
              <motion.div
                className="grid grid-cols-2 gap-2"
                variants={reduce ? fadeOnly : staggerContainer}
              >
                {sourcePacks.map((p) => (
                  <MiniPackChip key={p.id} pack={p} />
                ))}
              </motion.div>
            )}

            <SectionLabel index={2} active>
              融合要求
            </SectionLabel>
            <textarea
              aria-label="融合要求"
              maxLength={800}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={8}
              placeholder={`例如：
- 保留 A 卡的灵气体系
- 引入 B 卡的蒸汽朋克科技逻辑
- 主基调偏向冷峻克制
- 冲突时优先 A 卡设定`}
              className="resize-none rounded-lg border border-ink-700 bg-ink-800/70 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-fuchsia-500/60 focus:bg-ink-800 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
            />
            <div className="text-right text-[10px] text-ink-500">
              {brief.length} / 800 字符
            </div>

            <motion.button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-fuchsia-500/30 transition-[color,background-color,border-color,box-shadow,opacity] duration-200 hover:from-fuchsia-400 hover:to-purple-400 disabled:opacity-50"
              whileHover={previewMutation.isPending ? undefined : hoverLift}
              whileTap={previewMutation.isPending ? undefined : tapPress}
            >
              {previewMutation.isPending ? (
                <>
                  <MotionSpin>
                    <RefreshCw className="h-4 w-4" />
                  </MotionSpin>
                  融合中…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {preview ? "重新生成" : "生成融合预览"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </motion.button>
            {previewMutation.isError && (
              <motion.div
                role="alert"
                className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300"
                variants={reduce ? fadeOnly : fadeSlideUp}
                initial="initial"
                animate="animate"
              >
                融合失败：{friendlyErrorMessage(previewMutation.error)}
              </motion.div>
            )}
          </motion.aside>

          {/* 右栏：预览 / 思考动画 / 占位 */}
          <section className="flex flex-1 flex-col overflow-y-auto bg-ink-900/20">
            <AnimatePresence mode="wait">
              {previewMutation.isPending ? (
                <ThinkingState
                  key="thinking"
                  tip={FUSION_TIPS[tipIndex] ?? FUSION_TIPS[0]}
                />
              ) : preview ? (
                <PreviewBody
                  key="preview"
                  preview={preview}
                  onSave={() => saveMutation.mutate(preview)}
                  saving={saveMutation.isPending}
                  saveError={saveMutation.error as Error | undefined}
                />
              ) : (
                <IdleState key="idle" />
              )}
            </AnimatePresence>
          </section>
        </div>
      </motion.div>
    </AnimatedDialog>
  );
}

function SectionLabel({
  index,
  active,
  children,
}: {
  index: number;
  active?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
          active
            ? "bg-fuchsia-500 text-white"
            : "border border-ink-700 text-ink-500"
        }`}
      >
        {index}
      </span>
      <span className="text-xs font-medium uppercase tracking-wider text-ink-300">
        {children}
      </span>
    </div>
  );
}

function MiniPackChip({ pack }: { pack: WorldPackRecord }): JSX.Element {
  return (
    <motion.div
      className="rounded-lg border border-ink-700 bg-gradient-to-br from-ink-800 to-ink-900 p-3 ring-1 ring-fuchsia-400/20"
      variants={staggerItem}
      whileHover={hoverLift}
    >
      <div className="line-clamp-1 text-sm font-medium text-ink-100">{pack.name}</div>
      {pack.tagline && (
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-400">
          {pack.tagline}
        </div>
      )}
      {pack.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {pack.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full bg-ink-700/60 px-1.5 py-0 text-[9px] text-accent-200"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ThinkingState({ tip }: { tip: string }): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="status"
      aria-live="polite"
      className="flex h-full flex-col items-center justify-center gap-6 px-8"
      variants={reduce ? fadeOnly : fadeSlideUp}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="relative">
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full bg-fuchsia-500/25"
          animate={reduce ? undefined : { opacity: [0.22, 0.08, 0.22], scale: [0.9, 1.18, 0.9] }}
          transition={{ duration: 1.8, ease: EASE_IN_OUT, repeat: Infinity }}
        />
        <Sparkles className="relative h-16 w-16 text-fuchsia-400" />
      </div>
      <div className="text-center">
        <div className="text-base font-medium text-fuchsia-200">{tip}</div>
        <div className="mt-2 text-xs text-ink-500">
          模型正在整理新卡牌，通常需要 15-40 秒…
        </div>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-fuchsia-400"
            animate={reduce ? undefined : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
            transition={{
              delay: i * 0.16,
              duration: 1.2,
              ease: EASE_IN_OUT,
              repeat: Infinity,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function IdleState(): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-3 text-ink-500"
      variants={reduce ? fadeOnly : fadeSlideUp}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <Wand2 className="h-16 w-16 opacity-20" />
      <div className="text-sm">填好左侧融合要求后点“生成融合预览”</div>
      <div className="max-w-xs text-center text-xs text-ink-600">
        预览不会保存；觉得满意再点“保存为新卡”。可反复重新生成。
      </div>
    </motion.div>
  );
}

function PreviewBody({
  preview,
  onSave,
  saving,
  saveError,
}: {
  preview: WorldPackFuseResponse["suggestion"];
  onSave(): void;
  saving: boolean;
  saveError?: Error;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="flex h-full flex-col"
      variants={reduce ? fadeOnly : fadeSlideUp}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* 预览顶部 */}
      <motion.div
        className="border-b border-ink-700 bg-gradient-to-r from-fuchsia-500/10 to-transparent p-5"
        variants={reduce ? fadeOnly : fadeSlideUp}
      >
        <div className="text-[11px] font-medium uppercase tracking-wider text-fuchsia-300">
          融合预览
        </div>
        <h3 className="mt-1 text-xl font-semibold text-ink-50">{preview.name}</h3>
        {preview.tagline && (
          <p className="mt-1 text-sm text-ink-300">{preview.tagline}</p>
        )}
        {preview.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-200">
            {preview.description}
          </p>
        )}
        {preview.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {preview.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs text-fuchsia-200 ring-1 ring-fuchsia-400/40"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      {/* 条目列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-fuchsia-300">
          条目（{preview.entries.length}）
        </div>
        <motion.div
          className="space-y-2"
          variants={reduce ? fadeOnly : staggerContainer}
          initial="initial"
          animate="animate"
        >
          {preview.entries.map((e, idx) => (
            <motion.div
              key={idx}
              className="rounded-lg border border-ink-700 bg-ink-800/50 p-3 transition-colors hover:border-fuchsia-400/30"
              variants={reduce ? fadeOnly : staggerItem}
              whileHover={hoverLift}
            >
              <div className="flex items-baseline gap-2">
                <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-200">
                  {e.category}
                </span>
                <span className="font-medium text-ink-100">{e.title}</span>
                {e.aliases.length > 0 && (
                  <span className="ml-auto text-[10px] text-ink-400">
                    {e.aliases.join(" / ")}
                  </span>
                )}
              </div>
              <div className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-ink-300">
                {e.content}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* 底部保存栏 */}
      <div className="border-t border-ink-700 bg-ink-900/60 p-4">
        {saveError && (
          <motion.div
            role="alert"
            className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300"
            variants={reduce ? fadeOnly : fadeSlideUp}
            initial="initial"
            animate="animate"
          >
            保存失败：{friendlyErrorMessage(saveError)}
          </motion.div>
        )}
        <motion.button
          onClick={onSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-ink-900 shadow-lg shadow-accent-500/20 hover:bg-accent-400 disabled:opacity-50"
          whileHover={saving ? undefined : hoverLift}
          whileTap={saving ? undefined : tapPress}
        >
          {saving ? (
            <>
              <MotionSpin>
                <RefreshCw className="h-4 w-4" />
              </MotionSpin>
              保存中…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              保存为新卡
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
