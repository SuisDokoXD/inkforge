import { describe, expect, it } from "vitest";
import { selectStableChapterList } from "../stable-chapter-list";

interface TestChapter {
  id: string;
}

describe("stable chapter list", () => {
  const previous: TestChapter[] = [{ id: "chapter-1" }];
  const next: TestChapter[] = [{ id: "chapter-2" }];

  it("uses current chapters when a non-empty list is available", () => {
    expect(selectStableChapterList(next, "project-1", true, {
      projectId: "project-1",
      chapters: previous,
    })).toBe(next);
  });

  it("keeps the last non-empty list while the same project is refetching", () => {
    expect(selectStableChapterList([], "project-1", true, {
      projectId: "project-1",
      chapters: previous,
    })).toBe(previous);
  });

  it("does not reuse chapters across projects", () => {
    expect(selectStableChapterList([], "project-2", true, {
      projectId: "project-1",
      chapters: previous,
    })).toEqual([]);
  });

  it("keeps a confirmed empty list empty after fetching settles", () => {
    expect(selectStableChapterList([], "project-1", false, {
      projectId: "project-1",
      chapters: previous,
    })).toEqual([]);
  });
});
