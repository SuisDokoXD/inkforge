export type ManualWritingCommandId =
  | "open-command-menu"
  | "insert-heading-1"
  | "insert-heading-2"
  | "insert-scene-break"
  | "insert-indent"
  | "insert-todo"
  | "normalize-selection"
  | "open-chapter-map"
  | "open-revision-queue"
  | "open-chapter-health"
  | "jump-next-todo"
  | "jump-first-health-issue"
  | "open-find";

export type ManualWritingCommandGroup = "structure" | "polish" | "review";

export interface ManualWritingCommandDefinition {
  id: Exclude<ManualWritingCommandId, "open-command-menu">;
  label: string;
  group: ManualWritingCommandGroup;
  shortcutLabel?: string;
}

export interface ManualWritingCommandAvailability {
  hasEditor: boolean;
  chapterMapCount: number;
  revisionCount: number;
  healthIssueCount: number;
}

export interface ManualWritingShortcutEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export const MANUAL_WRITING_COMMANDS: ManualWritingCommandDefinition[] = [
  { id: "insert-heading-1", label: "一级标题", group: "structure", shortcutLabel: "Ctrl Alt 1" },
  { id: "insert-heading-2", label: "二级标题", group: "structure", shortcutLabel: "Ctrl Alt 2" },
  { id: "insert-scene-break", label: "场景分隔", group: "structure", shortcutLabel: "Ctrl Alt -" },
  { id: "insert-indent", label: "全角缩进", group: "structure", shortcutLabel: "Ctrl Alt ]" },
  { id: "insert-todo", label: "待补标记", group: "structure", shortcutLabel: "Ctrl Alt T" },
  { id: "normalize-selection", label: "整理当前段/选区", group: "polish" },
  { id: "open-chapter-map", label: "章节导航", group: "review", shortcutLabel: "Ctrl Alt G" },
  { id: "open-revision-queue", label: "修订队列", group: "review", shortcutLabel: "Ctrl Alt R" },
  { id: "open-chapter-health", label: "章节体检", group: "review", shortcutLabel: "Ctrl Alt I" },
  { id: "jump-next-todo", label: "下一个待补", group: "review", shortcutLabel: "Ctrl Alt J" },
  { id: "jump-first-health-issue", label: "第一个体检提醒", group: "review" },
  { id: "open-find", label: "查找正文", group: "review", shortcutLabel: "Ctrl F" },
];

const EDITOR_REQUIRED_COMMANDS = new Set<ManualWritingCommandId>([
  "insert-heading-1",
  "insert-heading-2",
  "insert-scene-break",
  "insert-indent",
  "insert-todo",
  "normalize-selection",
  "open-chapter-map",
  "open-revision-queue",
  "open-chapter-health",
  "jump-next-todo",
  "jump-first-health-issue",
  "open-find",
]);

export function manualWritingCommandDisabledReason(
  id: ManualWritingCommandId,
  availability: ManualWritingCommandAvailability,
): string | null {
  if (EDITOR_REQUIRED_COMMANDS.has(id) && !availability.hasEditor) return "当前章节尚未载入";
  if (id === "open-chapter-map" && availability.chapterMapCount <= 0) return "暂无导航标记";
  if (id === "open-revision-queue" && availability.revisionCount <= 0) return "暂无待补";
  if (id === "jump-next-todo" && availability.revisionCount <= 0) return "暂无待补";
  if (id === "jump-first-health-issue" && availability.healthIssueCount <= 0) return "暂无提醒";
  return null;
}

export function matchManualWritingShortcut(event: ManualWritingShortcutEvent): ManualWritingCommandId | null {
  const ctrlOrMeta = event.ctrlKey === true || event.metaKey === true;
  if (!ctrlOrMeta || event.altKey !== true || event.shiftKey === true) return null;

  const key = event.key.toLowerCase();
  const code = event.code ?? "";

  if (code === "KeyM" || key === "m") return "open-command-menu";
  if (code === "Digit1" || key === "1") return "insert-heading-1";
  if (code === "Digit2" || key === "2") return "insert-heading-2";
  if (code === "Minus" || key === "-") return "insert-scene-break";
  if (code === "BracketRight" || key === "]") return "insert-indent";
  if (code === "KeyT" || key === "t") return "insert-todo";
  if (code === "KeyG" || key === "g") return "open-chapter-map";
  if (code === "KeyR" || key === "r") return "open-revision-queue";
  if (code === "KeyI" || key === "i") return "open-chapter-health";
  if (code === "KeyJ" || key === "j") return "jump-next-todo";

  return null;
}
