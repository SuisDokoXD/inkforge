import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus, Type } from "lucide-react";
import type { AppSettings } from "@inkforge/shared";
import { fadeOnly, fadeSlideUp } from "../../lib/motion-tokens";
import { cn } from "../../lib/cn";
import { Button, IconButton } from "../ui";

type EditorAppearanceSettings = Pick<
  AppSettings,
  "editorFontSize" | "editorLineHeight" | "editorWidth" | "typewriterMode" | "spellcheck"
>;

interface EditorAppearanceMenuProps {
  settings: EditorAppearanceSettings;
  onChange: (updates: Partial<AppSettings>) => void;
}

export function EditorAppearanceMenu({
  settings,
  onChange,
}: EditorAppearanceMenuProps): JSX.Element {
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

  const adjustFontSize = (delta: number) => {
    onChange({ editorFontSize: Math.max(14, Math.min(24, settings.editorFontSize + delta)) });
  };
  const adjustLineHeight = (delta: number) => {
    const next = Math.round(Math.max(1.5, Math.min(3, settings.editorLineHeight + delta)) * 10) / 10;
    onChange({ editorLineHeight: next });
  };

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        size="sm"
        variant={open ? "accentSoft" : "ghost"}
        aria-label="调整编辑器外观"
        title="编辑器外观"
        aria-pressed={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Type className="h-4 w-4" />
      </IconButton>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-ink-700 bg-ink-900 p-3 text-xs text-ink-200 shadow-xl backdrop-blur"
            variants={panelMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="space-y-3">
              <ControlRow label="宽度">
                {(["narrow", "medium", "wide"] as const).map((width) => (
                  <button
                    key={width}
                    type="button"
                    className={cn(
                      "h-7 rounded-md px-2 text-xs",
                      settings.editorWidth === width
                        ? "bg-accent-500 text-ink-950"
                        : "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
                    )}
                    aria-pressed={settings.editorWidth === width}
                    onClick={() => onChange({ editorWidth: width })}
                  >
                    {width === "narrow" ? "窄" : width === "medium" ? "中" : "宽"}
                  </button>
                ))}
              </ControlRow>
              <ControlRow label="字号">
                <StepperButton label="缩小字号" onClick={() => adjustFontSize(-1)} disabled={settings.editorFontSize <= 14} icon="minus" />
                <span className="w-9 text-center tabular-nums text-ink-300">{settings.editorFontSize}</span>
                <StepperButton label="放大字号" onClick={() => adjustFontSize(1)} disabled={settings.editorFontSize >= 24} icon="plus" />
              </ControlRow>
              <ControlRow label="行高">
                <StepperButton label="减小行高" onClick={() => adjustLineHeight(-0.1)} disabled={settings.editorLineHeight <= 1.5} icon="minus" />
                <span className="w-9 text-center tabular-nums text-ink-300">{settings.editorLineHeight.toFixed(1)}</span>
                <StepperButton label="增大行高" onClick={() => adjustLineHeight(0.1)} disabled={settings.editorLineHeight >= 3} icon="plus" />
              </ControlRow>
              <label className="flex items-center justify-between gap-3 rounded-md px-1 py-1 text-ink-300">
                <span>打字机模式</span>
                <input
                  type="checkbox"
                  aria-label={"\u5207\u6362\u6253\u5b57\u673a\u6a21\u5f0f"}
                  checked={settings.typewriterMode}
                  onChange={(event) => onChange({ typewriterMode: event.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md px-1 py-1 text-ink-300">
                <span>拼写检查</span>
                <input
                  type="checkbox"
                  aria-label={"\u5207\u6362\u62fc\u5199\u68c0\u67e5"}
                  checked={settings.spellcheck}
                  onChange={(event) => onChange({ spellcheck: event.target.checked })}
                />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ControlRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function StepperButton({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  icon: "minus" | "plus";
}): JSX.Element {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 px-0"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon === "minus" ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
    </Button>
  );
}
