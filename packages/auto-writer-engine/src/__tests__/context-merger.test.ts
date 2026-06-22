import { describe, expect, it } from "vitest";
import type { AutoWriterCorrectionEntry } from "@inkforge/shared";
import {
  buildBookDiagnosisSystem,
  buildBookDiagnosisUser,
  buildChapterFactCheckSystem,
  buildChapterFactCheckUser,
  buildCriticUser,
  buildPlannerUser,
  buildReflectorUser,
  buildWriterSystem,
  buildWriterUser,
  buildWritingConflictSystem,
  buildWritingConflictUser,
} from "../context-merger";
import { extractPromptConstraints } from "../prompt-constraints";
import { extractPlotCommitments } from "../plot-commitments";

function correction(content: string): AutoWriterCorrectionEntry {
  return { at: "2026-06-13T00:00:00.000Z", content };
}

describe("context merger prompt builders", () => {
  it("includes shared book context in planner prompts", () => {
    const prompt = buildPlannerUser({
      chapterTitle: "Chapter One",
      maxSegments: 4,
      userIdeas: "open with rain",
      existingChapterText: "existing draft text",
      recentCorrections: [correction("keep the lantern blue")],
      globalWorldview: "global rule",
      previousChaptersText: "previous chapter summary",
      voiceBlock: "voice is low and spare",
      styleSamples: [{ source: "sample-a", excerpt: "short lyric excerpt" }],
      characters: [],
      worldEntries: [],
    });

    expect(prompt).toContain("Chapter One");
    expect(prompt).toContain("4");
    expect(prompt).toContain("open with rain");
    expect(prompt).toContain("existing draft text");
    expect(prompt).toContain("keep the lantern blue");
    expect(prompt).toContain("global rule");
    expect(prompt).toContain("previous chapter summary");
    expect(prompt).toContain("voice is low and spare");
    expect(prompt).toContain("sample-a");
    expect(prompt).toContain("short lyric excerpt");
  });

  it("compacts long shared context in writer prompts", () => {
    const globalWorldview = `global-prefix ${"g".repeat(950)} global-tail`;
    const previousChaptersText = `previous-prefix ${"p".repeat(1850)} previous-tail`;
    const firstExcerpt = `sample-one-prefix ${"a".repeat(350)} sample-one-tail`;

    const prompt = buildWriterUser({
      userIdeas: "must mention the blue key",
      beat: "write the discovery",
      segmentIndex: 1,
      targetLength: 800,
      chapterSoFar: "chapter start",
      lastCriticFindingsText: "tighten the scene",
      reflectorMemo: "avoid repeating the rain image",
      userInterrupts: [correction("make the door locked")],
      rewriteOf: "old segment",
      globalWorldview,
      previousChaptersText,
      voiceBlock: "voice block",
      styleSamples: [
        { source: "sample-1", excerpt: firstExcerpt },
        { source: "sample-2", excerpt: "sample two excerpt" },
        { source: "sample-3", excerpt: "sample three excerpt" },
      ],
      characters: [],
      worldEntries: [],
    });

    expect(prompt).toContain("must mention the blue key");
    expect(prompt).toContain("write the discovery");
    expect(prompt).toContain("chapter start");
    expect(prompt).toContain("tighten the scene");
    expect(prompt).toContain("avoid repeating the rain image");
    expect(prompt).toContain("make the door locked");
    expect(prompt).toContain("old segment");
    expect(prompt).not.toContain("global-prefix");
    expect(prompt).toContain("global-tail");
    expect(prompt).not.toContain("previous-prefix");
    expect(prompt).toContain("previous-tail");
    expect(prompt).toContain("sample-1");
    expect(prompt).toContain("sample-one-prefix");
    expect(prompt).not.toContain("sample-one-tail");
    expect(prompt).toContain("sample-2");
    expect(prompt).not.toContain("sample-3");
  });

  it("includes shared context and corrections in critic and reflector prompts", () => {
    const criticPrompt = buildCriticUser({
      segmentText: "draft segment",
      segmentIndex: 0,
      beat: "first beat",
      userIdeas: "initial idea",
      recentCorrections: [correction("fix the character age")],
      globalWorldview: "critic world",
      previousChaptersText: "critic previous",
      voiceBlock: "critic voice",
      styleSamples: [{ source: "critic-sample", excerpt: "critic sample text" }],
      characters: [],
      worldEntries: [],
    });

    expect(criticPrompt).toContain("draft segment");
    expect(criticPrompt).toContain("first beat");
    expect(criticPrompt).toContain("fix the character age");
    expect(criticPrompt).toContain("critic world");
    expect(criticPrompt).toContain("critic previous");
    expect(criticPrompt).toContain("critic voice");
    expect(criticPrompt).toContain("critic-sample");

    const reflectorPrompt = buildReflectorUser({
      segmentText: "accepted segment",
      segmentIndex: 1,
      criticFindingsText: "no major issue",
      recentCorrections: [correction("keep the clue")],
      globalWorldview: "reflector world",
      previousChaptersText: "reflector previous",
      voiceBlock: "reflector voice",
      styleSamples: [{ source: "reflector-sample", excerpt: "reflector sample text" }],
    });

    expect(reflectorPrompt).toContain("accepted segment");
    expect(reflectorPrompt).toContain("no major issue");
    expect(reflectorPrompt).toContain("keep the clue");
    expect(reflectorPrompt).toContain("reflector world");
    expect(reflectorPrompt).toContain("reflector previous");
    expect(reflectorPrompt).toContain("reflector voice");
    expect(reflectorPrompt).toContain("reflector-sample");
  });

  it("injects prompt constraints into planner, writer, critic, and reflector prompts", () => {
    const promptConstraints = extractPromptConstraints(
      "关键词：青灯、雪桥。不要出现旧王。文风保持冷静克制。不能让女主提前知道真相。",
    );
    const plotCommitments = extractPlotCommitments({
      userIdeas: "埋下「青灯」伏笔。不要提前揭示“旧王”。",
    });
    const longContext = `prefix ${"x".repeat(2500)} tail`;

    const plannerPrompt = buildPlannerUser({
      chapterTitle: "Chapter",
      maxSegments: 3,
      userIdeas: "write the scene",
      existingChapterText: "",
      recentCorrections: [],
      globalWorldview: longContext,
      characters: [],
      worldEntries: [],
      promptConstraints,
      plotCommitments,
    });

    const writerPrompt = buildWriterUser({
      userIdeas: "write the scene",
      beat: "the lantern appears: 青灯",
      segmentIndex: 0,
      targetLength: 500,
      chapterSoFar: "",
      lastCriticFindingsText: null,
      reflectorMemo: null,
      userInterrupts: [],
      rewriteOf: null,
      globalWorldview: longContext,
      characters: [],
      worldEntries: [],
      promptConstraints,
      plotCommitments,
    });

    const criticPrompt = buildCriticUser({
      segmentText: "draft segment",
      segmentIndex: 0,
      beat: "the lantern appears: 青灯",
      userIdeas: "write the scene",
      recentCorrections: [],
      globalWorldview: longContext,
      characters: [],
      worldEntries: [],
      promptConstraints,
      plotCommitments,
    });

    const reflectorPrompt = buildReflectorUser({
      segmentText: "accepted segment",
      segmentIndex: 0,
      criticFindingsText: "no major issue",
      recentCorrections: [],
      globalWorldview: longContext,
      promptConstraints,
      plotCommitments,
    });

    for (const prompt of [plannerPrompt, writerPrompt, criticPrompt, reflectorPrompt]) {
      expect(prompt).toContain("写作约束");
      expect(prompt).toContain("青灯");
      expect(prompt).toContain("雪桥");
      expect(prompt).toContain("旧王");
      expect(prompt).toContain("冷静克制");
      expect(prompt).toContain("女主提前知道真相");
      expect(prompt).toContain("剧情承诺");
      expect(prompt).toContain("埋下「青灯」伏笔");
      expect(prompt).toContain("不要提前揭示“旧王”");
    }
    expect(writerPrompt).toContain("本段必须直接落到正文的词条：「青灯」");
    expect(writerPrompt).toContain("全局禁止词条：「旧王」");
    expect(writerPrompt).not.toContain("本段必须直接落到正文的词条：「雪桥」");
    expect(writerPrompt).not.toContain("prefix");
    expect(writerPrompt).toContain("tail");
    expect(writerPrompt).toContain("青灯");
  });

  it("injects the writer target length into the system prompt", () => {
    const prompt = buildWriterSystem(123);

    expect(prompt).toContain("123");
    expect(prompt).not.toContain("{{TARGET_LENGTH}}");
  });

  it("builds chapter fact check prompts with full chapter and hard constraints", () => {
    const promptConstraints = extractPromptConstraints(
      "关键词：青灯。不要出现旧王。不能让女主提前知道真相。",
    );
    const system = buildChapterFactCheckSystem();
    const prompt = buildChapterFactCheckUser({
      chapterTitle: "Chapter",
      userIdeas: "write the scene",
      chapterText: "青灯在桌上亮起。",
      recentCorrections: [correction("保持结尾悬念")],
      globalWorldview: "world rule",
      previousChaptersText: "previous summary",
      voiceBlock: "quiet voice",
      styleSamples: [{ source: "sample-a", excerpt: "sample text" }],
      characters: [],
      worldEntries: [],
      promptConstraints,
      plotCommitments: extractPlotCommitments({
        userIdeas: "埋下「青灯」伏笔。不要提前揭示“旧王”。",
      }),
    });

    expect(system).toContain("章节事实核查员");
    expect(system).toContain('"result":"PASS|FAIL"');
    expect(system).toContain("客观矛盾");
    expect(prompt).toContain("Chapter");
    expect(prompt).toContain("write the scene");
    expect(prompt).toContain("青灯在桌上亮起");
    expect(prompt).toContain("保持结尾悬念");
    expect(prompt).toContain("青灯");
    expect(prompt).toContain("旧王");
    expect(prompt).toContain("女主提前知道真相");
    expect(prompt).toContain("剧情承诺/伏笔清单");
    expect(prompt).toContain("埋下「青灯」伏笔");
    expect(prompt).toContain("不要提前揭示“旧王”");
    expect(prompt).toContain("world rule");
    expect(prompt).toContain("previous summary");
    expect(prompt).toContain("quiet voice");
    expect(prompt).toContain("sample-a");
    expect(prompt).toContain("只核查客观事实");
  });

  it("builds writing conflict prompts from chapter findings and constraints", () => {
    const promptConstraints = extractPromptConstraints(
      "关键词：青灯。不要出现旧王。不能让女主提前知道真相。",
    );
    const system = buildWritingConflictSystem();
    const prompt = buildWritingConflictUser({
      chapterTitle: "Chapter",
      userIdeas: "write the scene",
      chapterText: "旧王出现在门外。",
      chapterFindings: [
        {
          severity: "error",
          category: "constraint",
          excerpt: "旧王",
          suggestion: "正文出现禁止词。",
        },
      ],
      recentCorrections: [correction("保留青灯意象")],
      globalWorldview: "world rule",
      previousChaptersText: "previous summary",
      characters: [],
      worldEntries: [],
      promptConstraints,
      plotCommitments: extractPlotCommitments({
        userIdeas: "埋下「青灯」伏笔。不要提前揭示“旧王”。",
      }),
    });

    expect(system).toContain("写作冲突分析员");
    expect(system).toContain("rootCause");
    expect(system).toContain("edit-outline|adjust-constraints|retry|keep-draft");
    expect(prompt).toContain("Chapter");
    expect(prompt).toContain("write the scene");
    expect(prompt).toContain("旧王出现在门外");
    expect(prompt).toContain("正文出现禁止词");
    expect(prompt).toContain("保留青灯意象");
    expect(prompt).toContain("青灯");
    expect(prompt).toContain("女主提前知道真相");
    expect(prompt).toContain("剧情承诺/伏笔清单");
    expect(prompt).toContain("埋下「青灯」伏笔");
    expect(prompt).toContain("world rule");
    expect(prompt).toContain("previous summary");
    expect(prompt).toContain("只输出根因");
  });

  it("builds book diagnosis prompts with chapters, constraints, and commitments", () => {
    const promptConstraints = extractPromptConstraints(
      "关键词：青灯。不要出现旧王。不能让女主提前知道真相。",
    );
    const plotCommitments = extractPlotCommitments({
      userIdeas: "埋下「青灯」伏笔。回收《雪桥》线索。",
    });

    const system = buildBookDiagnosisSystem();
    const prompt = buildBookDiagnosisUser({
      bookTitle: "Book",
      userGoal: "检查全书结构",
      globalWorldview: "global world",
      previousChaptersText: "book level context",
      chapters: [
        {
          title: "开端",
          summary: "青灯出现。",
          excerpt: "旧王被误提。",
        },
      ],
      characters: [],
      worldEntries: [],
      promptConstraints,
      plotCommitments,
    });

    expect(system).toContain("全书诊断员");
    expect(system).toContain("revisionTasks");
    expect(system).toContain("P0|P1|P2");
    expect(prompt).toContain("Book");
    expect(prompt).toContain("检查全书结构");
    expect(prompt).toContain("全书约束清单");
    expect(prompt).toContain("青灯");
    expect(prompt).toContain("旧王");
    expect(prompt).toContain("全书剧情承诺/伏笔清单");
    expect(prompt).toContain("回收《雪桥》线索");
    expect(prompt).toContain("global world");
    expect(prompt).toContain("book level context");
    expect(prompt).toContain("第 1 章：开端");
    expect(prompt).toContain("青灯出现");
    expect(prompt).toContain("旧王被误提");
    expect(prompt).toContain("只输出结构化诊断和修改工单");
  });
});
