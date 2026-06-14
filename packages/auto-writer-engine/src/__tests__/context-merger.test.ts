import { describe, expect, it } from "vitest";
import type { AutoWriterCorrectionEntry } from "@inkforge/shared";
import {
  buildCriticUser,
  buildPlannerUser,
  buildReflectorUser,
  buildWriterSystem,
  buildWriterUser,
} from "../context-merger";

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

  it("injects the writer target length into the system prompt", () => {
    const prompt = buildWriterSystem(123);

    expect(prompt).toContain("123");
    expect(prompt).not.toContain("{{TARGET_LENGTH}}");
  });
});
