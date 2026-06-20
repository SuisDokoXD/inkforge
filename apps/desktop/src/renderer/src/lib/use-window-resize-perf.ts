import { useEffect } from "react";

/**
 * 窗口缩放期间临时给 <html> 挂 `win-resizing` 类。
 *
 * 缩放会连续触发布局变化，CSS transition / keyframes 容易反复重算。
 * 配合 styles.css 里 `html.win-resizing` 规则，在缩放期间暂停这些效果；
 * 停止缩放约 160ms 后移除类，空闲时观感不变。
 *
 * 实现：resize 事件用 rAF 合并到每帧最多加一次类；尾随 debounce 负责移除。
 * 在 App 顶层调用一次即可。
 */
export function useWindowResizePerf(): void {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    let clearTimer: number | undefined;
    const onResize = (): void => {
      if (!raf) {
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          root.classList.add("win-resizing");
        });
      }
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => root.classList.remove("win-resizing"), 160);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(clearTimer);
      if (raf) window.cancelAnimationFrame(raf);
      root.classList.remove("win-resizing");
    };
  }, []);
}
