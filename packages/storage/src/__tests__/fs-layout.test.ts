import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  clearAutosave,
  nextChapterFileName,
  pruneSnapshotsForChapter,
  readAutosave,
  readSnapshotFile,
  relCoverPath,
  relSnapshotPath,
  sanitizeFileSegment,
  sanitizeProjectName,
  writeAutosave,
  writeChapterFile,
  writeSnapshotFile,
} from "../fs-layout";

function withTempProject(run: (projectPath: string) => void): void {
  const projectPath = mkdtempSync(join(tmpdir(), "inkforge-storage-"));
  try {
    run(projectPath);
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
}

describe("fs layout helpers", () => {
  it("sanitizes project and file names with stable fallbacks", () => {
    expect(sanitizeProjectName("  bad:name/with*chars  ")).toBe("bad_name_with_chars");
    expect(sanitizeProjectName(" <>:/\\|?*\u0000 ")).toBe("_________");
    expect(sanitizeFileSegment("  chapter?.md  ")).toBe("chapter_.md");
    expect(sanitizeFileSegment("   ")).toBe("untitled");
  });

  it("chooses the next available chapter filename under chapters/", () => {
    withTempProject((projectPath) => {
      mkdirSync(join(projectPath, "chapters"), { recursive: true });
      writeFileSync(join(projectPath, "chapters", "Intro.md"), "");
      writeFileSync(join(projectPath, "chapters", "Intro-2.md"), "");

      expect(nextChapterFileName(projectPath, "Intro")).toBe("chapters/Intro-3.md");
      expect(writeChapterFile(projectPath, "chapters/Intro-3.md", "text")).toBe(
        join(projectPath, "chapters/Intro-3.md"),
      );
      expect(readFileSync(join(projectPath, "chapters", "Intro-3.md"), "utf-8")).toBe(
        "text",
      );
    });
  });

  it("keeps autosave files and snapshot files in hidden project history", () => {
    withTempProject((projectPath) => {
      const savedAt = writeAutosave(projectPath, "chapter:1", "draft text");
      expect(savedAt).toBeGreaterThan(0);
      expect(readAutosave(projectPath, "chapter:1")).toMatchObject({
        content: "draft text",
      });

      clearAutosave(projectPath, "chapter:1");
      expect(readAutosave(projectPath, "chapter:1")).toBeNull();

      const firstRel = writeSnapshotFile(projectPath, "chapter:1", "snap/1", "first");
      const secondRel = writeSnapshotFile(projectPath, "chapter:1", "snap/2", "second");

      expect(firstRel).toBe(relSnapshotPath("chapter:1", "snap/1"));
      expect(readSnapshotFile(projectPath, firstRel)).toBe("first");
      expect(pruneSnapshotsForChapter(projectPath, "chapter:1", [secondRel])).toBe(1);
      expect(readSnapshotFile(projectPath, firstRel)).toBeNull();
      expect(existsSync(join(projectPath, secondRel))).toBe(true);
    });
  });

  it("normalizes cover file extensions into bookshelf-relative paths", () => {
    expect(relCoverPath("PNG")).toBe(".bookshelf/cover.png");
    expect(relCoverPath("j.pg?")).toBe(".bookshelf/cover.jpg");
    expect(relCoverPath("")).toBe(".bookshelf/cover.png");
  });
});
