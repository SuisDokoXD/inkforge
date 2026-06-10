import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fsApi, sampleLibApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";

/**
 * v22+: 全局拖拽接管。
 *
 * 行为（学自 VS Code / Notion / Obsidian / 飞书的桌面端）：
 *  - 任何把文件拖入窗口的动作都先 preventDefault，避免 Electron 默认
 *    把文件作为新页面替换掉当前 SPA。
 *  - 拖入合法类型（.epub / .txt）时弹出全屏半透明蒙层 + 中央一张大卡片，
 *    告诉用户"松开 → 导入素材库"。
 *  - 拖入其它文件类型不弹蒙层，松开也不做任何事，让用户察觉自己拖错了。
 *  - drop 时按文件类型分流：
 *      .epub → main 进程直接读盘 + 拆章
 *      .txt  → renderer 用 File.text() 一次性读，调 importText
 *  - 没有当前项目时不阻塞，但 toast 提示"先选书"。
 *  - 顶部展示一个临时 toast 列表（自动 3s 消失）。
 *  - Esc 取消（只是隐藏蒙层，没有 in-flight import 时无副作用；
 *    in-flight 的网络请求继续完成，避免半成品脏数据）。
 */
export function GlobalDropZone(): JSX.Element | null {
  const queryClient = useQueryClient();
  const projectId = useAppStore((s) => s.currentProjectId);
  const setMainView = useAppStore((s) => s.setMainView);

  const [active, setActive] = useState(false);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; ok: boolean }[]>([]);
  // dragenter / dragleave 在子元素之间反复触发，用计数器抵消，
  // 避免鼠标在窗口里移动时蒙层闪烁。
  const dragCounter = useRef(0);

  const pushToast = (text: string, ok: boolean): void => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, ok }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  useEffect(() => {
    const isAcceptable = (e: DragEvent): boolean => {
      // dragenter/over 阶段拿不到 files 内容，只能看 items 类型。
      // Electron 32 在 dragover 时 items 已可读取 kind/type。
      const items = e.dataTransfer?.items;
      if (!items || items.length === 0) return false;
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        // 通过 type 提示判断（少数浏览器拖拽时 type 为空，给宽松通过）
        if (item.type === "" || /epub|plain|text/.test(item.type)) return true;
      }
      return false;
    };

    const onEnter = (e: DragEvent): void => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      dragCounter.current += 1;
      if (isAcceptable(e)) setActive(true);
    };
    const onOver = (e: DragEvent): void => {
      // 必须 preventDefault 才会触发 drop 事件
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent): void => {
      e.preventDefault();
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setActive(false);
    };
    const onDrop = async (e: DragEvent): Promise<void> => {
      e.preventDefault();
      dragCounter.current = 0;
      setActive(false);

      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      if (!projectId) {
        pushToast("先选择/创建一本书再拖入素材文件", false);
        return;
      }

      const accepted = files.filter((f) => /\.(epub|txt)$/i.test(f.name));
      const rejected = files.filter((f) => !/\.(epub|txt)$/i.test(f.name));
      for (const f of rejected) {
        pushToast(`✗ 不支持的文件：${f.name}`, false);
      }
      if (accepted.length === 0) return;

      // 拖入即跳到素材库 view，便于用户立刻看到导入结果
      setMainView("materials");

      for (const file of accepted) {
        const ext = file.name.toLowerCase().endsWith(".epub") ? "epub" : "txt";
        const baseTitle = file.name.replace(/\.(epub|txt)$/i, "");
        setBusyText(`导入中 · ${file.name}`);
        try {
          if (ext === "epub") {
            // Electron 32+: use the preload bridge for the real filesystem path.
            const filePath = fsApi.getPathForFile(file);
            if (!filePath) {
              throw new Error("无法获取 EPUB 文件路径");
            }
            const res = await sampleLibApi.importEpub({
              projectId,
              filePath,
            });
            pushToast(`✓ 已导入《${res.lib.title}》${res.chunkCount} 章`, true);
          } else {
            // 文本文件直接 renderer 端读取，避免新加 IPC
            const text = await file.text();
            if (!text.trim()) throw new Error("文件为空");
            const res = await sampleLibApi.importText({
              projectId,
              title: baseTitle || "(无标题)",
              text,
            });
            pushToast(`✓ 已导入《${res.lib.title}》${res.chunkCount} 章`, true);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          pushToast(`✗ ${file.name}：${msg}`, false);
        }
      }
      setBusyText(null);
      queryClient.invalidateQueries({ queryKey: ["sample-libs"] });
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setActive(false);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("keydown", onEsc);
    };
  }, [projectId, queryClient, setMainView]);

  return (
    <>
      {active && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/70 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent-400/60 bg-ink-800/90 px-10 py-8 text-center shadow-2xl">
            <div className="text-4xl">📥</div>
            <div className="mt-2 text-base font-semibold text-accent-100">
              松开 → 导入素材库
            </div>
            <div className="mt-1 text-xs text-ink-300">
              支持 .epub / .txt · 自动按章节切分 · ESC 取消
            </div>
          </div>
        </div>
      )}
      {(busyText || toasts.length > 0) && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[55] flex max-w-sm flex-col items-end gap-2">
          {busyText && (
            <div className="rounded-md border border-accent-500/40 bg-ink-800/95 px-3 py-2 text-xs text-accent-100 shadow-lg">
              {busyText}
            </div>
          )}
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-md border px-3 py-2 text-xs shadow-lg ${
                t.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-100"
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
