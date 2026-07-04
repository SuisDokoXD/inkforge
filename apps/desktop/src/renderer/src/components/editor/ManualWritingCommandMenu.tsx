import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, ClipboardCheck, Command, Eraser, Heading1, Heading2, IndentIncrease, ListTree, MapPin, Minus, Pilcrow, Search, X } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import {
  MANUAL_WRITING_COMMANDS,
  manualWritingCommandDisabledReason,
  type ManualWritingCommandAvailability,
  type ManualWritingCommandDefinition,
  type ManualWritingCommandGroup,
  type ManualWritingCommandId,
} from "../../lib/manual-writing-commands";
import { IconButton } from "../ui";

interface ManualWritingCommandMenuProps {
  open: boolean;
  disabled?: boolean;
  focusMode: boolean;
  availability: ManualWritingCommandAvailability;
  onOpenChange: (open: boolean) => void;
  onRunCommand: (id: ManualWritingCommandId) => void;
}

const GROUP_LABELS: Record<ManualWritingCommandGroup, string> = {
  structure: "结构",
  polish: "整理",
  review: "回看",
};

const GROUPS: ManualWritingCommandGroup[] = ["structure", "polish", "review"];

function commandIcon(id: ManualWritingCommandDefinition["id"]): JSX.Element {
  if (id === "insert-heading-1") return <Heading1 className="h-3.5 w-3.5" />;
  if (id === "insert-heading-2") return <Heading2 className="h-3.5 w-3.5" />;
  if (id === "insert-scene-break") return <Minus className="h-3.5 w-3.5" />;
  if (id === "insert-indent") return <IndentIncrease className="h-3.5 w-3.5" />;
  if (id === "insert-todo") return <Pilcrow className="h-3.5 w-3.5" />;
  if (id === "normalize-selection") return <Eraser className="h-3.5 w-3.5" />;
  if (id === "open-chapter-map") return <ListTree className="h-3.5 w-3.5" />;
  if (id === "open-revision-queue") return <ClipboardCheck className="h-3.5 w-3.5" />;
  if (id === "open-chapter-health") return <Activity className="h-3.5 w-3.5" />;
  if (id === "jump-next-todo") return <MapPin className="h-3.5 w-3.5" />;
  if (id === "jump-first-health-issue") return <Activity className="h-3.5 w-3.5" />;
  return <Search className="h-3.5 w-3.5" />;
}

export function ManualWritingCommandMenu({
  open,
  disabled = false,
  focusMode,
  availability,
  onOpenChange,
  onRunCommand,
}: ManualWritingCommandMenuProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const groupedCommands = useMemo(
    () => GROUPS.map((group) => ({
      group,
      commands: MANUAL_WRITING_COMMANDS.filter((command) => command.group === group),
    })),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (disabled && open) onOpenChange(false);
  }, [disabled, onOpenChange, open]);

  const run = (id: ManualWritingCommandId) => {
    onRunCommand(id);
    onOpenChange(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        size="sm"
        variant={open ? "accentSoft" : "ghost"}
        aria-label="写作命令"
        title="写作命令 · Ctrl Alt M"
        aria-pressed={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        <Command className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`absolute right-0 top-full z-40 mt-2 w-[21rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border text-xs text-ink-200 shadow-xl backdrop-blur ${
              focusMode ? "border-accent-500/35 bg-ink-950/95" : "border-ink-700 bg-ink-900"
            }`}
            role="dialog"
            aria-label="写作命令"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-800/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Command className="h-4 w-4 shrink-0 text-accent-300" />
                <span className="truncate font-medium text-ink-100">写作命令</span>
              </div>
              <button
                type="button"
                className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
                onClick={() => onOpenChange(false)}
                title="关闭"
                aria-label="关闭写作命令"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto py-1 scrollbar-thin">
              {groupedCommands.map(({ group, commands }) => (
                <div key={group} className="border-b border-ink-800 py-1 last:border-b-0">
                  <div className="px-3 py-1 text-[10px] text-ink-500">{GROUP_LABELS[group]}</div>
                  {commands.map((command) => {
                    const disabledReason = manualWritingCommandDisabledReason(command.id, availability);
                    const commandDisabled = disabledReason !== null;
                    return (
                      <button
                        key={command.id}
                        type="button"
                        className="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-ink-200 hover:bg-ink-800 hover:text-ink-100 disabled:cursor-not-allowed disabled:text-ink-600 disabled:hover:bg-transparent"
                        disabled={commandDisabled}
                        title={disabledReason ?? command.label}
                        onClick={() => run(command.id)}
                      >
                        <span className="shrink-0 text-ink-400">{commandIcon(command.id)}</span>
                        <span className="min-w-0 flex-1 truncate">{command.label}</span>
                        {command.shortcutLabel ? (
                          <span className="shrink-0 rounded border border-ink-700 bg-ink-950/50 px-1.5 py-0.5 text-[10px] text-ink-500">
                            {command.shortcutLabel}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
