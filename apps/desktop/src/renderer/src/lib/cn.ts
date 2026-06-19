// Tailwind class 合并工具：clsx 负责条件拼接（数组/对象/假值过滤），
// tailwind-merge 消解同类工具类冲突（后写覆盖先写，如 px-2→px-4 只保留后者）。
// 所有 components/ui/ primitive 都用它把 cva 产出的基样式与调用方传入的 className 安全合并。
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
