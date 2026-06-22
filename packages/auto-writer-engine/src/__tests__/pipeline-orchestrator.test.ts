import { describe, expect, it } from "vitest";
import type { PipelineDeps, PipelineRunInput } from "../types";
import { normalizeNovelParagraphs, runAutoWriterPipeline } from "../pipeline-orchestrator";

function makeInput(overrides: Partial<PipelineRunInput> = {}): PipelineRunInput {
  return {
    runId: "run-1",
    projectId: "project-1",
    chapterId: "chapter-1",
    userIdeas: "First beat\nSecond beat\nThird beat",
    agents: [{ role: "writer", providerId: "provider-1", model: "model-1" }],
    targetSegmentLength: 400,
    maxSegments: 2,
    maxRewritesPerSegment: 1,
    enableOocGate: false,
    speedMode: "fast",
    existingChapterText: "",
    chapterTitle: "Chapter",
    characters: [],
    worldEntries: [],
    ...overrides,
  };
}

describe("normalizeNovelParagraphs", () => {
  it("indents prose, preserves structural markdown, and removes duplicate headings", () => {
    const output = normalizeNovelParagraphs([
      "## Scene",
      "## Scene",
      "A line with extra spaces before punctuation !",
      "",
      "- keep list items structural",
      "",
      "Already separate.",
    ].join("\n"));

    expect(output).toContain("## Scene");
    expect(output.match(/## Scene/g)).toHaveLength(1);
    expect(output).toContain("- keep list items structural");
    expect(output).toContain("\u3000\u3000A line");
    expect(output).toContain("\u3000\u3000Already separate.");
  });
});

describe("runAutoWriterPipeline", () => {
  it("falls back to local beats without exceeding maxSegments when planner JSON is invalid", async () => {
    const appliedChapterTexts: string[] = [];
    const phases: string[] = [];
    let plannerCalls = 0;
    let writerCalls = 0;

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          plannerCalls += 1;
          return { text: "not json", tokensIn: 1, tokensOut: 1 };
        }
        writerCalls += 1;
        return { text: `Segment ${writerCalls}.`, tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async ({ chapterText }) => {
        appliedChapterTexts.push(chapterText);
      },
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: (event) => {
        phases.push(event.phase);
      },
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(makeInput(), deps);

    expect(plannerCalls).toBe(2);
    expect(writerCalls).toBe(2);
    expect(stats.totalSegments).toBe(2);
    expect(appliedChapterTexts).toHaveLength(2);
    expect(appliedChapterTexts.at(-1)).toContain("Segment 2.");
    expect(phases.at(-1)).toBe("done");
  });

  it("removes a redundant opening chapter heading from generated segments", async () => {
    const appliedChapterTexts: string[] = [];
    let writerCalls = 0;

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "continue the scene" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        writerCalls += 1;
        return { text: "## Chapter\n\nSegment body.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async ({ chapterText }) => {
        appliedChapterTexts.push(chapterText);
      },
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        existingChapterText: "## Chapter\n\nExisting.",
        maxSegments: 1,
      }),
      deps,
    );

    expect(writerCalls).toBe(1);
    expect(stats.totalSegments).toBe(1);
    expect(appliedChapterTexts.at(-1)?.match(/## Chapter/g)).toHaveLength(1);
    expect(appliedChapterTexts.at(-1)).toContain("Segment body.");
  });

  it("adds planner-missed required terms back into beats before writing", async () => {
    let writerPrompt = "";

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "open the scene quietly" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        writerPrompt = input.userPrompt;
        return { text: "青灯 glows on the table.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async () => {},
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯",
        maxSegments: 1,
      }),
      deps,
    );

    expect(stats.totalSegments).toBe(1);
    expect(writerPrompt).toContain("本段必须直接落到正文的词条：「青灯」");
    expect(writerPrompt).toContain("【本段必须直接写入关键词：青灯】");
    expect(stats.report?.constraints.requiredTerms).toEqual([
      { term: "青灯", matched: true, segmentIndexes: [0] },
    ]);
    expect(stats.report?.segments[0]?.requiredTerms).toEqual(["青灯"]);
  });

  it("uses local required-term findings to trigger a rewrite in quality mode", async () => {
    const appliedChapterTexts: string[] = [];
    let writerCalls = 0;

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "open the scene" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        if (input.role === "critic") {
          return { text: "[]", tokensIn: 1, tokensOut: 1 };
        }
        if (input.role === "reflector") {
          return { text: "keep the accepted image", tokensIn: 1, tokensOut: 1 };
        }
        writerCalls += 1;
        return {
          text: writerCalls === 1 ? "The room was quiet." : "青灯 stood beside the window.",
          tokensIn: 2,
          tokensOut: 3,
        };
      },
      createSnapshot: async () => null,
      applyChapterContent: async ({ chapterText }) => {
        appliedChapterTexts.push(chapterText);
      },
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯",
        maxSegments: 1,
        speedMode: "quality",
        enableOocGate: true,
        maxRewritesPerSegment: 1,
      }),
      deps,
    );

    expect(writerCalls).toBe(2);
    expect(stats.totalRewrites).toBe(1);
    expect(appliedChapterTexts.at(-1)).toContain("青灯");
    expect(stats.report?.segments[0]).toMatchObject({
      index: 0,
      rewriteCount: 1,
      acceptedFindingCount: 0,
      requiredTerms: ["青灯"],
    });
    expect(stats.report?.constraints.requiredTerms).toEqual([
      { term: "青灯", matched: true, segmentIndexes: [0] },
    ]);
  });

  it("uses local forbidden-term findings to trigger a rewrite in quality mode", async () => {
    const appliedChapterTexts: string[] = [];
    let writerCalls = 0;

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "open the scene" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        if (input.role === "critic") {
          return { text: "[]", tokensIn: 1, tokensOut: 1 };
        }
        if (input.role === "reflector") {
          return { text: "avoid the banned name", tokensIn: 1, tokensOut: 1 };
        }
        writerCalls += 1;
        return {
          text: writerCalls === 1 ? "旧王 crossed the hall." : "A stranger crossed the hall.",
          tokensIn: 2,
          tokensOut: 3,
        };
      },
      createSnapshot: async () => null,
      applyChapterContent: async ({ chapterText }) => {
        appliedChapterTexts.push(chapterText);
      },
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "不要出现旧王",
        maxSegments: 1,
        speedMode: "quality",
        enableOocGate: true,
        maxRewritesPerSegment: 1,
      }),
      deps,
    );

    expect(writerCalls).toBe(2);
    expect(stats.totalRewrites).toBe(1);
    expect(appliedChapterTexts.at(-1)).not.toContain("旧王");
    expect(stats.report?.constraints.forbiddenTerms).toEqual([
      { term: "旧王", matched: false, segmentIndexes: [] },
    ]);
  });

  it("injects constraints in fast mode without critic, reflector, or local rewrites", async () => {
    let writerPrompt = "";
    const calledRoles: string[] = [];

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        calledRoles.push(input.role);
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "open the scene" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        writerPrompt = input.userPrompt;
        return { text: "The room was quiet.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async () => {},
      runOocGate: async () => {
        throw new Error("fast mode should skip local gates");
      },
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯。不要出现旧王。",
        maxSegments: 1,
        speedMode: "fast",
        enableOocGate: true,
        maxRewritesPerSegment: 1,
      }),
      deps,
    );

    expect(calledRoles).toEqual(["planner", "writer"]);
    expect(stats.totalRewrites).toBe(0);
    expect(writerPrompt).toContain("青灯");
    expect(writerPrompt).toContain("旧王");
    expect(stats.report?.constraints.requiredTerms).toEqual([
      { term: "青灯", matched: false, segmentIndexes: [] },
    ]);
    expect(stats.report?.constraints.forbiddenTerms).toEqual([
      { term: "旧王", matched: false, segmentIndexes: [] },
    ]);
    expect(stats.report?.chapterQuality?.status).toBe("not-run");
    expect(stats.report?.writingConflict?.status).toBe("not-run");
    expect(stats.report?.segments[0]?.rewriteCount).toBe(0);
  });

  it("records reference trace context in the run report", async () => {
    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "write the scene with 青灯" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        return { text: "青灯 lit the desk.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async () => {},
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯。不要出现旧王。",
        existingChapterText: "Existing text.",
        globalWorldview: "Global rules.",
        previousChaptersText: "Previously...",
        styleSamples: [{ source: "sample-a", excerpt: "A style." }],
        characters: [
          {
            id: "char-1",
            projectId: "project-1",
            name: "林澈",
            persona: null,
            traits: {},
            backstory: "",
            relations: [],
            linkedTavernCardId: null,
            createdAt: "",
            updatedAt: "",
          },
        ],
        worldEntries: [
          {
            id: "world-1",
            projectId: "project-1",
            title: "王城",
            category: "place",
            content: "",
            aliases: [],
            tags: [],
            keys: [],
            position: "before",
            probability: 100,
            secondaryKeys: [],
            selectiveLogic: "and_any",
            caseSensitive: false,
            constant: false,
            extensions: {},
            createdAt: "",
            updatedAt: "",
          },
        ],
        maxSegments: 1,
      }),
      deps,
    );

    expect(stats.report?.segments[0]?.referenceTrace?.usedContext).toMatchObject({
      hasExistingChapterText: true,
      hasGlobalWorldview: true,
      hasPreviousChaptersText: true,
      styleSampleSources: ["sample-a"],
      characterNames: ["林澈"],
      worldEntryTitles: ["王城"],
      requiredTerms: ["青灯"],
      forbiddenTerms: ["旧王"],
    });
  });

  it("records plot commitments from user ideas and initial corrections", async () => {
    let plannerPrompt = "";
    let drainCount = 0;

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          plannerPrompt = input.userPrompt;
          return {
            text: JSON.stringify([{ index: 1, beat: "write the scene with 青灯" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        return { text: "青灯 lit the room.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async () => {},
      runOocGate: async () => [],
      drainInterrupts: () => {
        drainCount += 1;
        return drainCount === 1
          ? [{ at: "2026-06-22T00:00:00.000Z", content: "不要提前揭示“旧王”。" }]
          : [];
      },
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯。埋下「青灯」伏笔。",
        maxSegments: 1,
      }),
      deps,
    );

    expect(plannerPrompt).toContain("剧情承诺/伏笔清单");
    expect(plannerPrompt).toContain("埋下「青灯」伏笔");
    expect(plannerPrompt).toContain("不要提前揭示“旧王”");
    expect(stats.report?.plotCommitments).toEqual([
      {
        kind: "foreshadow",
        text: "埋下「青灯」伏笔",
        exactTerms: ["青灯"],
        source: "userIdeas",
      },
      {
        kind: "avoid-reveal",
        text: "不要提前揭示“旧王”",
        exactTerms: ["旧王"],
        source: "correction",
      },
    ]);
  });

  it("runs chapter fact check in quality mode and stores findings without changing chapter text", async () => {
    const appliedChapterTexts: string[] = [];
    const silentCalls: boolean[] = [];
    let chapterFactCheckCalls = 0;

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "write the scene with 青灯" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        if (input.systemPrompt.includes("章节事实核查员")) {
          chapterFactCheckCalls += 1;
          silentCalls.push(input.silent === true);
          return {
            text: JSON.stringify({
              result: "FAIL",
              issues: [
                {
                  severity: "error",
                  category: "constraint",
                  excerpt: "旧王",
                  suggestion: "删除禁止词。",
                },
              ],
            }),
            tokensIn: 4,
            tokensOut: 5,
          };
        }
        if (input.systemPrompt.includes("写作冲突分析员")) {
          silentCalls.push(input.silent === true);
          return {
            text: JSON.stringify({
              reconcilable: true,
              summary: "生成稿没有执行禁止词约束。",
              rootCause: "constraint-history",
              extraConstraints: "下一次必须避开旧王。",
              suggestedActions: [
                {
                  id: "retry",
                  label: "重新生成",
                  description: "带着补充约束重新生成。",
                },
              ],
            }),
            tokensIn: 4,
            tokensOut: 5,
          };
        }
        if (input.role === "critic") {
          return { text: "[]", tokensIn: 1, tokensOut: 1 };
        }
        if (input.role === "reflector") {
          return { text: "continue carefully", tokensIn: 1, tokensOut: 1 };
        }
        return { text: "青灯 stood on the desk.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async ({ chapterText }) => {
        appliedChapterTexts.push(chapterText);
      },
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯。不要出现旧王。",
        maxSegments: 1,
        speedMode: "quality",
        enableOocGate: true,
      }),
      deps,
    );

    expect(chapterFactCheckCalls).toBe(1);
    expect(silentCalls).toEqual([true, true]);
    expect(appliedChapterTexts.at(-1)).toContain("青灯 stood on the desk.");
    expect(appliedChapterTexts.at(-1)).not.toContain("删除禁止词");
    expect(stats.report?.chapterQuality).toEqual({
      status: "fail",
      findings: [
        {
          severity: "error",
          category: "constraint",
          excerpt: "旧王",
          suggestion: "删除禁止词。",
        },
      ],
    });
    expect(stats.report?.writingConflict).toEqual({
      status: "completed",
      analysis: {
        reconcilable: true,
        summary: "生成稿没有执行禁止词约束。",
        rootCause: "constraint-history",
        extraConstraints: "下一次必须避开旧王。",
        suggestedActions: [
          {
            id: "retry",
            label: "重新生成",
            description: "带着补充约束重新生成。",
          },
        ],
      },
    });
  });

  it("passes runtime corrections into chapter fact check", async () => {
    let drainCount = 0;
    let factCheckPrompt = "";

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "write the scene with 青灯" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        if (input.systemPrompt.includes("章节事实核查员")) {
          factCheckPrompt = input.userPrompt;
          return {
            text: JSON.stringify({ result: "PASS", issues: [] }),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        if (input.role === "critic") {
          return { text: "[]", tokensIn: 1, tokensOut: 1 };
        }
        if (input.role === "reflector") {
          return { text: "keep the correction", tokensIn: 1, tokensOut: 1 };
        }
        return { text: "青灯 stayed lit.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async () => {},
      runOocGate: async () => [],
      drainInterrupts: () => {
        drainCount += 1;
        return drainCount === 3
          ? [
              {
                at: "2026-06-22T00:00:00.000Z",
                content: "中途补充：女主此刻很犹豫。",
              },
            ]
          : [];
      },
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯",
        maxSegments: 1,
        speedMode: "quality",
        enableOocGate: true,
      }),
      deps,
    );

    expect(stats.report?.chapterQuality?.status).toBe("pass");
    expect(factCheckPrompt).toContain("中途补充：女主此刻很犹豫。");
  });

  it("keeps accepted chapter text when chapter fact check fails to run", async () => {
    const appliedChapterTexts: string[] = [];

    const deps: PipelineDeps = {
      invokeAgent: async (input) => {
        if (input.role === "planner") {
          return {
            text: JSON.stringify([{ index: 1, beat: "write the scene with 青灯" }]),
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        if (input.systemPrompt.includes("章节事实核查员")) {
          throw new Error("fact check provider unavailable");
        }
        if (input.role === "critic") {
          return { text: "[]", tokensIn: 1, tokensOut: 1 };
        }
        if (input.role === "reflector") {
          return { text: "continue carefully", tokensIn: 1, tokensOut: 1 };
        }
        return { text: "青灯 stayed lit.", tokensIn: 2, tokensOut: 3 };
      },
      createSnapshot: async () => null,
      applyChapterContent: async ({ chapterText }) => {
        appliedChapterTexts.push(chapterText);
      },
      runOocGate: async () => [],
      drainInterrupts: () => [],
      emitPhase: () => {},
      isCancelled: () => false,
      isPaused: () => false,
    };

    const stats = await runAutoWriterPipeline(
      makeInput({
        userIdeas: "关键词：青灯",
        maxSegments: 1,
        speedMode: "quality",
        enableOocGate: true,
      }),
      deps,
    );

    expect(appliedChapterTexts.at(-1)).toContain("青灯 stayed lit.");
    expect(stats.report?.chapterQuality?.status).toBe("warn");
    expect(stats.report?.chapterQuality?.findings[0]?.suggestion).toContain(
      "章节级检查未完成",
    );
  });
});
