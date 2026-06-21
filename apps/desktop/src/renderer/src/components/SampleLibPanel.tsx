import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type {
  SampleLibImportResponse,
  SampleLibRecord,
} from "@inkforge/shared";
import { fsApi, sampleLibApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { fadeOnly } from "../lib/motion-tokens";
import { Button, TextField, Textarea } from "./ui";

export function SampleLibPanel(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const queryClient = useQueryClient();

  const [showImport, setShowImport] = useState<"text" | "epub" | null>(null);
  // v22+: title / author 仍是受控（短文本无所谓），text 用 ref 维护避免粘贴
  // 几万字时反复触发整个面板 React 重渲染。提交时统一从 ref 读取。
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [textCharCount, setTextCharCount] = useState(0);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const libsQuery = useQuery({
    queryKey: ["sample-libs", projectId],
    queryFn: () => sampleLibApi.list({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: sampleLibApi.delete,
    onSuccess: () => {
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["sample-libs"] });
    },
    onError: (err) => {
      setLastImport(friendlyErrorMessage(err, "参考库删除失败，请稍后重试。"));
    },
  });

  const onImportText = async () => {
    const text = textRef.current?.value ?? "";
    if (!projectId || !title.trim() || !text.trim()) return;
    setBusy(true);
    try {
      const res: SampleLibImportResponse = await sampleLibApi.importText({
        projectId,
        title: title.trim(),
        author: author.trim() || undefined,
        text,
      });
      setLastImport(`已导入：《${res.lib.title}》${res.chunkCount} 章`);
      if (textRef.current) textRef.current.value = "";
      setTextCharCount(0);
      setTitle("");
      setAuthor("");
      setShowImport(null);
      queryClient.invalidateQueries({ queryKey: ["sample-libs"] });
    } catch (err) {
      setLastImport(friendlyErrorMessage(err, "导入失败，请检查文本内容后重试。"));
    } finally {
      setBusy(false);
    }
  };

  const onImportEpub = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const picked = await fsApi.pickFile({
        title: "选择 EPUB",
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });
      if (!picked.path) {
        setBusy(false);
        return;
      }
      const res: SampleLibImportResponse = await sampleLibApi.importEpub({
        projectId,
        filePath: picked.path,
        title: title.trim() || undefined,
        author: author.trim() || undefined,
      });
      setLastImport(`已导入 EPUB：《${res.lib.title}》${res.chunkCount} 章`);
      setTitle("");
      setAuthor("");
      setShowImport(null);
      queryClient.invalidateQueries({ queryKey: ["sample-libs"] });
    } catch (err) {
      setLastImport(friendlyErrorMessage(err, "EPUB 导入失败，请换一本文件后重试。"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (lib: SampleLibRecord) => {
    deleteMutation.mutate({ libId: lib.id });
  };

  if (!projectId) {
    return <p className="text-xs text-ink-500">请先打开一个项目</p>;
  }

  const libs = libsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <Button
          size="sm"
          onClick={() => setShowImport("text")}
        >
          + 粘贴 TXT
        </Button>
        <Button
          size="sm"
          onClick={() => setShowImport("epub")}
        >
          + 选择 EPUB 文件
        </Button>
        <span className="ml-auto text-ink-500">续写精修会按片段匹配；也可在写作前手动指定用哪几本文集</span>
      </div>

      {showImport === "text" ? (
        <div className="space-y-2 rounded-md border border-ink-700 p-3">
          <TextField
            type="text"
            placeholder="书名（必填）"
            aria-label="参考文集书名"
            className="bg-ink-900 px-2 py-1 text-xs"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            type="text"
            placeholder="作者（可选）"
            aria-label="参考文集作者"
            className="bg-ink-900 px-2 py-1 text-xs"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          {/*
            非受控 textarea：value 直接由 DOM 维护，不再每次按键 / 粘贴都触发
            React 重渲染。粘贴几万字时不会再卡。
            字数提示用 onInput 节流到下一帧后再 setState，仅更新一个数字、
            不会拖累整个面板（textarea 自身完全不重渲染）。
          */}
          <Textarea
            ref={textRef}
            defaultValue=""
            placeholder="粘贴小说全文，自动按「第 X 章」拆章"
            aria-label="参考文集正文"
            className="h-32 rounded-md bg-ink-900 px-2 py-1 text-xs"
            onInput={(e) => {
              const len = (e.target as HTMLTextAreaElement).value.length;
              // 仅当数量级跳变时才 setState，避免每键 setState 也成为新瓶颈
              setTextCharCount((prev) =>
                Math.abs(prev - len) > 500 || len === 0 ? len : prev,
              );
            }}
          />
          <div className="flex items-center gap-2 text-[10px] text-ink-500">
            <span>{textCharCount.toLocaleString()} 字</span>
            <span className="ml-auto">大文本粘贴流畅；提交时一次性读取</span>
          </div>
          <div className="flex gap-2 text-xs">
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !title.trim()}
              onClick={onImportText}
            >
              {busy ? "导入中…" : "确认导入"}
            </Button>
            <Button
              size="sm"
              onClick={() => setShowImport(null)}
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {showImport === "epub" ? (
        <div className="space-y-2 rounded-md border border-ink-700 p-3">
          <TextField
            type="text"
            placeholder="书名（留空读 EPUB 元数据）"
            aria-label="EPUB 书名"
            className="bg-ink-900 px-2 py-1 text-xs"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            type="text"
            placeholder="作者（留空读 EPUB 元数据）"
            aria-label="EPUB 作者"
            className="bg-ink-900 px-2 py-1 text-xs"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <div className="flex gap-2 text-xs">
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={onImportEpub}
            >
              {busy ? "导入中…" : "选择文件并导入"}
            </Button>
            <Button
              size="sm"
              onClick={() => setShowImport(null)}
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {lastImport ? (
        <p
          role={lastImport.startsWith("已") ? "status" : "alert"}
          className={`text-xs ${lastImport.startsWith("已") ? "text-emerald-400" : "text-red-400"}`}
        >
          {lastImport}
        </p>
      ) : null}

      {libs.length === 0 ? (
        <p className="text-xs text-ink-500">尚无参考文集。导入小说后，续写精修会按当前章节内容匹配相近片段；也可以在续写精修面板里指定只参考某几本。</p>
      ) : (
        <ul className="divide-y divide-ink-700 rounded-md border border-ink-700 text-xs">
          {libs.map((lib) => (
            <li key={lib.id} className="flex items-center justify-between p-2">
              <div>
                <div className="font-medium text-ink-100">{lib.title}</div>
                <div className="text-ink-500">
                  {lib.author ? `${lib.author} · ` : ""}{lib.chunkCount} 章
                </div>
              </div>
              <AnimatePresence initial={false} mode="wait">
                {deleteConfirmId === lib.id ? (
                  <motion.div
                    key="delete-confirm"
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex items-center gap-1"
                  >
                    <span className="text-[11px] text-red-300">{lib.chunkCount} 章将一并删除</span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setDeleteConfirmId(null)}
                      disabled={deleteMutation.isPending}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(lib)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? "删除中" : "确认删除"}
                    </Button>
                  </motion.div>
                ) : (
                  <Button
                    key="delete-start"
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteConfirmId(lib.id)}
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    删除
                  </Button>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
