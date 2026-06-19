import { useEffect, useRef } from "react";
import { AnalysisScheduler, type AnalysisTriggerContext } from "../analysis-scheduler";

export interface UseAnalysisTriggerOptions {
  text: string;
  threshold?: number;
  debounceMs?: number;
  language?: string;
  enabled?: boolean;
  /**
   * 基线键：通常传当前章节 id（且仅在正文已载入后传）。它一变化（切换章节、
   * 或章节正文首次从磁盘载入）就把"自上次分析以来的新增字数"基线重置为当前
   * 正文长度。这样只有用户**真正新写的** threshold 个字才会触发分析。
   *
   * 没有它时，scheduler 在组件首帧（content 还是空串）创建、基线恒为 0，
   * 等整章正文载入后 delta=全文长度 ≥ threshold，于是"开章即对全文分析一次"，
   * 用户每打一两个字就被分析、白白烧 token——正是这次修复的目标。
   */
  baselineKey?: string | null;
  onTrigger: (ctx: AnalysisTriggerContext) => void;
}

export function useAnalysisTrigger(options: UseAnalysisTriggerOptions): {
  forceTrigger: () => void;
  rebaseline: () => void;
} {
  const {
    text,
    threshold = 200,
    debounceMs = 10000,
    language = "zh",
    enabled = true,
    baselineKey = null,
    onTrigger,
  } = options;

  const schedulerRef = useRef<AnalysisScheduler | null>(null);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  // 始终持有最新正文，供"基线重置"在 key 变化的那一刻取用，又不必把 text 放进
  // 重置副作用的依赖里（否则每次按键都会重置基线，分析永远不会触发）。
  const textRef = useRef(text);
  textRef.current = text;

  if (!schedulerRef.current) {
    schedulerRef.current = new AnalysisScheduler({
      threshold,
      debounceMs,
      language,
      onTrigger: (ctx) => onTriggerRef.current(ctx),
    });
    schedulerRef.current.reset(text);
  }

  useEffect(() => {
    schedulerRef.current?.setOptions({ threshold, debounceMs, language });
  }, [threshold, debounceMs, language]);

  // 切章 / 正文载入时重置基线（见 baselineKey 注释）。声明在 update 副作用之前，
  // 确保同一次提交里"先重置基线、后比对增量"，避免刚载入就误判为新增。
  const baselineKeyRef = useRef<string | null>(baselineKey);
  useEffect(() => {
    if (baselineKeyRef.current === baselineKey) return;
    baselineKeyRef.current = baselineKey;
    schedulerRef.current?.reset(textRef.current);
  }, [baselineKey]);

  useEffect(() => {
    if (!enabled) return;
    schedulerRef.current?.update(text);
  }, [text, enabled]);

  useEffect(() => {
    return () => {
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
    };
  }, []);

  return {
    forceTrigger: () => schedulerRef.current?.forceTrigger(),
    // 手动"分析"后把基线对齐到当前正文，避免紧接着的自动触发再放一炮。
    rebaseline: () => schedulerRef.current?.reset(textRef.current),
  };
}
