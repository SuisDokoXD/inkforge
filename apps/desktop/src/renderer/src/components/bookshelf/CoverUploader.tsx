import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectRecord } from "@inkforge/shared";
import { coverApi } from "../../lib/api";

interface CoverUploaderProps {
  projectId: string;
  /** 控制尺寸：'lg' 用于 BookHeader，'sm' 用于 BookTabsBar 缩略图。 */
  size?: "sm" | "lg";
  /** 是否允许点击上传。 sm 模式下默认禁用（避免误触）。 */
  editable?: boolean;
  fallbackName?: ProjectRecord["name"];
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 2 * 1024 * 1024;

export function CoverUploader({
  projectId,
  size = "lg",
  editable,
  fallbackName,
}: CoverUploaderProps): JSX.Element {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEditable = editable ?? size === "lg";
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const coverQuery = useQuery({
    queryKey: ["bookCover", projectId],
    queryFn: () => coverApi.get({ projectId }),
    staleTime: 30_000,
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) =>
      readFileAsBase64(file).then((base64) =>
        coverApi.upload({
          projectId,
          fileName: file.name,
          base64,
          mime: file.type,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookCover", projectId] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      setError(null);
    },
    onError: (err) => setError(String(err)),
  });

  const deleteMut = useMutation({
    mutationFn: () => coverApi.delete({ projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookCover", projectId] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
    },
  });

  useEffect(() => {
    if (uploadMut.isSuccess) {
      const t = setTimeout(() => uploadMut.reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [uploadMut.isSuccess, uploadMut]);

  const cover = coverQuery.data?.cover;
  const base64 = coverQuery.data?.base64;
  const dataUrl = cover && base64 ? `data:${cover.mime};base64,${base64}` : null;

  const dimensions = size === "lg" ? "h-44 w-32" : "h-12 w-9";
  const radius = size === "lg" ? "rounded-lg" : "rounded";

  const tryUpload = (file: File | undefined): void => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      setError(`不支持的格式：${file.type || "未知"}`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`文件过大（${Math.round(file.size / 1024)}KB），上限 2 MB`);
      return;
    }
    setError(null);
    uploadMut.mutate(file);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role={isEditable ? "button" : undefined}
        tabIndex={isEditable ? 0 : undefined}
        onClick={isEditable ? () => fileInputRef.current?.click() : undefined}
        onKeyDown={
          isEditable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }
            : undefined
        }
        onDragOver={
          isEditable
            ? (e) => {
                e.preventDefault();
                setDragOver(true);
              }
            : undefined
        }
        onDragLeave={isEditable ? () => setDragOver(false) : undefined}
        onDrop={
          isEditable
            ? (e) => {
                e.preventDefault();
                setDragOver(false);
                tryUpload(e.dataTransfer.files?.[0]);
              }
            : undefined
        }
        className={`group relative overflow-hidden border bg-ink-800 transition-all ${dimensions} ${radius} ${
          isEditable
            ? "cursor-pointer border-dashed hover:border-accent-400/60 hover:shadow-lg hover:shadow-accent-500/10"
            : "border-ink-700"
        } ${dragOver ? "border-accent-400 ring-2 ring-accent-400/40" : "border-ink-700"}`}
      >
        {dataUrl ? (
          <>
            <img src={dataUrl} alt="封面" className="h-full w-full object-cover" />
            {isEditable && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-medium text-white/0 transition-all group-hover:bg-black/55 group-hover:text-white">
                <div className="flex flex-col items-center gap-1">
                  <span aria-hidden className="text-base">🖼</span>
                  <span>点击更换</span>
                </div>
              </div>
            )}
          </>
        ) : (
          // 空状态：明显的"上传"引导
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center transition-colors ${
              isEditable
                ? "bg-gradient-to-br from-ink-700/40 to-ink-800 text-ink-300 group-hover:from-accent-500/10 group-hover:to-fuchsia-500/10 group-hover:text-accent-200"
                : "text-ink-500"
            }`}
          >
            {size === "lg" ? (
              <>
                <span aria-hidden className="text-2xl">📷</span>
                {isEditable ? (
                  <>
                    <span className="text-xs font-medium">上传封面</span>
                    <span className="text-[10px] text-ink-500">
                      点击 / 拖拽图片
                    </span>
                    <span className="mt-1 truncate text-[10px] text-ink-600">
                      {fallbackName ?? "未命名"}
                    </span>
                  </>
                ) : (
                  <span className="text-xs">{fallbackName ?? "未命名"}</span>
                )}
              </>
            ) : (
              <span className="text-[10px]">📕</span>
            )}
          </div>
        )}
      </div>

      {isEditable && dataUrl && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deleteMut.mutate();
          }}
          className="text-[10px] text-ink-500 hover:text-rose-400"
        >
          移除封面
        </button>
      )}
      {isEditable && (
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            tryUpload(file);
          }}
        />
      )}
      {error && (
        <div className="max-w-[140px] text-center text-[10px] text-rose-400">
          {error}
        </div>
      )}
      {uploadMut.isPending && (
        <div className="text-[10px] text-accent-300">上传中…</div>
      )}
      {uploadMut.isSuccess && (
        <div className="text-[10px] text-emerald-300">已更新 ✓</div>
      )}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("read failed"));
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + "base64,".length) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
