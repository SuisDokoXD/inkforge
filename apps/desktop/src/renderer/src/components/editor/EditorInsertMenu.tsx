import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Eraser, Heading1, Heading2, IndentIncrease, Minus, MoreHorizontal, Pilcrow } from "lucide-react";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import { IconButton } from "../ui";

interface EditorInsertMenuProps {
  disabled?: boolean;
  onInsertHeading: (level: 1 | 2) => void;
  onInsertSceneBreak: () => void;
  onInsertIndent: () => void;
  onInsertTodo: () => void;
  onNormalizeSelection: () => void;
}

export function EditorInsertMenu({
  disabled = false,
  onInsertHeading,
  onInsertSceneBreak,
  onInsertIndent,
  onInsertTodo,
  onNormalizeSelection,
}: EditorInsertMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() === true;
  const panelMotion = reduceMotion ? fadeOnly : fadeSlideUp;

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        size="sm"
        variant={open ? "accentSoft" : "ghost"}
        aria-label="插入写作标记"
        title="插入写作标记"
        aria-pressed={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 py-1 text-xs shadow-xl backdrop-blur"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <MenuButton icon={<Heading1 className="h-3.5 w-3.5" />} label="一级标题" onClick={() => run(() => onInsertHeading(1))} />
            <MenuButton icon={<Heading2 className="h-3.5 w-3.5" />} label="二级标题" onClick={() => run(() => onInsertHeading(2))} />
            <MenuButton icon={<Minus className="h-3.5 w-3.5" />} label="场景分隔" onClick={() => run(onInsertSceneBreak)} />
            <MenuButton icon={<IndentIncrease className="h-3.5 w-3.5" />} label="全角缩进" onClick={() => run(onInsertIndent)} />
            <MenuButton icon={<Pilcrow className="h-3.5 w-3.5" />} label="待补标记" onClick={() => run(onInsertTodo)} />
            <MenuButton icon={<Eraser className="h-3.5 w-3.5" />} label="整理当前段/选区" onClick={() => run(onNormalizeSelection)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
}: {
  icon: JSX.Element;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink-200 hover:bg-ink-800 hover:text-ink-100"
      onClick={onClick}
    >
      <span className="text-ink-400">{icon}</span>
      <span>{label}</span>
    </button>
  );
}