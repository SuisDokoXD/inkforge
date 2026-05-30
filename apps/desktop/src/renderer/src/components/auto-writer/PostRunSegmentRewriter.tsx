import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMQuickActionInput } from "@inkforge/shared";
import { chapterApi, chapterGenApi, llmApi } from "../../lib/api";

/**
 * v22+: AutoWriter 完成后，让用户对任意段落"否决重写"。
 *
 * 设计理由：
 *   - in-flight run 内"撤回 / 回炉某段"对 orchestrator 改动太大；
 *   - 所以选择"完成后再处理"这条更简单的路径。
 *   - 复用现成的 quick-action.polish + chapterGen.commitDraft，
 *     不需要新 IPC。
 *
 * 章节 markdown 格式约定：第一行 `# 标题`，空行，正文段落以双换行分隔。
 * 我们把首行 title 抽出来，剩余按 `\n\n` 切段，每段独立渲染。
 */

interface Props {
  chapterId: string;
  projectId: string;
  chapterTitle?: string;
  /** 父组件 invalidate chapters 时附带触发的 key */
  onChapterUpdated?: () => void;
}

interface Paragraph {
  /** 段在原 markdown body 中的索引（0-based） */
  index: number;
  text: string;
}

function splitChapterMd(md: string): { titleLine: string; body: string; paragraphs: Paragraph[] } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let titleLine = "";
  let bodyStart = 0;
  // 第一行如果是 `# xxx`，挑出来作为标题
  if (lines.length > 0 && /^#\s+/.test(lines[0].trim())) {
    titleLine = lines[0];
    bodyStart = 1;
    while (bodyStart < lines.length && lines[bodyStart].trim() === "") bodyStart += 1;
  }
  const body = lines.slice(bodyStart).join("\n").trim();
  const paragraphs: Paragraph[] = body
    .split(/\n{2,}/)
    .map((s, i) => ({ index: i, text: s.trim() }))
    .filter((p) => p.text.length > 0);
  return { titleLine, body, paragraphs };
}

function rejoinChapter(titleLine: string, paragraphs: Paragraph[]): string {
  const head = titleLine ? titleLine + "\n\n" : "";
  return head + paragraphs.map((p) => p.text).join("\n\n") + "\n";
}

export function PostRunSegmentRewriter({
  chapterId,
  projectId,
  chapterTitle,
  onChapterUpdated,
}: Props): JSX.Element | null {
  const queryClient = useQueryClient();
  const readQuery = useQuery({
    queryKey: ["chapter-read-for-rewrite", chapterId],
    queryFn: () => chapterApi.read({ id: chapterId }),
  });

  const md = readQuery.data?.content ?? "";
  const split = useMemo(() => splitChapterMd(md), [md]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const rewriteMut = useMutation({
    mutationFn: async (target: Paragraph) => {
      // 取上下文：相邻 ±1 段
      const before = split.paragraphs
        .filter((p) => p.index < target.index)
        .slice(-1)
        .map((p) => p.text)
        .join("\n\n");
      const after = split.paragraphs
        .filter((p) => p.index > target.index)
        .slice(0, 1)
        .map((p) => p.text)
        .join("\n\n");
      const input: LLMQuickActionInput = {
        kind: "polish",
        selectedText: target.text,
        contextBefore: before || undefined,
        contextAfter: after || undefined,
        extraInstruction: reason.trim() || "用户对这段不满意，整体质感更好一点",
      };
      const res = await llmApi.quick(input);
      const newText = (res.text ?? "").trim();
      if (!newText) throw new Error("LLM 未返回任何文本");

      // 替换该段，重组章节
      const nextParagraphs = split.paragraphs.map((p) =>
        p.index === target.index ? { ...p, text: newText } : p,
      );
      const nextMd = rejoinChapter(split.titleLine, nextParagraphs);

      await chapterGenApi.commitDraft({
        projectId,
        chapterId,
        text: nextMd.replace(/^#\s+[^\n]+\n+/, "").trim(),
        title: chapterTitle ?? "AI 生成章节",
      });
    },
    onSuccess: () => {
      setActiveIdx(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["chapter-read-for-rewrite", chapterId] });
      queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
      onChapterUpdated?.();
    },
  });

  if (readQuery.isLoading) {
    return (
      <section className="rounded-md border border-ink-700 bg-ink-900/40 p-2 text-xs text-ink-400">
        加载章节内容…
      </section>
    );
  }

  if (split.paragraphs.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 rounded-md border border-ink-700 bg-ink-900/40 p-2">
      <header className="flex items-center gap-2 text-xs">
        <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-ink-200">
          ✏ 段落审改
        </span>
        <span className="text-ink-400">点 👎 让 AI 用你的反馈重写该段</span>
        <span className="ml-auto text-ink-500">{split.paragraphs.length} 段</span>
      </header>
      <ul className="space-y-1">
        {split.paragraphs.map((p) => {
          const active = activeIdx === p.index;
          return (
            <li
              key={p.index}
              className={`rounded border p-2 text-[11px] leading-5 ${
                active
                  ? "border-accent-500/50 bg-accent-500/10"
                  : "border-ink-700 bg-ink-900/60"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 select-none text-ink-500">#{p.index + 1}</span>
                <pre className="flex-1 whitespace-pre-wrap text-ink-200">{p.text}</pre>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIdx(active ? null : p.index);
                    setReason("");
                  }}
                  className="shrink-0 rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-300 hover:bg-rose-500/20 hover:text-rose-100"
                >
                  👎 重写
                </button>
              </div>
              {active && (
                <div className="mt-2 space-y-1 border-t border-accent-500/20 pt-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="说明为什么不喜欢（可空）：太啰嗦 / 角色 OOC / 节奏太快 / 比喻不贴切…"
                    className="w-full resize-none rounded border border-ink-700 bg-ink-900 p-1.5 text-[11px]"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={rewriteMut.isPending}
                      onClick={() => rewriteMut.mutate(p)}
                      className="rounded bg-accent-500/30 px-2 py-0.5 text-[11px] text-accent-100 hover:bg-accent-500/40 disabled:opacity-40"
                    >
                      {rewriteMut.isPending ? "重写中…" : "提交并重写"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveIdx(null)}
                      className="rounded border border-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-700"
                    >
                      取消
                    </button>
                  </div>
                  {rewriteMut.isError && (
                    <div className="text-[10px] text-rose-300">
                      {String(rewriteMut.error)}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
