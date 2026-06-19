import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  chapterImportApi,
  fsApi,
  projectExportApi,
  projectPackageApi,
} from "../lib/api";
import { X } from "lucide-react";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { AnimatedDialog } from "./AnimatedDialog";
import { MotionSpinner } from "./MotionSpinner";
import { fadeOnly, fadeSlideUp } from "../lib/motion-tokens";
import { useTimedStatus } from "../lib/use-timed-status";

type ExportFormat = "txt" | "md" | "html" | "docx" | "epub";
type ImportFormat = "txt" | "epub";

interface ExportDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

type ExportDialogStatus = {
  kind: "info" | "success" | "error";
  text: string;
};

const EXPORT_OPTIONS: Array<{ key: ExportFormat; label: string; desc: string }> = [
  { key: "txt", label: "TXT", desc: "章节正文，纯文本渠道" },
  { key: "md", label: "Markdown", desc: "章节正文，GitHub / Obsidian" },
  { key: "html", label: "HTML", desc: "章节正文，浏览器打开或打印" },
  { key: "docx", label: "Word DOCX", desc: "章节正文，投稿或印刷" },
  { key: "epub", label: "EPUB", desc: "章节正文，电子书阅读器" },
];

export function ExportDialog({ projectId, open, onClose, onImported }: ExportDialogProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const { status, showStatus } = useTimedStatus<ExportDialogStatus>();
  const reduceMotion = useReducedMotion() === true;
  const feedbackMotion = reduceMotion ? fadeOnly : fadeSlideUp;

  const handleExport = async (fmt: ExportFormat) => {
    setBusy(true);
    showStatus(null);
    try {
      const exporter =
        fmt === "txt"
          ? projectExportApi.txt
          : fmt === "md"
            ? projectExportApi.md
            : fmt === "html"
              ? projectExportApi.html
              : fmt === "docx"
                ? projectExportApi.docx
                : projectExportApi.epub;
      const res = await exporter({ projectId });
      const kb = (res.byteCount / 1024).toFixed(1);
      showStatus(
        {
          kind: "success",
          text: `${fmt.toUpperCase()} 已导出：${res.chapterCount} 章 · ${kb} KB · ${res.outputPath}`,
        },
        5000,
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === "export_cancelled") {
        showStatus({ kind: "info", text: "已取消" }, 1800);
      } else {
        showStatus({
          kind: "error",
          text: `导出失败：${friendlyErrorMessage(err, "导出失败，请稍后重试。")}`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (fmt: ImportFormat) => {
    setBusy(true);
    showStatus(null);
    try {
      const picked = await fsApi.pickFile({
        title: `选择 ${fmt.toUpperCase()} 文件`,
        filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }],
      });
      if (!picked.path) {
        showStatus({ kind: "info", text: "已取消" }, 1800);
        return;
      }
      const importer = fmt === "txt" ? chapterImportApi.txt : chapterImportApi.epub;
      const res = await importer({ projectId, filePath: picked.path });
      showStatus(
        {
          kind: "success",
          text: `${fmt.toUpperCase()} 已拆章导入：新增 ${res.created} 章`,
        },
        3200,
      );
      onImported?.();
    } catch (err) {
      showStatus({
        kind: "error",
        text: `导入失败：${friendlyErrorMessage(err, "导入失败，请检查文件后重试。")}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePackageExport = async () => {
    setBusy(true);
    showStatus(null);
    try {
      const res = await projectPackageApi.export({ projectId });
      const mb = (res.byteCount / 1024 / 1024).toFixed(2);
      showStatus(
        {
          kind: "success",
          text: `项目备份包已导出：${res.chapterCount} 章 · ${res.characterCount} 人物 · ${res.worldEntryCount} 世界条目 · ${mb} MB · ${res.outputPath}`,
        },
        6000,
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === "export_cancelled") {
        showStatus({ kind: "info", text: "已取消" }, 1800);
      } else {
        showStatus({
          kind: "error",
          text: `项目备份导出失败：${friendlyErrorMessage(err, "导出失败，请稍后重试。")}`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePackageImport = async () => {
    setBusy(true);
    showStatus(null);
    try {
      const res = await projectPackageApi.import({});
      showStatus(
        {
          kind: "success",
          text: `已导入为新项目「${res.name}」：${res.chapterCount} 章 · ${res.characterCount} 人物 · ${res.worldEntryCount} 世界条目`,
        },
        5000,
      );
      onImported?.();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === "import_cancelled") {
        showStatus({ kind: "info", text: "已取消" }, 1800);
      } else {
        showStatus({
          kind: "error",
          text: `项目备份导入失败：${friendlyErrorMessage(err, "导入失败，请检查文件后重试。")}`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel="导入 / 导出"
      overlayClassName="flex items-center justify-center p-8"
      zClassName="z-40"
      panelClassName="w-full max-w-lg rounded-2xl border border-ink-600 bg-ink-800 p-6 text-ink-100 shadow-2xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">导入 / 导出</h2>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-700"
          onClick={onClose}
          disabled={busy}
          aria-label="关闭导入导出"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase text-ink-400">导出作品正文</h3>
        <p className="text-xs text-ink-500">
          这些格式只包含章节正文；人物、世界观、素材、快照和日志会留在本地项目中。
        </p>
        <ul className="space-y-2">
          {EXPORT_OPTIONS.map((opt) => (
            <li key={opt.key}>
              <button
                className="flex w-full items-center justify-between rounded-md border border-ink-700 bg-ink-900/40 px-3 py-2 text-left hover:border-accent-500 hover:bg-ink-700/40 disabled:opacity-50"
                disabled={busy}
                onClick={() => handleExport(opt.key)}
              >
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="ml-2 text-xs text-ink-400">{opt.desc}</span>
                </span>
                <span className="text-xs text-accent-400">导出</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <hr className="my-5 border-ink-700" />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase text-ink-400">项目备份包</h3>
        <p className="text-xs text-ink-500">
          `.inkforge.zip` 会包含项目元数据、章节正文、人物、世界观、素材、参考库、版本备份和日志；不会包含模型服务密钥。
        </p>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-md border border-emerald-600/70 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-600/15 disabled:opacity-50"
            disabled={busy}
            onClick={handlePackageExport}
          >
            导出项目备份
          </button>
          <button
            className="flex-1 rounded-md border border-sky-600/70 px-3 py-2 text-sm text-sky-100 hover:bg-sky-600/15 disabled:opacity-50"
            disabled={busy}
            onClick={handlePackageImport}
          >
            导入为新项目
          </button>
        </div>
      </section>

      <hr className="my-5 border-ink-700" />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase text-ink-400">从 TXT/EPUB 拆章导入到本项目</h3>
        <p className="text-xs text-ink-500">
          按「第 X 章/回/卷/篇/节」自动拆分（TXT），或按 EPUB spine 顺序导入。每个章节会成为本项目的一个新章节。
        </p>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-md border border-ink-600 px-3 py-2 text-sm hover:bg-ink-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => handleImport("txt")}
          >
            选择 TXT
          </button>
          <button
            className="flex-1 rounded-md border border-ink-600 px-3 py-2 text-sm hover:bg-ink-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => handleImport("epub")}
          >
            选择 EPUB
          </button>
        </div>
      </section>

      <AnimatePresence initial={false}>
        {status ? (
          <motion.p
            role={status.kind === "error" ? "alert" : "status"}
            className={`mt-4 rounded-md border px-3 py-2 text-xs ${
              status.kind === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : status.kind === "error"
                  ? "border-red-500/25 bg-red-500/10 text-red-300"
                  : "border-ink-500/25 bg-ink-500/10 text-ink-300"
            }`}
            variants={feedbackMotion}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {status.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {busy ? (
          <motion.p
            className="mt-2 flex items-center gap-2 text-xs text-ink-400"
            role="status"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <MotionSpinner className="h-3.5 w-3.5 text-accent-300" />
            处理中…
          </motion.p>
        ) : null}
      </AnimatePresence>
    </AnimatedDialog>
  );
}
