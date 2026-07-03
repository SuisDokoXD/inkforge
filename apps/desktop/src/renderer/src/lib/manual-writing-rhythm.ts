export const MANUAL_RHYTHM_DEFAULT_GOAL = 800;
export const MANUAL_RHYTHM_MIN_GOAL = 100;
export const MANUAL_RHYTHM_MAX_GOAL = 10_000;
export const MANUAL_RHYTHM_ACTIVE_WINDOW_MS = 10_000;
export const MANUAL_RHYTHM_RESUME_THRESHOLD_MS = 10 * 60 * 1000;
export const MANUAL_RHYTHM_CUE_MAX_LENGTH = 80;
export const MANUAL_RHYTHM_NEXT_BEAT_MAX_LENGTH = 120;

export interface ManualWritingRhythmState {
  nextBeat: string;
  lastCueText: string;
  lastLine: number;
  lastUpdatedAt: number;
  sessionGoal: number;
}

export interface ManualWritingResumeCue {
  line: number;
  text: string;
}

export function manualWritingRhythmStorageKey(projectId: string, chapterId: string): string {
  return `inkforge:manual-rhythm:${projectId}:${chapterId}`;
}

export function clampManualWritingGoal(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : MANUAL_RHYTHM_DEFAULT_GOAL;
  if (!Number.isFinite(numeric)) return MANUAL_RHYTHM_DEFAULT_GOAL;
  return Math.max(
    MANUAL_RHYTHM_MIN_GOAL,
    Math.min(MANUAL_RHYTHM_MAX_GOAL, Math.round(numeric)),
  );
}

export function normalizeRhythmSnippet(text: unknown, maxLength = MANUAL_RHYTHM_CUE_MAX_LENGTH): string {
  if (typeof text !== "string") return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeNextBeat(text: unknown): string {
  return normalizeRhythmSnippet(text, MANUAL_RHYTHM_NEXT_BEAT_MAX_LENGTH);
}

export function createDefaultManualWritingRhythmState(
  overrides: Partial<ManualWritingRhythmState> = {},
): ManualWritingRhythmState {
  return {
    nextBeat: normalizeNextBeat(overrides.nextBeat ?? ""),
    lastCueText: normalizeRhythmSnippet(overrides.lastCueText ?? ""),
    lastLine: typeof overrides.lastLine === "number" && Number.isFinite(overrides.lastLine)
      ? Math.max(1, Math.round(overrides.lastLine))
      : 1,
    lastUpdatedAt: typeof overrides.lastUpdatedAt === "number" && Number.isFinite(overrides.lastUpdatedAt)
      ? Math.max(0, Math.round(overrides.lastUpdatedAt))
      : 0,
    sessionGoal: clampManualWritingGoal(overrides.sessionGoal),
  };
}

export function parseManualWritingRhythmState(raw: string | null): ManualWritingRhythmState {
  if (!raw) return createDefaultManualWritingRhythmState();
  try {
    const parsed = JSON.parse(raw) as Partial<ManualWritingRhythmState>;
    return createDefaultManualWritingRhythmState(parsed);
  } catch {
    return createDefaultManualWritingRhythmState();
  }
}

export function serializeManualWritingRhythmState(state: ManualWritingRhythmState): string {
  return JSON.stringify(createDefaultManualWritingRhythmState(state));
}

export function formatManualWritingDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function buildManualWritingResumeCue(
  state: ManualWritingRhythmState,
  now = Date.now(),
  thresholdMs = MANUAL_RHYTHM_RESUME_THRESHOLD_MS,
): ManualWritingResumeCue | null {
  const normalized = createDefaultManualWritingRhythmState(state);
  if (!normalized.lastCueText) return null;
  if (!normalized.lastUpdatedAt) return null;
  if (now - normalized.lastUpdatedAt < thresholdMs) return null;
  return {
    line: normalized.lastLine,
    text: normalized.lastCueText,
  };
}

export function manualWritingProgressPercent(sessionAdded: number, sessionGoal: number): number {
  const goal = clampManualWritingGoal(sessionGoal);
  if (sessionAdded <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((sessionAdded / goal) * 100)));
}
