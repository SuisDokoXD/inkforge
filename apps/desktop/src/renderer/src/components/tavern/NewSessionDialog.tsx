import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Play, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { ProviderRecord, TavernMode } from "@inkforge/shared";
import { providerApi, tavernSessionApi } from "../../lib/api";

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated?: (sessionId: string) => void;
}

export function NewSessionDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: NewSessionDialogProps): JSX.Element | null {
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<TavernMode>("auto");
  const [budgetTokens, setBudgetTokens] = useState(20000);
  const [lastK, setLastK] = useState(6);
  const [summaryProviderId, setSummaryProviderId] = useState<string>("");
  const [summaryModel, setSummaryModel] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      alert(`创建失败：${err instanceof Error ? err.message : String(err)}`);
    },
  });

  if (!open) return null;

  const topicPresets = [
    "让几位角色讨论下一章最自然的转折。",
    "比较两个结局方向，判断哪个更有余味。",
    "检查主角这次选择是否符合一贯性格。",
  ];
  const canSubmit = topic.trim().length > 0 && !createMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-6 py-5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-500/15 text-accent-200 ring-1 ring-accent-400/30">
                <Sparkles size={15} />
              </span>
              <h2 className="text-lg font-semibold text-ink-100">开一场角色讨论</h2>
            </div>
            <p className="text-sm leading-6 text-ink-400">
              先写下想讨论的问题。创建后在舞台底部选择发言角色，再推进对话。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-6 scrollbar-thin">
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-ink-200">这次想让角色讨论什么？</label>
              <span className="text-[11px] text-ink-500">必填</span>
            </div>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：让角色讨论下一章的选择，找出更自然、更有张力的走向。"
              className="h-28 w-full resize-none rounded-md border border-ink-700 bg-ink-950 px-3 py-3 text-sm leading-6 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-400/60 focus:ring-2 focus:ring-accent-400/10"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {topicPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTopic(preset)}
                  className="rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-1.5 text-xs text-ink-300 transition hover:border-accent-500/40 hover:bg-accent-500/10 hover:text-accent-100"
                >
                  {preset}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 text-sm font-medium text-ink-200">讨论方式</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("auto")}
                className={`rounded-md border p-3 text-left transition ${
                  mode === "auto"
                    ? "border-accent-400/60 bg-accent-500/12 text-accent-100"
                    : "border-ink-700 bg-ink-950 text-ink-300 hover:bg-ink-800"
                }`}
              >
                <div className="text-sm font-medium">自动推进</div>
                <div className="mt-1 text-xs leading-5 text-ink-500">
                  角色按议题自然轮流发言，适合快速碰撞想法。
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("director")}
                className={`rounded-md border p-3 text-left transition ${
                  mode === "director"
                    ? "border-accent-400/60 bg-accent-500/12 text-accent-100"
                    : "border-ink-700 bg-ink-950 text-ink-300 hover:bg-ink-800"
                }`}
              >
                <div className="text-sm font-medium">导演引导</div>
                <div className="mt-1 text-xs leading-5 text-ink-500">
                  你可以随时补充指令，控制下一轮讨论方向。
                </div>
              </button>
            </div>
          </section>

          <section className="rounded-md border border-ink-700 bg-ink-950/70">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink-200">
                <SlidersHorizontal size={15} className="text-ink-400" />
                高级设置
              </span>
              <ChevronDown
                size={16}
                className={`text-ink-500 transition ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>

            {advancedOpen && (
              <div className="space-y-4 border-t border-ink-700 px-3 py-4">
                <div>
                  <label className="mb-1 block text-xs text-ink-300">会话标题</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={topic.slice(0, 12) || "默认取议题前 12 字"}
                    className="h-9 w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-400/60"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-ink-300">上下文预算</label>
                    <select
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
                    <label className="mb-1 block text-xs text-ink-300">保留最近消息</label>
                    <select
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
                  <label className="mb-1 block text-xs text-ink-300">历史压缩模型</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
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
                    <input
                      type="text"
                      value={summaryModel}
                      onChange={(e) => setSummaryModel(e.target.value)}
                      placeholder="模型名，可留空"
                      disabled={!summaryProviderId}
                      className="h-9 rounded-md border border-ink-700 bg-ink-900 px-2.5 text-sm text-ink-100 outline-none placeholder:text-ink-500 disabled:opacity-50"
                    />
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-ink-500">
                    不配置也可以正常讨论；只是之后不能一键压缩较早的历史消息。
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-700 bg-ink-950/60 px-6 py-4">
          <p className="text-xs text-ink-500">角色、轮数和导演指令可以在会话里随时调整。</p>
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={!canSubmit}
            className="flex h-9 items-center gap-2 rounded-md bg-accent-500 px-4 text-sm font-semibold text-ink-950 transition hover:bg-accent-400 disabled:opacity-40"
          >
            {createMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {createMut.isPending ? "创建中" : "进入舞台"}
          </button>
        </div>
      </div>
    </div>
  );
}
