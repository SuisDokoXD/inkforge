import {
  computeWordCount,
  resolveTriggerCount,
  resolveTriggerCountFromText,
  type WordCountStats,
} from "./word-count";

export interface AnalysisSchedulerOptions {
  threshold: number;
  debounceMs: number;
  language: string;
  onTrigger: (context: AnalysisTriggerContext) => void;
}

export interface AnalysisTriggerContext {
  text: string;
  stats: WordCountStats;
  newCharsSinceLastTrigger: number;
  triggerCount: number;
  triggeredAt: string;
}

export class AnalysisScheduler {
  private options: AnalysisSchedulerOptions;
  private baselineCount = 0;
  private baselineCharacters = 0;
  private lastTriggerCount = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingText = "";
  private disposed = false;

  constructor(options: AnalysisSchedulerOptions) {
    this.options = options;
  }

  reset(text: string = ""): void {
    this.cancelTimer();
    const count = resolveTriggerCountFromText(text, this.options.language);
    this.baselineCount = count;
    this.baselineCharacters = text.length;
    this.lastTriggerCount = count;
    this.pendingText = text;
  }

  update(text: string): void {
    if (this.disposed) return;
    this.pendingText = text;
    // Fast path for long chapters: until raw text growth reaches the threshold,
    // the language-specific trigger count cannot have crossed it either.
    if (Math.max(0, text.length - this.baselineCharacters) < this.options.threshold) return;
    const count = resolveTriggerCountFromText(text, this.options.language);
    const delta = count - this.baselineCount;
    if (delta < this.options.threshold) return;
    if (this.pendingTimer) return; // debounce already scheduled
    this.pendingTimer = setTimeout(() => {
      this.fire();
    }, this.options.debounceMs);
  }

  forceTrigger(): void {
    this.cancelTimer();
    this.fire();
  }

  setOptions(partial: Partial<AnalysisSchedulerOptions>): void {
    this.options = { ...this.options, ...partial };
  }

  dispose(): void {
    this.cancelTimer();
    this.disposed = true;
  }

  private fire(): void {
    this.pendingTimer = null;
    if (this.disposed) return;
    const text = this.pendingText;
    const stats = computeWordCount(text);
    const count = resolveTriggerCount(stats, this.options.language);
    const context: AnalysisTriggerContext = {
      text,
      stats,
      newCharsSinceLastTrigger: count - this.lastTriggerCount,
      triggerCount: count,
      triggeredAt: new Date().toISOString(),
    };
    this.baselineCount = count;
    this.baselineCharacters = text.length;
    this.lastTriggerCount = count;
    try {
      this.options.onTrigger(context);
    } catch {
      // swallow - trigger errors must not crash editor
    }
  }

  private cancelTimer(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}
