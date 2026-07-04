import { countGraphemes, extractTodoMarkers, isSceneBreakLine } from "@inkforge/editor";
import { normalizeRhythmSnippet } from "./manual-writing-rhythm";

export const MANUAL_HEALTH_LONG_PARAGRAPH_GRAPHEMES = 600;
export const MANUAL_HEALTH_LONG_SCENE_GRAPHEMES = 2500;
export const MANUAL_HEALTH_SCENE_SUGGESTION_GRAPHEMES = 2500;

export type ManualChapterHealthIssueKind =
  | "todo"
  | "long-paragraph"
  | "long-scene"
  | "scene-suggestion";

export interface ManualChapterHealthIssue {
  id: string;
  kind: ManualChapterHealthIssueKind;
  title: string;
  detail: string;
  line: number;
  jumpText?: string;
}

export interface ManualChapterHealthParagraph {
  line: number;
  graphemes: number;
  preview: string;
  jumpText: string;
}

export interface ManualChapterHealthScene {
  index: number;
  line: number;
  graphemes: number;
  preview: string;
  jumpText: string;
}

export interface ManualChapterHealthReport {
  graphemes: number;
  paragraphs: number;
  headings: number;
  sceneBreaks: number;
  scenes: number;
  todos: number;
  averageParagraphGraphemes: number;
  maxParagraphGraphemes: number;
  longParagraphs: ManualChapterHealthParagraph[];
  longScenes: ManualChapterHealthScene[];
  issues: ManualChapterHealthIssue[];
}

const HEADING_PATTERN = /^\s{0,3}#{1,4}\s+\S/;

interface ParagraphDraft {
  line: number;
  text: string;
}

interface SceneDraft {
  index: number;
  line: number;
  lines: string[];
}

export function buildManualChapterHealthReport(
  chapterId: string,
  content: string,
): ManualChapterHealthReport {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const graphemes = countGraphemes(normalized);
  const todos = extractTodoMarkers(chapterId, normalized).length;
  let headings = 0;
  let sceneBreaks = 0;
  const paragraphs: ManualChapterHealthParagraph[] = [];
  const scenes: ManualChapterHealthScene[] = [];
  let paragraphDraft: ParagraphDraft | null = null;
  let sceneDraft: SceneDraft = { index: 1, line: 1, lines: [] };

  const flushParagraph = () => {
    if (!paragraphDraft) return;
    const text = paragraphDraft.text.trim();
    if (text) {
      const paragraphGraphemes = countGraphemes(text);
      paragraphs.push({
        line: paragraphDraft.line,
        graphemes: paragraphGraphemes,
        preview: normalizeRhythmSnippet(text, 96),
        jumpText: normalizeRhythmSnippet(text, 60),
      });
    }
    paragraphDraft = null;
  };

  const flushScene = () => {
    const text = sceneDraft.lines.join("\n").trim();
    if (text) {
      scenes.push({
        index: sceneDraft.index,
        line: sceneDraft.line,
        graphemes: countGraphemes(text),
        preview: normalizeRhythmSnippet(text, 96),
        jumpText: normalizeRhythmSnippet(text, 60),
      });
    }
  };

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const trimmed = line.trim();
    const isHeading = HEADING_PATTERN.test(line);
    const isSceneBreak = trimmed ? isSceneBreakLine(trimmed) : false;

    if (isHeading) headings += 1;
    if (isSceneBreak) {
      sceneBreaks += 1;
      flushParagraph();
      flushScene();
      sceneDraft = { index: sceneDraft.index + 1, line: lineNo + 1, lines: [] };
      return;
    }

    if (trimmed && !isHeading) {
      sceneDraft.lines.push(line);
    }

    if (!trimmed || isHeading) {
      flushParagraph();
      return;
    }

    if (!paragraphDraft) {
      paragraphDraft = { line: lineNo, text: line };
      return;
    }
    paragraphDraft.text = `${paragraphDraft.text}\n${line}`;
  });

  flushParagraph();
  flushScene();

  const longParagraphs = paragraphs
    .filter((paragraph) => paragraph.graphemes >= MANUAL_HEALTH_LONG_PARAGRAPH_GRAPHEMES)
    .sort((left, right) => right.graphemes - left.graphemes)
    .slice(0, 5);
  const longScenes = scenes
    .filter((scene) => scene.graphemes >= MANUAL_HEALTH_LONG_SCENE_GRAPHEMES)
    .sort((left, right) => right.graphemes - left.graphemes)
    .slice(0, 3);
  const totalParagraphGraphemes = paragraphs.reduce((sum, item) => sum + item.graphemes, 0);
  const maxParagraphGraphemes = paragraphs.reduce((max, item) => Math.max(max, item.graphemes), 0);
  const issues: ManualChapterHealthIssue[] = [];

  if (todos > 0) {
    issues.push({
      id: "todo",
      kind: "todo",
      title: "待补未清",
      detail: `还有 ${todos} 处待补。`,
      line: 1,
    });
  }
  for (const paragraph of longParagraphs) {
    issues.push({
      id: `paragraph:${paragraph.line}`,
      kind: "long-paragraph",
      title: "段落偏长",
      detail: `第 ${paragraph.line} 行起约 ${paragraph.graphemes} 字。`,
      line: paragraph.line,
      jumpText: paragraph.jumpText,
    });
  }
  for (const scene of longScenes) {
    issues.push({
      id: `scene:${scene.index}`,
      kind: "long-scene",
      title: "场景偏长",
      detail: `场景 ${scene.index} 约 ${scene.graphemes} 字。`,
      line: scene.line,
      jumpText: scene.jumpText,
    });
  }
  if (sceneBreaks === 0 && graphemes >= MANUAL_HEALTH_SCENE_SUGGESTION_GRAPHEMES) {
    issues.push({
      id: "scene-suggestion",
      kind: "scene-suggestion",
      title: "缺少场景分隔",
      detail: "本章较长但没有场景分隔。",
      line: 1,
    });
  }

  return {
    graphemes,
    paragraphs: paragraphs.length,
    headings,
    sceneBreaks,
    scenes: scenes.length,
    todos,
    averageParagraphGraphemes: paragraphs.length > 0
      ? Math.round(totalParagraphGraphemes / paragraphs.length)
      : 0,
    maxParagraphGraphemes,
    longParagraphs,
    longScenes,
    issues,
  };
}
