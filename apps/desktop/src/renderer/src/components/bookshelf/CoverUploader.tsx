import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Image, ImagePlus, Trash2 } from "lucide-react";
import type { ProjectRecord } from "@inkforge/shared";
import { coverApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  SPRING_SNAPPY,
  tapPress,
} from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";
import { MotionSpinner } from "../MotionSpinner";

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

type CoverStatus = {
  kind: "info" | "success" | "error";
  text: string;
};

export function CoverUploader({
  projectId,
  size = "lg",
  editable,
  fallbackName,
}: CoverUploaderProps): JSX.Element {
  const queryClient = useQueryClient();
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEditable = editable ?? size === "lg";
  const { status, showStatus } = useTimedStatus<CoverStatus>();
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
        transition: SPRING_SNAPPY,
      };

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
    onMutate: () => {
      showStatus(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookCover", projectId] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      showStatus({ kind: "success", text: "已更新" }, 2000);
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "上传封面失败，请换一张图片后重试。"),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => coverApi.delete({ projectId }),
    onMutate: () => {
      showStatus(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookCover", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      setConfirmDelete(false);
      showStatus({ kind: "success", text: "已移除" }, 2000);
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "移除封面失败，请稍后重试。"),
      });
    },
  });

  const cover = coverQuery.data?.cover;
  const base64 = coverQuery.data?.base64;
  const dataUrl = cover && base64 ? `data:${cover.mime};base64,${base64}` : null;

  const dimensions = size === "lg" ? "h-44 w-32" : "h-12 w-9";
  const radius = size === "lg" ? "rounded-lg" : "rounded";
  const isBusy = uploadMut.isPending || deleteMut.isPending;
  const coverMotion = isEditable && !isBusy ? buttonMotion : {};

  const tryUpload = (file: File | undefined): void => {
    if (!file || isBusy) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      showStatus({ kind: "error", text: `不支持的格式：${file.type || "未知"}` });
      return;
    }
    if (file.size > MAX_BYTES) {
      showStatus({
        kind: "error",
        text: `文件过大（${Math.round(file.size / 1024)}KB），上限 2 MB`,
      });
      return;
    }
    showStatus(null);
    uploadMut.mutate(file);
  };

  const visibleStatus: CoverStatus | null =
    uploadMut.isPending
      ? { kind: "info", text: "上传中…" }
      : deleteMut.isPending
        ? { kind: "info", text: "移除中…" }
        : status;

  const statusClassName =
    visibleStatus?.kind === "error"
      ? "text-rose-400"
      : visibleStatus?.kind === "success"
        ? "text-emerald-300"
        : "text-accent-300";

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.label
        htmlFor={isEditable && !isBusy ? inputId : undefined}
        role={isEditable ? "button" : undefined}
        aria-label={isEditable ? (dataUrl ? "更换封面" : "上传封面") : undefined}
        aria-disabled={isEditable ? isBusy : undefined}
        aria-busy={isEditable ? isBusy : undefined}
        tabIndex={isEditable ? 0 : undefined}
        onKeyDown={
          isEditable && !isBusy
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }
            : undefined
        }
        onDragOver={
          isEditable && !isBusy
            ? (e) => {
                e.preventDefault();
                setDragOver(true);
              }
            : undefined
        }
        onDragLeave={isEditable && !isBusy ? () => setDragOver(false) : undefined}
        onDrop={
          isEditable && !isBusy
            ? (e) => {
                e.preventDefault();
                setDragOver(false);
                tryUpload(e.dataTransfer.files?.[0]);
              }
            : undefined
        }
        className={`group relative overflow-hidden border bg-ink-800 transition-[border-color,box-shadow,opacity,filter] duration-200 ${dimensions} ${radius} ${
          isEditable && !isBusy
            ? "cursor-pointer border-dashed hover:border-accent-400/60 hover:shadow-lg hover:shadow-accent-500/10"
            : isEditable
              ? "cursor-wait border-accent-400/30 opacity-85"
            : "border-ink-700"
        } ${dragOver ? "border-accent-400 ring-2 ring-accent-400/40" : "border-ink-700"}`}
        {...coverMotion}
      >
        {dataUrl ? (
          <>
            <img src={dataUrl} alt="封面" className="h-full w-full object-cover" />
            {isEditable && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-medium text-white/0 transition-[background-color,color] duration-200 group-hover:bg-black/55 group-hover:text-white">
                <div className="flex flex-col items-center gap-1">
                  <Image className="h-4 w-4" aria-hidden />
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
                <ImagePlus className="h-7 w-7" aria-hidden />
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
              <Image className="h-4 w-4" aria-hidden />
            )}
          </div>
        )}
      </motion.label>

      {isEditable && dataUrl && (
        <AnimatePresence initial={false} mode="wait">
          {confirmDelete ? (
            <motion.div
              key="delete-confirm"
              className="flex items-center gap-1 text-[10px]"
              variants={stateMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteMut.isPending}
                className="rounded px-1.5 py-0.5 text-ink-500 hover:bg-ink-800 hover:text-ink-300 disabled:cursor-default disabled:opacity-60"
              >
                取消
              </button>
              <motion.button
                type="button"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="inline-flex min-w-[52px] items-center justify-center gap-1 rounded px-1.5 py-0.5 text-rose-300 hover:bg-rose-500/10 disabled:cursor-default disabled:opacity-60"
                {...(deleteMut.isPending ? {} : buttonMotion)}
              >
                {deleteMut.isPending ? <MotionSpinner className="h-3 w-3" /> : null}
                {deleteMut.isPending ? "移除中" : "确认移除"}
              </motion.button>
            </motion.div>
          ) : (
            <motion.button
              key="delete-start"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              className="inline-flex items-center gap-1 text-[10px] text-ink-500 hover:text-rose-400"
              variants={fadeOnly}
              initial="initial"
              animate="animate"
              exit="exit"
              aria-label="移除封面"
              {...buttonMotion}
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              移除封面
            </motion.button>
          )}
        </AnimatePresence>
      )}
      {isEditable && (
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          aria-label={dataUrl ? "选择新的封面图片" : "选择封面图片"}
          accept={ACCEPT}
          disabled={isBusy}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            tryUpload(file);
          }}
        />
      )}
      <AnimatePresence initial={false}>
        {visibleStatus ? (
          <motion.div
            className={`inline-flex max-w-[140px] items-center justify-center gap-1 text-center text-[10px] ${statusClassName}`}
            role={visibleStatus.kind === "error" ? "alert" : "status"}
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {visibleStatus.kind === "info" ? <MotionSpinner className="h-3 w-3" /> : null}
            {visibleStatus.text}
          </motion.div>
        ) : null}
      </AnimatePresence>
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
