// =============================================================================
// CoverDropZone —— 封面拖拽上传 + 点击上传一体化组件
// =============================================================================
// 接 file blob → 由调用方决定怎么落库（写文件 + 更新 coverPath）。
// 拖拽 visual feedback、上传中 loader、缺图占位都在这里收口。
// =============================================================================

import { useState } from "react";
import { ImageOff, Loader2, Upload } from "lucide-react";

// MIME → 扩展名映射：调用方落盘前会用到，但本组件只负责拿到 File
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

interface Props {
  coverUrl: string | null;
  uploading: boolean;
  onPickFile(file: File): void;
}

export function CoverDropZone({ coverUrl, uploading, onPickFile }: Props): JSX.Element {
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onPickFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-dashed transition-all ${
        dragOver
          ? "border-accent-400 bg-accent-500/10 ring-2 ring-accent-400/40"
          : "border-ink-700 bg-ink-800"
      }`}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-ink-700 to-ink-900 text-ink-500">
          <ImageOff className="h-8 w-8 opacity-50" />
          <div className="text-xs">拖入图片或点击下方按钮</div>
        </div>
      )}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent-500/20 backdrop-blur-sm">
          <span className="text-base font-medium text-accent-100">松开上传封面</span>
        </div>
      )}
      <label className="absolute inset-x-2 bottom-2 flex cursor-pointer items-center justify-center gap-1 rounded-md bg-ink-900/80 px-3 py-1.5 text-xs text-ink-100 ring-1 ring-accent-500/30 backdrop-blur transition-colors hover:bg-ink-900 hover:ring-accent-400/60">
        {uploading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Upload className="h-3 w-3" />
        )}
        {uploading ? "上传中…" : "上传封面（≤2MB）"}
        <input
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
        />
      </label>
    </div>
  );
}
