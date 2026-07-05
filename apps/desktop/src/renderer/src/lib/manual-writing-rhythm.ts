export const MANUAL_RHYTHM_DEFAULT_GOAL = 800;
export const MANUAL_RHYTHM_MIN_GOAL = 100;
export const MANUAL_RHYTHM_MAX_GOAL = 10_000;
export const MANUAL_RHYTHM_ACTIVE_WINDOW_MS = 10_000;
export const MANUAL_RHYTHM_RESUME_THRESHOLD_MS = 10 * 60 * 1000;
export const MANUAL_RHYTHM_CUE_MAX_LENGTH = 80;
export const MANUAL_RHYTHM_NEXT_BEAT_MAX_LENGTH = 120;
export const MANUAL_RHYTHM_HANDOFF_NOTE_MAX_LENGTH = 160;
export const MANUAL_RHYTHM_MAX_OPEN_BEATS = 8;
export const MANUAL_RHYTHM_MAX_TOTAL_BEATS = 20;

export type ManualWritingBeatStatus = "open" | "done";

export interface ManualWritingBeatItem {
  id: string;
  text: string;
  status: ManualWritingBeatStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ManualWritingRhythmState {
  nextBeat: string;
  handoffNote: string;
  beatQueue: ManualWritingBeatItem[];
  lastCueText: string;
  lastLine: number;
  lastUpdatedAt: number;
  sessionGoal: number;
}

export interface ManualWritingResumeCue {
  line: number;
  text: string;
}

export interface ManualWritingHandoffCapture {
  line: number;
  cueText: string;
  handoffNote: string;
  capturedAt: number;
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

export function normalizeHandoffNote(text: unknown): string {
  return normalizeRhythmSnippet(text, MANUAL_RHYTHM_HANDOFF_NOTE_MAX_LENGTH);
}

export function readManualWritingCue(content: string, lineNumber: number): ManualWritingResumeCue {
  const lines = content.split(/\r?\n/);
  const safeLine = Math.max(1, Math.min(lines.length || 1, Math.round(lineNumber) || 1));
  const currentLineText = normalizeRhythmSnippet(lines[safeLine - 1] ?? "");
  if (currentLineText) return { line: safeLine, text: currentLineText };
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const text = normalizeRhythmSnippet(lines[index] ?? "");
    if (text) return { line: index + 1, text };
  }
  return { line: safeLine, text: "" };
}

export function buildManualWritingHandoffCapture(
  content: string,
  lineNumber: number,
  now = Date.now(),
): ManualWritingHandoffCapture | null {
  const cue = readManualWritingCue(content, lineNumber);
  if (!cue.text) return null;
  const safeNow = normalizeBeatTimestamp(now, Date.now());
  return {
    line: cue.line,
    cueText: cue.text,
    handoffNote: normalizeHandoffNote(`第 ${cue.line} 行：${cue.text}`),
    capturedAt: safeNow,
  };
}

function normalizeBeatTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback;
}

function createManualWritingBeatId(now: number): string {
  return `beat:${now}:${Math.random().toString(36).slice(2, 8)}`;
}

export function createManualWritingBeat(
  text: string,
  now = Date.now(),
  id = createManualWritingBeatId(now),
): ManualWritingBeatItem | null {
  const normalizedText = normalizeNextBeat(text);
  if (!normalizedText) return null;
  const timestamp = normalizeBeatTimestamp(now, Date.now());
  return {
    id,
    text: normalizedText,
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function trimManualWritingBeatQueue(queue: ManualWritingBeatItem[]): ManualWritingBeatItem[] {
  const open: ManualWritingBeatItem[] = [];
  const done: ManualWritingBeatItem[] = [];
  for (const item of queue) {
    if (item.status === "open") {
      if (open.length < MANUAL_RHYTHM_MAX_OPEN_BEATS) open.push(item);
    } else {
      done.push(item);
    }
  }

  const allowedOpenIds = new Set(open.map((item) => item.id));
  const remainingDoneSlots = Math.max(0, MANUAL_RHYTHM_MAX_TOTAL_BEATS - open.length);
  const keptDoneIds = new Set(
    [...done]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, remainingDoneSlots)
      .map((item) => item.id),
  );

  return queue.filter((item) => (
    item.status === "open" ? allowedOpenIds.has(item.id) : keptDoneIds.has(item.id)
  ));
}

export function normalizeManualWritingBeatQueue(
  value: unknown,
  fallbackNextBeat = "",
  now = Date.now(),
): ManualWritingBeatItem[] {
  const queue: ManualWritingBeatItem[] = [];
  const seenIds = new Set<string>();

  if (Array.isArray(value)) {
    for (const rawItem of value) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const candidate = rawItem as Partial<ManualWritingBeatItem>;
      const text = normalizeNextBeat(candidate.text);
      if (!text) continue;
      const baseId = typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : createManualWritingBeatId(now);
      let id = baseId;
      let duplicateIndex = 1;
      while (seenIds.has(id)) {
        duplicateIndex += 1;
        id = `${baseId}:${duplicateIndex}`;
      }
      seenIds.add(id);
      const createdAt = normalizeBeatTimestamp(candidate.createdAt, now);
      const updatedAt = normalizeBeatTimestamp(candidate.updatedAt, createdAt);
      queue.push({
        id,
        text,
        status: candidate.status === "done" ? "done" : "open",
        createdAt,
        updatedAt,
      });
    }
  }

  if (queue.length === 0) {
    const migratedBeat = createManualWritingBeat(fallbackNextBeat, now);
    if (migratedBeat) queue.push(migratedBeat);
  }

  return trimManualWritingBeatQueue(queue);
}

export function openManualWritingBeats(state: ManualWritingRhythmState): ManualWritingBeatItem[] {
  return createDefaultManualWritingRhythmState(state).beatQueue.filter((item) => item.status === "open");
}

export function firstOpenManualWritingBeat(state: ManualWritingRhythmState): ManualWritingBeatItem | null {
  return openManualWritingBeats(state)[0] ?? null;
}

export function manualWritingOpenBeatCount(state: ManualWritingRhythmState): number {
  return openManualWritingBeats(state).length;
}

export function createDefaultManualWritingRhythmState(
  overrides: Partial<ManualWritingRhythmState> = {},
): ManualWritingRhythmState {
  const beatQueue = normalizeManualWritingBeatQueue(
    overrides.beatQueue,
    overrides.nextBeat ?? "",
  );
  const firstOpenBeat = beatQueue.find((item) => item.status === "open") ?? null;
  return {
    nextBeat: firstOpenBeat?.text ?? "",
    handoffNote: normalizeHandoffNote(overrides.handoffNote ?? ""),
    beatQueue,
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

export function addManualWritingBeat(
  state: ManualWritingRhythmState,
  text: string,
  now = Date.now(),
): ManualWritingRhythmState {
  const normalized = createDefaultManualWritingRhythmState(state);
  if (manualWritingOpenBeatCount(normalized) >= MANUAL_RHYTHM_MAX_OPEN_BEATS) return normalized;
  const beat = createManualWritingBeat(text, now);
  if (!beat) return normalized;
  return createDefaultManualWritingRhythmState({
    ...normalized,
    beatQueue: [...normalized.beatQueue, beat],
  });
}

export function upsertManualWritingBeat(
  state: ManualWritingRhythmState,
  id: string,
  text: string,
  now = Date.now(),
): ManualWritingRhythmState {
  const normalized = createDefaultManualWritingRhythmState(state);
  const nextText = normalizeNextBeat(text);
  if (!nextText) return removeManualWritingBeat(normalized, id);
  return createDefaultManualWritingRhythmState({
    ...normalized,
    beatQueue: normalized.beatQueue.map((item) =>
      item.id === id
        ? { ...item, text: nextText, updatedAt: normalizeBeatTimestamp(now, Date.now()) }
        : item,
    ),
  });
}

export function removeManualWritingBeat(
  state: ManualWritingRhythmState,
  id: string,
): ManualWritingRhythmState {
  const normalized = createDefaultManualWritingRhythmState(state);
  return createDefaultManualWritingRhythmState({
    ...normalized,
    nextBeat: "",
    beatQueue: normalized.beatQueue.filter((item) => item.id !== id),
  });
}

export function completeManualWritingBeat(
  state: ManualWritingRhythmState,
  id: string,
  now = Date.now(),
): ManualWritingRhythmState {
  const normalized = createDefaultManualWritingRhythmState(state);
  return createDefaultManualWritingRhythmState({
    ...normalized,
    beatQueue: normalized.beatQueue.map((item) =>
      item.id === id
        ? { ...item, status: "done", updatedAt: normalizeBeatTimestamp(now, Date.now()) }
        : item,
    ),
  });
}

export function reopenManualWritingBeat(
  state: ManualWritingRhythmState,
  id: string,
  now = Date.now(),
): ManualWritingRhythmState {
  const normalized = createDefaultManualWritingRhythmState(state);
  if (manualWritingOpenBeatCount(normalized) >= MANUAL_RHYTHM_MAX_OPEN_BEATS) return normalized;
  return createDefaultManualWritingRhythmState({
    ...normalized,
    beatQueue: normalized.beatQueue.map((item) =>
      item.id === id
        ? { ...item, status: "open", updatedAt: normalizeBeatTimestamp(now, Date.now()) }
        : item,
    ),
  });
}

export function moveManualWritingBeat(
  state: ManualWritingRhythmState,
  id: string,
  direction: "up" | "down",
): ManualWritingRhythmState {
  const normalized = createDefaultManualWritingRhythmState(state);
  const index = normalized.beatQueue.findIndex((item) => item.id === id);
  if (index < 0) return normalized;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= normalized.beatQueue.length) return normalized;
  const beatQueue = [...normalized.beatQueue];
  const current = beatQueue[index];
  const next = beatQueue[nextIndex];
  if (!current || !next) return normalized;
  beatQueue[index] = next;
  beatQueue[nextIndex] = current;
  return createDefaultManualWritingRhythmState({ ...normalized, beatQueue });
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
