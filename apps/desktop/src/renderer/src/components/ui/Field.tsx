// TextField / Textarea —— 文本输入原子组件。统一全站输入框外观与焦点环（accent-500 描边 + 半透明 ring）。
// 外观值固化自已润色规范：rounded-lg、border-ink-600、bg-ink-800、focus:ring-1 ring-accent-500/30。
// invalid 为 true 时切换到危险色描边/焦点环，供表单校验复用。
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// 输入类元素共用的基础外壳样式。
const fieldBase =
  "w-full rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30 disabled:cursor-default disabled:opacity-60";
// 校验失败态：红色描边 + 红色焦点环。
const fieldInvalid = "border-rose-400/60 focus:border-rose-400 focus:ring-rose-400/40";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className, invalid, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, invalid && fieldInvalid, className)} {...props} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** 缩放方向：默认允许纵向拖拽，传 "none" 锁定尺寸。 */
  resize?: "none" | "y";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, resize = "y", ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, resize === "none" ? "resize-none" : "resize-y", invalid && fieldInvalid, className)}
      {...props}
    />
  );
});

// 供 Select 等同类控件复用同一套外壳。
export { fieldBase, fieldInvalid };
