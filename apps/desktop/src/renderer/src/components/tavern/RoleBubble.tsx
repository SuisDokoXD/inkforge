import { useState } from "react";
import type { TavernMessageRecord } from "@inkforge/shared";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore } from "../../stores/app-store";
import { chapterApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly } from "../../lib/motion-tokens";
import { MotionPulse } from "../MotionSpinner";
import { useTimedStatus } from "../../lib/use-timed-status";

interface RoleBubbleProps {
  message: TavernMessageRecord;
  cardName?: string;
  isStreaming?: boolean;
}

type ExtractStatus = {
  kind: "success" | "error";
  message: string;
};

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export function RoleBubble({
  message,
  cardName,
  isStreaming = false,
}: RoleBubbleProps): JSX.Element {
  const currentChapterId = useAppStore((s) => s.currentChapterId);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [extracting, setExtracting] = useState(false);
  const { status: extractStatus, showStatus: showExtractStatus } =
    useTimedStatus<ExtractStatus>();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const handleExtract = async () => {
    setMenuOpen(false);
    showExtractStatus(null);
    if (!currentChapterId) {
      showExtractStatus({
        kind: "error",
        message: "请先打开一个章节，再把摘录写入正文。",
      });
      return;
    }
    setExtracting(true);
    try {
      const existing = await chapterApi.read({ id: currentChapterId });
      const title = cardName || message.role;
      const blockquote = `\n\n> （摘录自酒馆・${title}）${message.content}\n`;
      await chapterApi.update({
        id: currentChapterId,
        content: existing.content + blockquote,
      });
      showExtractStatus({ kind: "success", message: "已追加到当前章节末尾。" }, 2200);
    } catch (err) {
      showExtractStatus({
        kind: "error",
        message: `摘录失败：${friendlyErrorMessage(err, "摘录写入失败，请稍后重试。")}`,
      });
    } finally {
      setExtracting(false);
    }
  };

  const isDirector = message.role === "director";
  const isSummary = message.role === "summary";
  const isCharacter = message.role === "character";

  if (isSummary) {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full rounded border border-ink-700 bg-ink-800/60 px-3 py-2 text-center text-xs text-ink-400 hover:bg-ink-800/80 transition"
        >
          📜 历史摘要 {expanded ? "（点击收起）" : "（点击展开）"}
        </button>
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              className="mt-1 rounded border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-ink-300 whitespace-pre-wrap"
              variants={fadeOnly}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {message.content}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  const avatarColor = isCharacter && message.characterId ? hashColor(message.characterId) : "#3b82f6";
  const avatarLetter = (cardName || (isDirector ? "导" : "?")).charAt(0);

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={`flex gap-2 ${isDirector ? "justify-end" : "justify-start"}`}
      >
        {!isDirector && (
          <div
            className="shrink-0 w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: avatarColor }}
          >
            {avatarLetter}
          </div>
        )}
        <div className={`max-w-[75%] ${isDirector ? "text-right" : "text-left"}`}>
          <div className="flex items-center gap-2 text-[11px] text-ink-400 mb-0.5">
            {!isDirector && (
              <>
                <span className="font-medium text-ink-200">{cardName || "?"}</span>
              </>
            )}
            {isDirector && <span className="font-medium text-blue-300">导演</span>}
            {(message.tokensIn > 0 || message.tokensOut > 0) && (
              <span>
                生成消耗 {message.tokensIn} 输入量 / {message.tokensOut} 输出量
              </span>
            )}
          </div>
          <div
            className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              isDirector
                ? "border border-blue-500/50 bg-blue-500/10 text-blue-100"
                : "border border-ink-700 bg-ink-800/60 text-ink-100"
            }`}
            style={
              isCharacter
                ? { borderColor: `${avatarColor}66`, backgroundColor: `${avatarColor}15` }
                : undefined
            }
          >
            {message.content}
            {isStreaming && <MotionPulse className="ml-0.5 inline-flex text-accent-300">▋</MotionPulse>}
          </div>
        </div>
        {isDirector && (
          <div className="shrink-0 w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
            {avatarLetter}
          </div>
        )}
      </div>
      <AnimatePresence initial={false}>
        {extractStatus ? (
          <motion.div
            key="extract-status"
            role={extractStatus.kind === "error" ? "alert" : "status"}
            aria-live="polite"
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`mt-1 text-xs ${isDirector ? "pr-10 text-right" : "pl-10 text-left"}`}
          >
            <span
              className={`inline-flex rounded-md border px-2 py-1 ${
                extractStatus.kind === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
              }`}
            >
              {extractStatus.message}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {menuOpen ? (
          <button
            type="button"
            aria-label="关闭摘录菜单"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setMenuOpen(false)}
          />
      ) : null}
      <AnimatePresence initial={false}>
        {menuOpen ? (
          <motion.div
            className="fixed z-50 rounded-md border border-ink-700 bg-ink-800 py-1 shadow-xl"
            style={{ left: menuPos.x, top: menuPos.y }}
            variants={fadeOnly}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting}
              className="block w-full px-3 py-1.5 text-left text-xs text-ink-200 hover:bg-ink-700 disabled:opacity-50"
            >
              {extracting ? "摘录中" : "摘录到正文"}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
