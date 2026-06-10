import type { AutoWriterAgentRole, AutoWriterCorrectionEntry } from "@inkforge/shared";
import {
  buildCriticSystem,
  buildCriticUser,
  buildPlannerSystem,
  buildPlannerUser,
  buildReflectorSystem,
  buildReflectorUser,
  buildWriterSystem,
  buildWriterUser,
} from "./context-merger";
import {
  findingsToMarkdown,
  parseFindings,
  shouldRewriteFromFindings,
  summarizeFindings,
} from "./ooc-gate";
import {
  makeRoleResolver,
  type AgentCallOutput,
  type AutoWriterStats,
  type PipelineDeps,
  type PipelineRunInput,
  type SegmentState,
} from "./types";

interface PlannerBeat {
  index: number;
  beat: string;
}

function tryParseBeats(raw: string): PlannerBeat[] {
  if (!raw || !raw.trim()) return [];
  let text = raw.trim();
  const codeBlock = text.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
  if (codeBlock) text = codeBlock[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const result: PlannerBeat[] = [];
  parsed.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const obj = item as Record<string, unknown>;
    const beatText = String(obj.beat ?? obj.text ?? obj.summary ?? "").trim();
    if (!beatText) return;
    result.push({
      index: typeof obj.index === "number" ? obj.index : idx + 1,
      beat: beatText,
    });
  });
  return result;
}

/**
 * v22+: Planner 完全失效时的兜底策略。
 *
 * 不再让 "Planner 抽风 → 整章 throw"。我们用 userIdeas 自身做一次很笨的均匀
 * 切块当 beat sheet：
 *   - 把 userIdeas 按句号 / 换行切成原子句
 *   - 如果原子句多于 maxSegments，每 N 句合一段；少于则补空段（让 writer 自由发挥）
 *   - 至少返回 3 段，保证一章不会太短
 *
 * 这是 last-resort，质量肯定不如 LLM Planner，但远胜于整章作废。
 */
function buildFallbackBeats(userIdeas: string, maxSegments: number): PlannerBeat[] {
  const ideas = (userIdeas ?? "").trim();
  const segCount = Math.max(3, Math.min(maxSegments, 8));
  if (!ideas) {
    // 实在没思路：生成空段，让 writer 完全靠角色 / 世界观 / 上下文发挥
    return Array.from({ length: segCount }, (_, i) => ({
      index: i + 1,
      beat: `第 ${i + 1} 段：自由推进剧情，承上启下。`,
    }));
  }
  const sentences = ideas
    .split(/(?<=[。！？!?])|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) {
    return [{ index: 1, beat: ideas }];
  }
  const beats: PlannerBeat[] = [];
  const chunkSize = Math.max(1, Math.ceil(sentences.length / segCount));
  for (let i = 0; i < sentences.length; i += chunkSize) {
    beats.push({
      index: beats.length + 1,
      beat: sentences.slice(i, i + chunkSize).join(" "),
    });
  }
  // 不够 segCount → 补"自由段落"占位，给 writer 自由发挥
  while (beats.length < segCount) {
    beats.push({
      index: beats.length + 1,
      beat: `第 ${beats.length + 1} 段：自然推进，与前段衔接。`,
    });
  }
  return beats.slice(0, segCount);
}

/**
 * v20: 把 LLM 输出的「砖头文字」规整成有空行分段的小说体。
 * - 折叠 3+ 连续换行 → 2 个
 * - 去除中文标点前后多余空格
 * - 已经分段良好的输入幂等
 * - 对话行（"...」 / "..." / "..." 开头）前后保证空行
 * - v22+: 每个非空段落首行自动缩进两个全角空格（中文小说排版规范）
 *   * 已经以 \u3000\u3000 开头的段落保持原状（幂等）
 *   * 标题行（# 开头）/ 分隔线 / Markdown 列表项不加缩进
 *   * 对话行（「」/『』/" "）也加缩进，符合大陆出版社默认排版
 */
const FULLWIDTH_INDENT = "\u3000\u3000";

function isStructuralLine(line: string): boolean {
  // 标题、分隔线、列表项等结构化内容不应该被加缩进
  if (/^\s*#{1,6}\s/.test(line)) return true; // ATX 标题
  if (/^\s*[-*_]{3,}\s*$/.test(line)) return true; // 分隔线 ---  ***
  if (/^\s*[-*+]\s/.test(line)) return true; // 无序列表
  if (/^\s*\d+[.、)]\s/.test(line)) return true; // 有序列表 / 中文编号
  if (/^\s*>/.test(line)) return true; // 引用块
  if (/^\s*```/.test(line)) return true; // 代码块栅栏
  return false;
}

function indentParagraph(line: string): string {
  if (!line) return line;
  // 已经以全角空格开头则视为已缩进，幂等返回
  if (line.startsWith(FULLWIDTH_INDENT)) return line;
  // 单个全角空格也视为已经手动缩进，补到两个
  if (line.startsWith("\u3000")) return "\u3000" + line;
  // 结构化行（标题、列表、分隔线）不加缩进
  if (isStructuralLine(line)) return line;
  // 仅当行的首字符是中文 / 中文标点 / 引号 / 字母数字（句首）时才加缩进
  // 避免给空行 / 已包含其他特殊前缀的行加无意义的缩进
  if (!/^[\u4e00-\u9fffA-Za-z0-9「『（《〈“"'‘《【—─]/.test(line)) {
    return line;
  }
  return FULLWIDTH_INDENT + line;
}

function headingTitle(line: string): string | null {
  const match = line.match(/^\s{0,3}#{2,4}\s+(.+?)\s*#*\s*$/);
  return match?.[1]?.trim() || null;
}

function removeConsecutiveDuplicateHeadings(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let lastHeadingTitle: string | null = null;
  let lastHeadingIndex = -1;

  for (const line of lines) {
    const title = headingTitle(line);
    if (title && lastHeadingTitle === title) {
      const between = kept.slice(lastHeadingIndex + 1);
      const hasBodyBetween = between.some((item) => item.trim() && !headingTitle(item));
      if (!hasBodyBetween) continue;
    }

    kept.push(line);
    if (title) {
      lastHeadingTitle = title;
      lastHeadingIndex = kept.length - 1;
    }
  }

  return kept.join("\n");
}

export function normalizeNovelParagraphs(text: string): string {
  if (!text) return "";
  let out = text.replace(/\r\n/g, "\n");
  // 中文标点前后空格收敛
  out = out.replace(/[ \t]+([，。！？、；：「」『』""''])/g, "$1");
  out = out.replace(/([，。！？、；：「」『』""''])[ \t]+/g, "$1");
  // 三个以上换行 → 两个
  out = out.replace(/\n{3,}/g, "\n\n");
  out = removeConsecutiveDuplicateHeadings(out);
  // 在对话行前补空行
  out = out.replace(
    /([^\n])\n([ \t]*[「『""].*?[」』""])/g,
    "$1\n\n$2",
  );
  // 段首多余的半角空格 / 制表符剔除（保留全角空格，因为后面要靠它判断是否已缩进）
  out = out
    .split("\n")
    .map((line) => {
      // 把行首多余的 ASCII 空白吃掉，但保留全角空格 \u3000
      return line.replace(/^[ \t]+(?=\S)/, "");
    })
    .join("\n");
  // 给每个非空段落首行缩进两个全角空格
  out = out
    .split("\n")
    .map((line) => (line.trim() ? indentParagraph(line) : line))
    .join("\n");
  return out.trim();
}

/** 段落之间的拼接：插一个空行；并对最终拼接结果做 normalize。 */
function joinChapter(prev: string, segmentText: string): string {
  const cleanedSegment = normalizeNovelParagraphs(segmentText);
  if (!prev.trim()) return cleanedSegment + "\n";
  return normalizeNovelParagraphs(prev.trimEnd() + "\n\n" + cleanedSegment) + "\n";
}

/**
 * v22+: 把 findings 折算成"质量分"——给 best-of-N 用。分越高越好。
 *  - 每条 error: -10
 *  - 每条 warn:  -2
 *  - 每条 info:  -0.2（几乎不影响）
 *  - 如果 findings 自带 score（critic 提示模型给 0-10 分），加权 0.5×。
 *  - 全空（critic 一字未出 / 直接通过）→ +5 baseline 鼓励"什么都没说"。
 */
function scoreFindings(findings: { severity: string; score?: number }[]): number {
  if (findings.length === 0) return 5;
  let s = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const f of findings) {
    if (f.severity === "error") s -= 10;
    else if (f.severity === "warn") s -= 2;
    else s -= 0.2;
    if (typeof f.score === "number" && Number.isFinite(f.score)) {
      scoreSum += f.score;
      scoreCount += 1;
    }
  }
  if (scoreCount > 0) s += (scoreSum / scoreCount) * 0.5;
  return s;
}

/**
 * AutoWriter 核心 orchestrator。
 *
 * Phase 序列（针对每个 beat）：
 *   pre-ai snapshot → writer → post-ai snapshot
 *     → critic → (rewrite | reflector) → next-segment
 *
 * 共享上下文 = userIdeas + chapterSoFar + characters + worldEntries
 *           + lastCriticFindings + reflectorMemo + drained user interrupts
 */
export async function runAutoWriterPipeline(
  input: PipelineRunInput,
  deps: PipelineDeps,
): Promise<AutoWriterStats> {
  const stats: AutoWriterStats = {
    totalSegments: 0,
    totalRewrites: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    startedAt: new Date().toISOString(),
  };
  const resolveRole = makeRoleResolver(input.agents);

  // ---------- Phase: planner ----------
  deps.emitPhase({ phase: "planner", segmentIndex: 0 });
  if (deps.isCancelled()) return finish(stats);

  const initialInterrupts = deps.drainInterrupts();
  const plannerOut = await callAgent(
    deps,
    resolveRole,
    "planner",
    buildPlannerSystem(),
    buildPlannerUser({
      userIdeas: input.userIdeas,
      chapterTitle: input.chapterTitle,
      existingChapterText: input.existingChapterText,
      characters: input.characters,
      worldEntries: input.worldEntries,
      maxSegments: input.maxSegments,
      recentCorrections: initialInterrupts,
      voiceBlock: input.voiceBlock,
      globalWorldview: input.globalWorldview,
      previousChaptersText: input.previousChaptersText,
      styleSamples: input.styleSamples,
      detailLevel: input.speedMode === "fast" ? "compact" : undefined,
    }),
    stats,
  );
  if (deps.isCancelled()) return finish(stats);

  let beats = tryParseBeats(plannerOut.text).slice(0, input.maxSegments);

  // v22+: Planner 解析失败时再调一次（高温度，更碎的 JSON 也无所谓）。
  // 仍失败 → 退到本地兜底切块，永不整章 throw。
  if (beats.length === 0) {
    deps.emitPhase({ phase: "planner", segmentIndex: 0 });
    const retryOut = await callAgent(
      deps,
      resolveRole,
      "planner",
      buildPlannerSystem(),
      buildPlannerUser({
        userIdeas: input.userIdeas,
        chapterTitle: input.chapterTitle,
        existingChapterText: input.existingChapterText,
        characters: input.characters,
        worldEntries: input.worldEntries,
        maxSegments: input.maxSegments,
        recentCorrections: initialInterrupts,
        voiceBlock: input.voiceBlock,
        globalWorldview: input.globalWorldview,
        previousChaptersText: input.previousChaptersText,
        styleSamples: input.styleSamples,
        detailLevel: input.speedMode === "fast" ? "compact" : undefined,
      }),
      stats,
    );
    beats = tryParseBeats(retryOut.text).slice(0, input.maxSegments);
  }
  if (beats.length === 0) {
    // 再不行就用兜底，并继续；上层根据 stats.totalSegments 仍可判断 partial。
    beats = buildFallbackBeats(input.userIdeas, input.maxSegments);
  }

  // ---------- Loop over beats ----------
  let chapterSoFar = input.existingChapterText;
  let reflectorMemo: string | null = null;
  // 跨段携带：用于喂下一段的 critic findings
  let lastCriticFindingsText: string | null = null;
  // 累计未消费的 user interrupts（每段开始前会 drain 全部）
  let pendingCorrections: AutoWriterCorrectionEntry[] = [];

  for (let i = 0; i < beats.length; i += 1) {
    if (deps.isCancelled()) break;
    await waitWhilePaused(deps);

    const beat = beats[i];
    const seg: SegmentState = {
      index: i,
      beat: beat.beat,
      text: "",
      rewriteCount: 0,
      lastCriticFindingsText,
      status: "pending",
    };

    // ---------- pre-ai snapshot（章节内容尚未变化）----------
    await deps.createSnapshot({
      kind: "pre-ai",
      segmentIndex: i,
      agentRole: "writer",
      chapterText: chapterSoFar,
    });

    pendingCorrections = [...pendingCorrections, ...deps.drainInterrupts()];

    let segmentText = "";
    /**
     * v22+: best-of-N rewrite。
     * 之前是"严格通过/失败"——耗尽 rewriteCount 后保留最后一版，可能反复在
     * A→B→A 错误间振荡。现在每轮 critic 之后无论通过与否都把 (text, findings,
     * score) 推进 candidates，最终：
     *   - 一旦某轮 critic 直接通过 → 立即采纳并 break
     *   - 全部失败 / 耗尽 rewrite → 在 candidates 里选 score 最高的版本采纳
     */
    interface SegmentCandidate {
      text: string;
      findings: ReturnType<typeof parseFindings>;
      score: number;
      tentativeChapter: string;
    }
    const candidates: SegmentCandidate[] = [];

    // ---------- Writer (with up to N rewrites) ----------
    while (true) {
      if (deps.isCancelled()) break;
      await waitWhilePaused(deps);

      seg.status = "writing";
      deps.emitPhase({ phase: "writer", segmentIndex: i, rewriteCount: seg.rewriteCount });
      const writerOut = await callAgent(
        deps,
        resolveRole,
        "writer",
        buildWriterSystem(input.targetSegmentLength),
        buildWriterUser({
          beat: beat.beat,
          segmentIndex: i,
          targetLength: input.targetSegmentLength,
          characters: input.characters,
          worldEntries: input.worldEntries,
          chapterSoFar,
          lastCriticFindingsText: seg.lastCriticFindingsText,
          reflectorMemo,
          userInterrupts: pendingCorrections,
          rewriteOf: seg.rewriteCount > 0 ? segmentText : null,
          voiceBlock: input.voiceBlock,
          globalWorldview: input.globalWorldview,
          previousChaptersText: input.previousChaptersText,
          styleSamples: input.styleSamples,
        }),
        stats,
      );
      if (deps.isCancelled()) break;
      // 一旦 writer 看过用户介入消息，消费掉
      pendingCorrections = [];

      segmentText = writerOut.text.trim();
      if (!segmentText) {
        // 空输出视作失败，跳过
        break;
      }

      // 临时 apply：把本段附加到章节，便于 UI 实时看到
      const tentativeChapter = joinChapter(chapterSoFar, segmentText);
      await deps.applyChapterContent({
        chapterText: tentativeChapter,
        segmentIndex: i,
      });

      // post-ai snapshot
      await deps.createSnapshot({
        kind: "post-ai",
        segmentIndex: i,
        agentRole: "writer",
        chapterText: tentativeChapter,
      });

      // ---------- Critic / OOC gate ----------
      if (input.speedMode === "fast" || !input.enableOocGate) {
        chapterSoFar = tentativeChapter;
        seg.text = segmentText;
        seg.status = "completed";
        break;
      }

      seg.status = "criticking";
      deps.emitPhase({ phase: "critic", segmentIndex: i });

      // v22+: critic（LLM 调用）和 OOC gate（同步启发式 / 也可能 LLM）并行，
      // 节约一次来回。之前串行：每段写完要等 critic 跑完再跑 OOC gate。
      const [criticOut, extraFindings] = await Promise.all([
        callAgent(
          deps,
          resolveRole,
          "critic",
          buildCriticSystem(),
          buildCriticUser({
            segmentText,
            segmentIndex: i,
            beat: beat.beat,
            userIdeas: input.userIdeas,
            characters: input.characters,
            worldEntries: input.worldEntries,
            recentCorrections: deps.drainInterrupts(),
            voiceBlock: input.voiceBlock,
            globalWorldview: input.globalWorldview,
            previousChaptersText: input.previousChaptersText,
            styleSamples: input.styleSamples,
          }),
          stats,
        ),
        deps
          .runOocGate({
            chapterTitle: input.chapterTitle,
            segmentText,
            characters: input.characters,
            worldEntries: input.worldEntries,
          })
          .catch(() => [] as ReturnType<typeof parseFindings>),
      ]);

      const llmFindings = parseFindings(criticOut.text);
      const findings = [...llmFindings, ...extraFindings];
      const summary = summarizeFindings(findings);
      deps.emitPhase({
        phase: "critic",
        segmentIndex: i,
        criticSummary: summary,
      });

      // 把这一版押进 candidates 池
      candidates.push({
        text: segmentText,
        findings,
        score: scoreFindings(findings),
        tentativeChapter,
      });

      const needsRewrite = shouldRewriteFromFindings(findings, { minScore: 6 });

      if (needsRewrite && seg.rewriteCount < input.maxRewritesPerSegment) {
        // ---------- Rewrite path ----------
        seg.rewriteCount += 1;
        stats.totalRewrites += 1;
        deps.emitPhase({
          phase: "rewrite-segment",
          segmentIndex: i,
          rewriteCount: seg.rewriteCount,
        });
        await deps.createSnapshot({
          kind: "pre-rewrite",
          segmentIndex: i,
          agentRole: "writer",
          chapterText: tentativeChapter,
        });
        // 回滚章节到本段开始前
        await deps.applyChapterContent({
          chapterText: chapterSoFar,
          segmentIndex: i,
        });
        seg.lastCriticFindingsText = findingsToMarkdown(findings);
        // 继续下一轮 while(true)
        continue;
      }

      // 决定接受版本：
      //   - critic 直接通过 → 接受当前最新版（已是 candidates 末尾）
      //   - 耗尽 rewrite 但仍未通过 → 在所有 candidates 里选 score 最高
      const accepted = needsRewrite
        ? candidates.reduce((best, cur) => (cur.score > best.score ? cur : best))
        : candidates[candidates.length - 1];

      // 如果 best-of-N 选出来的不是最新版，得把章节回滚到 best 那一版
      if (accepted.tentativeChapter !== tentativeChapter) {
        await deps.applyChapterContent({
          chapterText: accepted.tentativeChapter,
          segmentIndex: i,
        });
      }

      chapterSoFar = accepted.tentativeChapter;
      seg.text = accepted.text;
      seg.lastCriticFindingsText = findingsToMarkdown(accepted.findings);
      seg.status = "completed";
      break;
    }

    if (deps.isCancelled()) break;

    // ---------- Reflector ----------
    if (input.speedMode !== "fast") {
      seg.status = "reflecting";
      deps.emitPhase({ phase: "reflector", segmentIndex: i });
      const reflectorOut = await callAgent(
        deps,
        resolveRole,
        "reflector",
        buildReflectorSystem(),
        buildReflectorUser({
          segmentText: seg.text,
          segmentIndex: i,
          criticFindingsText: seg.lastCriticFindingsText ?? "",
          recentCorrections: deps.drainInterrupts(),
          voiceBlock: input.voiceBlock,
          globalWorldview: input.globalWorldview,
          previousChaptersText: input.previousChaptersText,
          styleSamples: input.styleSamples,
        }),
        stats,
      );
      reflectorMemo = reflectorOut.text.trim() || null;
    } else {
      reflectorMemo = null;
    }
    lastCriticFindingsText = seg.lastCriticFindingsText;

    stats.totalSegments += 1;
    deps.emitPhase({ phase: "next-segment", segmentIndex: i });
  }

  deps.emitPhase({ phase: "done", segmentIndex: stats.totalSegments });
  return finish(stats);
}

async function callAgent(
  deps: PipelineDeps,
  resolve: ReturnType<typeof makeRoleResolver>,
  role: AutoWriterAgentRole,
  systemPrompt: string,
  userPrompt: string,
  stats: AutoWriterStats,
): Promise<AgentCallOutput> {
  const binding = resolve(role);
  const out = await deps.invokeAgent(
    {
      role,
      binding,
      systemPrompt,
      userPrompt,
    },
    () => {
      // delta 转发由 deps 内部处理；orchestrator 不需要在这里聚合
    },
  );
  stats.totalTokensIn += out.tokensIn;
  stats.totalTokensOut += out.tokensOut;
  return out;
}

function finish(stats: AutoWriterStats): AutoWriterStats {
  return { ...stats, finishedAt: new Date().toISOString() };
}

async function waitWhilePaused(deps: PipelineDeps): Promise<void> {
  while (deps.isPaused() && !deps.isCancelled()) {
    await new Promise((r) => setTimeout(r, 200));
  }
}
