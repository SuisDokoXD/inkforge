import { useState } from "react";
import {
  chapterImportApi,
  fsApi,
  projectExportApi,
} from "../lib/api";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { AnimatedDialog } from "./AnimatedDialog";

type ExportFormat = "txt" | "md" | "html" | "docx" | "epub";
type ImportFormat = "txt" | "epub";

interface ExportDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

const EXPORT_OPTIONS: Array<{ key: ExportFormat; label: string; desc: string }> = [
  { key: "txt", label: "TXT", desc: "纯文本，发布起点/番茄等渠道" },
  { key: "md", label: "Markdown", desc: "GitHub / Obsidian 等" },
  { key: "html", label: "HTML", desc: "浏览器打开，可打印为 PDF" },
  { key: "docx", label: "Word DOCX", desc: "投稿出版社 / 印刷" },
  { key: "epub", label: "EPUB", desc: "Kindle / 多看 / 静读天下" },
];

export function ExportDialog({ projectId, open, onClose, onImported }: ExportDialogProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const handleExport = async (fmt: ExportFormat) => {
    setBusy(true);
    setStatus(null);
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
      setStatus({
        kind: "ok",
        text: `✓ ${fmt.toUpperCase()} 导出成功：${res.chapterCount} 章 · ${kb} KB · ${res.outputPath}`,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === "export_cancelled") {
        setStatus({ kind: "err", text: "已取消" });
      } else {
        setStatus({ kind: "err", text: `导出失败：${friendlyErrorMessage(err, "导出失败，请稍后重试。")}` });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (fmt: ImportFormat) => {
    setBusy(true);
    setStatus(null);
    try {
      const picked = await fsApi.pickFile({
        title: `选择 ${fmt.toUpperCase()} 文件`,
        filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }],
      });
      if (!picked.path) {
        setStatus({ kind: "err", text: "已取消" });
        setBusy(false);
        return;
      }
      const importer = fmt === "txt" ? chapterImportApi.txt : chapterImportApi.epub;
      const res = await importer({ projectId, filePath: picked.path });
      setStatus({
        kind: "ok",
        text: `✓ ${fmt.toUpperCase()} 拆章导入成功：新增 ${res.created} 章`,
      });
      onImported?.();
    } catch (err) {
      setStatus({ kind: "err", text: `导入失败：${friendlyErrorMessage(err, "导入失败，请检查文件后重试。")}` });
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
          className="rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700"
          onClick={onClose}
          disabled={busy}
          title="关闭"
        >
          ✕
        </button>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase text-ink-400">导出整本书</h3>
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

      {status ? (
        <p
          className={`mt-4 text-xs ${
            status.kind === "ok" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {status.text}
        </p>
      ) : null}
      {busy ? <p className="mt-2 text-xs text-ink-400">处理中…</p> : null}
    </AnimatedDialog>
  );
}
