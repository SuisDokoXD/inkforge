import { useEffect, useState } from "react";

// 把高频变化的值去抖：返回值只在 source 停止变化 delayMs 之后才更新。
// 用途：将昂贵的派生计算（如对全文做多趟扫描的字数统计）移出每次按键的关键路径，
// 让输入手感保持顺滑，同时显示值在停顿后才刷新（对纯展示用途完全够用）。
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
