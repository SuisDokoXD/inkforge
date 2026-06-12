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
});
