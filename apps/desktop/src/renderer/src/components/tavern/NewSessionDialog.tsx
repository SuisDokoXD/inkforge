import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Play, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { ProviderRecord, TavernMode } from "@inkforge/shared";
import { AnimatedDialog } from "../AnimatedDialog";
import { MotionSpinner } from "../MotionSpinner";
import { providerApi, tavernSessionApi } from "../../lib/api";
import { friendlyErrorMessage } from "../../lib/friendly-error";
import {
  fadeOnly,
  fadeSlideUp,
  hoverLift,
  staggerContainer,
  staggerItem,
  tapPress,
} from "../../lib/motion-tokens";

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated?: (sessionId: string) => void;
}

const PLAY_PRESETS: Array<{
  title: string;
  description: string;
  topic: string;
  mode: TavernMode;
}> = [
  {
    title: "冲突圆桌",
    description: "让角色站在不同立场上争论一个选择。",
    topic: "围绕下一章的关键选择开一场冲突圆桌：每位角色必须提出不同立场、代价和反驳理由，最后给出最有戏剧张力的走向。",
    mode: "auto",
  },
  {
    title: "关系审问",
    description: "追问动机、隐瞒点和关系里的矛盾。",
    topic: "围绕人物关系做一次审问：让相关角色互相追问真实动机、隐瞒的信息和彼此误解的地方，找出下一章能爆发的关系矛盾。",
    mode: "director",
  },
  {
    title: "剧情急诊",
    description: "让角色指出当前桥段哪里不自然。",
    topic: "把当前剧情当成急诊：请角色指出最不自然、最缺动机或最容易让读者出戏的地方，并给出可以马上改的一步行动。",
    mode: "director",
  },
  {
    title: "秘密投票",
    description: "每个角色给路线投票并说明私心。",
    topic: "进行一次秘密投票：每位角色选择赞成或反对当前剧情路线，并说出公开理由和真正私心，最后总结最值得保留的矛盾。",
    mode: "auto",
  },
];

export function NewSessionDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: NewSessionDialogProps): JSX.Element | null {
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<TavernMode>("auto");
  const [budgetTokens, setBudgetTokens] = useState(20000);
  const [lastK, setLastK] = useState(6);
  const [summaryProviderId, setSummaryProviderId] = useState<string>("");
  const [summaryModel, setSummaryModel] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const providersQuery = useQuery<ProviderRecord[]>({
    queryKey: ["providers"],
    queryFn: () => providerApi.list(),
    enabled: open && advancedOpen,
  });

  const effectiveTitle = useMemo(() => {
    if (title.trim()) return title.trim();
    return topic.trim().slice(0, 12) || "新会话";
  }, [title, topic]);

  const createMut = useMutation({
    mutationFn: () =>
      tavernSessionApi.create({
        projectId,
        title: effectiveTitle,
        topic: topic.trim(),
        mode,
        budgetTokens,
        lastK,
        summaryProviderId: summaryProviderId || undefined,
        summaryModel: summaryProviderId && summaryModel ? summaryModel : undefined,
      }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["tavernSessions", projectId] });
      onCreated?.(session.id);
      setCreateError(null);
      setTopic("");
      setTitle("");
      setMode("auto");
      setBudgetTokens(20000);
      setLastK(6);
      setSummaryProviderId("");
      setSummaryModel("");
      setAdvancedOpen(false);
    },
    onError: (err) => {
      setCreateError(friendlyErrorMessage(err, "角色讨论创建失败，请稍后重试。"));
    },
  });

  useEffect(() => {
    if (!open) setCreateError(null);
  }, [open]);

  const canSubmit = topic.trim().length > 0 && !createMut.isPending;

  return (
    <AnimatedDialog
      open={open}
      onClose={() => onOpenChange(false)}
      labelledBy="new-tavern-session-title"
      panelClassName="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl"
    >
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-6 py-5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-500/15 text-accent-200 ring-1 ring-accent-400/30">
                <Sparkles size={15} />
              </span>
              <h2 id="new-tavern-session-title" className="text-lg font-semibold text-ink-100">
                开一场角色讨论
              </h2>
            </div>
            <p className="text-sm leading-6 text-ink-400">
              先写下想讨论的问题。创建后在舞台底部选择发言角色，再推进对话。
            </p>
          </div>
          <motion.button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
            aria-label="关闭"
            whileHover={reduceMotion ? undefined : hoverLift}
            whileTap={reduceMotion ? undefined : tapPress}
          >
            <X size={16} />
          </motion.button>
        </div>

        <motion.div
          className="flex-1 space-y-5 overflow-auto p-6 scrollbar-thin"
          variants={reduceMotion ? fadeOnly : staggerContainer}
          initial="initial"
          animate="animate"
        >
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-ink-200" htmlFor="new-tavern-topic">
                这次想让角色讨论什么？
              </label>
              <span className="text-[11px] text-ink-500">必填</span>
            </div>
            <textarea
              id="new-tavern-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：让角色讨论下一章的选择，找出更自然、更有张力的走向。"
              className="h-28 w-full resize-none rounded-md border border-ink-700 bg-ink-950 px-3 py-3 text-sm leading-6 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-400/60 focus:ring-2 focus:ring-accent-400/10"
            />
            <div className="mt-3">
              <div className="mb-2 text-xs font-medium text-ink-400">玩法模板</div>
              <motion.div
                className="grid gap-2 sm:grid-cols-2"
                variants={reduceMotion ? fadeOnly : staggerContainer}
                initial="initial"
                animate="animate"
              >
                {PLAY_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.title}
                    type="button"
                    onClick={() => {
                      setTopic(preset.topic);
                      setTitle(preset.title);
                      setMode(preset.mode);
                    }}
                    className="rounded-md border border-ink-700 bg-ink-800/60 p-3 text-left transition hover:border-accent-500/40 hover:bg-accent-500/10"
                    variants={reduceMotion ? fadeOnly : staggerItem}
                    whileHover={reduceMotion ? undefined : hoverLift}
                    whileTap={reduceMotion ? undefined : tapPress}
                  >
                    <span className="block text-sm font-medium text-ink-100">
                      {preset.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-ink-400">
                      {preset.description}
                    </span>
                  </motion.button>
                ))}
              </motion.div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "让几位角色讨论下一章最自然的转折。",
                "比较两个结局方向，判断哪个更有余味。",
                "检查主角这次选择是否符合一贯性格。",
              ].map((preset) => (
                <motion.button
                  key={preset}
                  type="button"
                  onClick={() => setTopic(preset)}
                  className="rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-1.5 text-xs text-ink-300 transition hover:border-accent-500/40 hover:bg-accent-500/10 hover:text-accent-100"
                  whileHover={reduceMotion ? undefined : hoverLift}
                  whileTap={reduceMotion ? undefined : tapPress}
                >
                  {preset}
                </motion.button>
              ))}
            </div>
          </section>

          <motion.section variants={reduceMotion ? fadeOnly : staggerItem}>
            <div className="mb-2 text-sm font-medium text-ink-200">讨论方式</div>
            <div className="grid grid-cols-2 gap-2">
              <motion.button
                type="button"
                onClick={() => setMode("auto")}
                className={`rounded-md border p-3 text-left transition ${
                  mode === "auto"
                    ? "border-accent-400/60 bg-accent-500/12 text-accent-100"
                    : "border-ink-700 bg-ink-950 text-ink-300 hover:bg-ink-800"
                }`}
                aria-pressed={mode === "auto"}
                whileHover={reduceMotion ? undefined : hoverLift}
                whileTap={reduceMotion ? undefined : tapPress}
              >
                <div className="text-sm font-medium">自动推进</div>
                <div className="mt-1 text-xs leading-5 text-ink-500">
                  角色按议题自然轮流发言，适合快速碰撞想法。
                </div>
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setMode("director")}
                className={`rounded-md border p-3 text-left transition ${
                  mode === "director"
                    ? "border-accent-400/60 bg-accent-500/12 text-accent-100"
                    : "border-ink-700 bg-ink-950 text-ink-300 hover:bg-ink-800"
                }`}
                aria-pressed={mode === "director"}
                whileHover={reduceMotion ? undefined : hoverLift}
                whileTap={reduceMotion ? undefined : tapPress}
              >
                <div className="text-sm font-medium">导演引导</div>
                <div className="mt-1 text-xs leading-5 text-ink-500">
                  你可以随时补充指令，控制下一轮讨论方向。
                </div>
              </motion.button>
            </div>
          </motion.section>

          <motion.section
            className="rounded-md border border-ink-700 bg-ink-950/70"
            variants={reduceMotion ? fadeOnly : staggerItem}
          >
            <motion.button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              aria-expanded={advancedOpen}
              aria-controls="new-tavern-advanced"
              whileHover={reduceMotion ? undefined : hoverLift}
              whileTap={reduceMotion ? undefined : tapPress}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink-200">
                <SlidersHorizontal size={15} className="text-ink-400" />
                高级设置
              </span>
              <ChevronDown
                size={16}
                className={`text-ink-500 transition ${advancedOpen ? "rotate-180" : ""}`}
              />
            </motion.button>

            <AnimatePresence initial={false}>
              {advancedOpen && (
              <motion.div
                id="new-tavern-advanced"
                className="space-y-4 border-t border-ink-700 px-3 py-4"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div>
                  <label className="mb-1 block text-xs text-ink-300" htmlFor="new-tavern-title">
                    会话标题
                  </label>
                  <input
                    id="new-tavern-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={topic.slice(0, 12) || "默认取议题前 12 字"}
                    className="h-9 w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-400/60"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-ink-300" htmlFor="new-tavern-budget">
                      讨论记忆范围
                    </label>
                    <select
                      id="new-tavern-budget"
                      value={budgetTokens}
                      onChange={(e) => setBudgetTokens(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 text-sm text-ink-100 outline-none focus:border-accent-400/60"
                    >
                      <option value={12000}>轻量讨论</option>
                      <option value={20000}>标准讨论</option>
                      <option value={40000}>长讨论</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-ink-300" htmlFor="new-tavern-last-k">
                      重点保留
                    </label>
                    <select
                      id="new-tavern-last-k"
                      value={lastK}
                      onChange={(e) => setLastK(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 text-sm text-ink-100 outline-none focus:border-accent-400/60"
                    >
                      <option value={4}>简短上下文</option>
                      <option value={6}>标准上下文</option>
                      <option value={10}>更多上下文</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-ink-300" htmlFor="new-tavern-summary-service">
                    长讨论整理服务
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      id="new-tavern-summary-service"
                      value={summaryProviderId}
                      onChange={(e) => setSummaryProviderId(e.target.value)}
                      className="h-9 rounded-md border border-ink-700 bg-ink-900 px-2.5 text-sm text-ink-100 outline-none focus:border-accent-400/60"
                    >
                      <option value="">暂不配置</option>
                      {(providersQuery.data || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor="new-tavern-summary-model">
                      长讨论整理模型名称
                    </label>
                    <input
                      id="new-tavern-summary-model"
                      type="text"
                      value={summaryModel}
                      onChange={(e) => setSummaryModel(e.target.value)}
                      placeholder="模型名称，可留空"
                      disabled={!summaryProviderId}
                      className="h-9 rounded-md border border-ink-700 bg-ink-900 px-2.5 text-sm text-ink-100 outline-none placeholder:text-ink-500 disabled:opacity-50"
                    />
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-ink-500">
                    不配置也可以正常讨论；只是之后不能一键压缩较早的历史消息。
                  </p>
                </div>
              </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
          <AnimatePresence initial={false}>
            {createError && (
              <motion.div
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                role="alert"
                variants={stateMotion}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {createError}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-700 bg-ink-950/60 px-6 py-4">
          <p className="text-xs text-ink-500">角色、轮数和导演指令可以在会话里随时调整。</p>
          <motion.button
            type="button"
            onClick={() => {
              setCreateError(null);
              createMut.mutate();
            }}
            disabled={!canSubmit}
            className="flex h-9 items-center gap-2 rounded-md bg-accent-500 px-4 text-sm font-semibold text-ink-950 transition hover:bg-accent-400 disabled:opacity-40"
            whileHover={reduceMotion || !canSubmit ? undefined : hoverLift}
            whileTap={reduceMotion || !canSubmit ? undefined : tapPress}
          >
            {createMut.isPending ? <MotionSpinner className="h-4 w-4" /> : <Play size={15} />}
            {createMut.isPending ? "创建中" : "进入舞台"}
          </motion.button>
        </div>
    </AnimatedDialog>
  );
}
