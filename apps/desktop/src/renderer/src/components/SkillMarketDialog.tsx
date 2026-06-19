import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Download, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import type { MarketSkillMetaDTO } from "@inkforge/shared";
import { AnimatedDialog } from "./AnimatedDialog";
import { friendlyErrorMessage } from "../lib/friendly-error";
import { fadeOnly, fadeSlideUp, hoverLift, tapPress } from "../lib/motion-tokens";
import { Button, IconButton } from "./ui";

interface SkillMarketDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SkillMarketDialog({ open, onClose }: SkillMarketDialogProps): JSX.Element {
  const qc = useQueryClient();
  const reduceMotion = useReducedMotion() === true;
  const stateMotion = reduceMotion ? fadeOnly : fadeSlideUp;
  const buttonMotion = reduceMotion
    ? {}
    : {
        whileHover: hoverLift,
        whileTap: tapPress,
      };
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MarketSkillMetaDTO | null>(null);

  const registryQuery = useQuery({
    queryKey: ["market-registry"],
    queryFn: () => window.inkforge.market.fetchRegistry({}),
    enabled: open,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const installMutation = useMutation({
    mutationFn: (skill: MarketSkillMetaDTO) =>
      window.inkforge.market.installSkill({ url: skill.url, scope: skill.scope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  const skills = registryQuery.data?.skills ?? [];
  const filtered = query
    ? skills.filter(
        (s) =>
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase()) ||
          s.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())),
      )
    : skills;

  return (
    <AnimatedDialog
      open={open}
      onClose={onClose}
      ariaLabel="技能市场"
      overlayClassName="flex items-center justify-center p-6"
      zClassName="z-40"
      panelClassName="flex h-[80vh] w-full max-w-4xl flex-col rounded-lg border border-ink-600 bg-ink-800 text-ink-100 shadow-2xl"
    >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-semibold">技能市场</h2>
          <IconButton
            size="sm"
            variant="ghost"
            className="text-ink-300 hover:bg-ink-700 hover:text-ink-100"
            aria-label="关闭技能市场"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* Left: list */}
          <div className="flex w-1/2 flex-col border-r border-ink-700">
            <div className="px-4 pb-2 pt-3">
              <label className="sr-only" htmlFor="skill-market-search">
                搜索技能
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
                <input
                  id="skill-market-search"
                  type="search"
                  placeholder="搜索技能…"
                  className="w-full rounded border border-ink-600 bg-ink-900 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-ink-400"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              <AnimatePresence initial={false} mode="wait">
                {registryQuery.isLoading ? (
                  <motion.div
                    key="loading"
                    className="p-4 text-sm text-ink-400"
                    role="status"
                    variants={stateMotion}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    加载中…
                  </motion.div>
                ) : registryQuery.isError ? (
                  <motion.div
                    key="error"
                    className="p-4 text-sm text-red-400"
                    role="alert"
                    variants={stateMotion}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    无法读取技能市场：{friendlyErrorMessage(registryQuery.error, "技能市场暂时不可用，请稍后重试。")}
                    <motion.button
                      className="ml-2 inline-flex items-center gap-1 underline"
                      type="button"
                      onClick={() => void registryQuery.refetch()}
                      {...buttonMotion}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      重试
                    </motion.button>
                  </motion.div>
                ) : filtered.length === 0 ? (
                  <motion.div
                    key="empty"
                    className="p-4 text-sm text-ink-400"
                    variants={stateMotion}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    暂无匹配的技能
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    className="space-y-1"
                    variants={fadeOnly}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {filtered.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-ink-700 ${
                          selected?.id === s.id ? "bg-ink-700" : ""
                        }`}
                        onClick={() => {
                          setSelected(s);
                          installMutation.reset();
                        }}
                      >
                        <div className="font-medium">{s.title}</div>
                        <div className="line-clamp-1 text-xs text-ink-400">{s.description}</div>
                        <div className="mt-1 flex gap-1 text-[10px] text-ink-500">
                          <span>v{s.version}</span>
                          <span>·</span>
                          <span>{s.author}</span>
                          {s.tags.map((t) => (
                            <span key={t} className="rounded bg-ink-700 px-1">{t}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {/* Right: detail */}
          <div className="flex w-1/2 flex-col p-4 text-sm">
            {!selected && (
              <div className="text-ink-400">选择一个技能查看详情</div>
            )}
            {selected && (
              <div className="flex h-full flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">{selected.title}</h3>
                  <div className="text-xs text-ink-400">
                    v{selected.version} · {selected.author}
                    {selected.license && ` · ${selected.license}`}
                  </div>
                </div>
                <p className="text-sm text-ink-200">{selected.description}</p>
                <div className="flex gap-1 text-xs">
                  {selected.tags.map((t) => (
                    <span key={t} className="rounded bg-ink-700 px-2 py-0.5 text-ink-300">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={installMutation.isPending}
                    onClick={() => installMutation.mutate(selected)}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {installMutation.isPending
                      ? "安装中…"
                      : installMutation.isSuccess && installMutation.variables?.id === selected.id
                        ? "已安装"
                        : "安装"}
                  </Button>
                  {selected.homepage && (
                    <a
                      href={selected.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-ink-600 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      主页
                    </a>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {installMutation.isError ? (
                    <motion.div
                      className="text-xs text-red-400"
                      role="alert"
                      variants={stateMotion}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      安装失败：{friendlyErrorMessage(installMutation.error, "安装失败，请稍后重试。")}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
    </AnimatedDialog>
  );
}
