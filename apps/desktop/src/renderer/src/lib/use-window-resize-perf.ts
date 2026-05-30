import { useEffect } from "react";

/**
 * 窗口缩放期间临时给 <html> 挂 `win-resizing` 类。
 *
 * 为什么需要：应用里有大量 backdrop-filter（毛玻璃面板/弹窗/标题栏）。
 * backdrop-filter 在窗口连续 resize 时会对其背后内容反复做高开销的模糊回读，
 * 是拖拽放大/缩小卡顿的主因。配合 styles.css 里 `html.win-resizing` 规则，
 * 在缩放进行时停用毛玻璃→帧率回升；停止缩放约 160ms 后移除类→恢复观感。
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
