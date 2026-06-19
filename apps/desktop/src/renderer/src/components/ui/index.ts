// components/ui —— 渲染层 UI 原子组件库统一出口（barrel）。
// 调用方统一 `import { Button, Badge, ... } from "../ui"`（或 "@renderer/components/ui"）。
// 这些 primitive 全部对接现有 design token（ink/accent/c-* CSS 变量）、motion-tokens 动效与无障碍约定，
// 三套主题（dark/light/paper）自动适配，无需各处再手写长 className 串。
export { Button, IconButton, buttonVariants, type ButtonProps, type IconButtonProps } from "./Button";
export { Badge, type BadgeProps } from "./Badge";
export { TextField, Textarea, type TextFieldProps, type TextareaProps } from "./Field";
export { Select, type SelectProps } from "./Select";
export { Card, type CardProps } from "./Card";
export { Tabs, type TabsProps, type TabItem } from "./Tabs";
export { Divider, type DividerProps } from "./Divider";
export { Tooltip, type TooltipProps } from "./Tooltip";
