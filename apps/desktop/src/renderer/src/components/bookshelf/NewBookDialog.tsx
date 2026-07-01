import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpen, LayoutTemplate } from "lucide-react";
import { projectApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  fadeOnly,
  staggerContainer,
  staggerItem,
} from "../../lib/motion-tokens";
import { AnimatedDialog } from "../AnimatedDialog";
import { MotionSpinner } from "../MotionSpinner";
import { Button, Select, TextField } from "../ui";

// C10: 内置项目模板定义
interface ProjectTemplate {
  id: string;
  name: string;
  genre: string;
  subGenre: string;
  tags: string;
  description: string;
}

const BUILTIN_TEMPLATES: ProjectTemplate[] = [
  {
    id: "xuanhuan",
    name: "玄幻修仙",
    genre: "玄幻",
    subGenre: "仙侠",
    tags: "修仙, 宗门, 奇遇, 天道",
    description: "修真世界、法则突破、渡劫飞升。适合大世界观长篇。",
  },
  {
    id: "urban",
    name: "都市言情",
    genre: "言情",
    subGenre: "都市",
    tags: "都市, 职场, 爱情, 成长",
    description: "现代都市恋爱、职场斗争、角色成长线。",
  },
  {
    id: "scifi",
    name: "科幻未来",
    genre: "科幻",
    subGenre: "未来世界",
    tags: "科幻, AI, 太空, 未来",
    description: "近未来/远未来科幻，科技伦理、人类命运。",
  },
  {
    id: "mystery",
    name: "悬疑推理",
    genre: "悬疑",
    subGenre: "推理",
    tags: "悬疑, 推理, 犯罪, 真相",
    description: "案件调查、线索编织、层层反转。",
  },
  {
    id: "history",
    name: "历史架空",
    genre: "历史",
    subGenre: "架空",
    tags: "历史, 架空, 权谋, 战争",
    description: "架空历史权谋战争，人物群像。",
  },
];

interface NewBookDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}

export function NewBookDialog({
  open,
  onClose,
  onCreated,
}: NewBookDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [dailyGoal, setDailyGoal] = useState(1000);
  // C10: 模板选择
  const [templateId, setTemplateId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() === true;

  const activeTemplate = useMemo(
    () => BUILTIN_TEMPLATES.find((t) => t.id === templateId) ?? null,
    [templateId],
  );

  const createMut = useMutation({
    mutationFn: () =>
      projectApi.create({
        name: name.trim(),
        dailyGoal,
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
      onCreated?.(project.id);
      setName("");
      setDailyGoal(1000);
      setTemplateId("");
      setError(null);
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err, "新建书籍失败，请检查书名后重试。")),
  });

  const canSubmit = name.trim().length > 0 && dailyGoal > 0 && !createMut.isPending;

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel="新建一本书"
      overlayClassName="flex items-center justify-center p-6"
      panelClassName="w-full max-w-md rounded-2xl border border-ink-600 bg-ink-800 p-5 text-ink-100 shadow-2xl"
    >
      <motion.div
        className="space-y-3"
        variants={reduceMotion ? fadeOnly : staggerContainer}
        initial="initial"
        animate="animate"
      >
        <motion.h3
          className="flex items-center gap-2 text-base font-semibold"
          variants={reduceMotion ? fadeOnly : staggerItem}
        >
          <BookOpen aria-hidden className="h-4 w-4 text-accent-300" />
          新建一本书
        </motion.h3>

        <motion.label className="block" htmlFor="new-book-name" variants={reduceMotion ? fadeOnly : staggerItem}>
          <span className="mb-1 block text-xs text-ink-400">书名</span>
          <TextField
            id="new-book-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="比如：龙渊"
            maxLength={80}
            className="bg-ink-900 px-3 py-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) createMut.mutate();
            }}
          />
        </motion.label>

        <motion.label className="block" htmlFor="new-book-daily-goal" variants={reduceMotion ? fadeOnly : staggerItem}>
          <span className="mb-1 block text-xs text-ink-400">每日字数目标</span>
          <TextField
            id="new-book-daily-goal"
            type="number"
            min={100}
            step={100}
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value) || 1000)}
            className="bg-ink-900 px-3 py-2"
          />
        </motion.label>

        {/* C10: 模板选择器 */}
        <motion.label className="block" htmlFor="new-book-template" variants={reduceMotion ? fadeOnly : staggerItem}>
          <span className="mb-1 flex items-center gap-1 text-xs text-ink-400">
            <LayoutTemplate className="h-3 w-3" />
            模板（可选）
          </span>
          <Select
            id="new-book-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full bg-ink-900 px-3 py-2"
          >
            <option value="">无模板 · 空白开始</option>
            {BUILTIN_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {activeTemplate ? (
            <p className="mt-1 text-[10px] leading-4 text-ink-500">
              {activeTemplate.description}
            </p>
          ) : null}
        </motion.label>

        <motion.div className="text-[11px] text-ink-500" variants={reduceMotion ? fadeOnly : staggerItem}>
          创建后会在工作目录下生成 <code className="text-ink-300">projects/{name.trim() || "<书名>"}</code>，
          含 <code className="text-ink-300">chapters/</code>、<code className="text-ink-300">characters/</code>、
          <code className="text-ink-300">world/</code> 等子目录。
        </motion.div>

        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200"
              role="alert"
              variants={reduceMotion ? fadeOnly : staggerItem}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div className="flex justify-end gap-2" variants={reduceMotion ? fadeOnly : staggerItem}>
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            size="sm"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={!canSubmit}
            variant="accentSoft"
            size="sm"
            className="min-w-16"
          >
            {createMut.isPending ? <MotionSpinner className="h-3.5 w-3.5" /> : null}
            {createMut.isPending ? "创建中…" : "创建"}
          </Button>
        </motion.div>
      </motion.div>
    </AnimatedDialog>
  );
}
