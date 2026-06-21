// Select —— 原生下拉选择框，复用 Field 的统一外壳样式，保证与输入框视觉一致。
import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { fieldBase, fieldInvalid } from "./Field";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, id, "aria-invalid": ariaInvalid, children, ...props },
  ref,
) {
  const generatedId = useId();

  return (
    <select
      ref={ref}
      id={id ?? generatedId}
      aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
      className={cn(fieldBase, invalid && fieldInvalid, className)}
      {...props}
    >
      {children}
    </select>
  );
});
