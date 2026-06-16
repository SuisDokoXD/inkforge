import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseAutoWriterStartInput } from "../auto-writer";
import { parseCharacterSyncApplyInput } from "../character";
import { asObject } from "../core";
import { parseExternalOpenUrlInput } from "../external";
import {
  parseChapterImportEpubInput,
  parseChapterImportTxtInput,
  parseProjectExportInput,
} from "../project-export";
import { parseOutlinePrepareChapterInput } from "../outline";
import {
  parseFsSaveFileInput,
  parseTerminalInputPayload,
  parseTerminalResizePayload,
  parseTerminalSpawnInput,
} from "../fs-terminal";
import { parseLLMChatInput } from "../llm";
import {
  parseProviderKeySetDisabledInput,
  parseProviderKeyUpsertInput,
} from "../provider-key";
import {
  parseProviderListRemoteModelsInput,
  parseProviderSaveInput,
} from "../provider";
import { parseReviewDimUpsertInput } from "../review";
import { parseSettingsSetInput } from "../settings";
import { parseTavernRoundRunInput } from "../tavern";
import {
  parseWorldPackCoverWriteInput,
  parseWorldPackFuseInput,
} from "../world-pack";

function expectInvalid(fn: () => unknown, message: string): void {
  expect(fn).toThrow(message);
}

describe("IPC validation core helpers", () => {
  it("accepts missing payloads as empty objects for void-like channels", () => {
    expect(asObject(undefined, "settings:get")).toEqual({});
  });

  it("rejects non-object payloads with channel context", () => {
    expectInvalid(
      () => asObject("bad", "provider:save"),
      "Invalid IPC payload for provider:save",
    );
  });
});

describe("provider validation", () => {
  it("keeps remote model listing flexible for saved providers", () => {
    expect(parseProviderListRemoteModelsInput({ providerId: "p1" })).toEqual({
      providerId: "p1",
      vendor: undefined,
      baseUrl: undefined,
      apiKey: undefined,
    });
  });

  it("rejects unknown provider vendors", () => {
    expectInvalid(
      () =>
        parseProviderSaveInput({
          label: "Bad",
          vendor: "unknown",
          defaultModel: "x",
        }),
      "vendor must be one of",
    );
  });
});

describe("settings validation", () => {
  it("keeps valid app settings and ignores unknown keys", () => {
    expect(
      parseSettingsSetInput({
        updates: {
          theme: "paper",
          editorFontSize: 18,
          focusMode: true,
          unknownSetting: "ignored",
        },
      }),
    ).toEqual({
      updates: {
        theme: "paper",
        editorFontSize: 18,
        focusMode: true,
      },
    });
  });

  it("rejects wrong setting value types", () => {
    expectInvalid(
      () => parseSettingsSetInput({ updates: { editorFontSize: "large" } }),
      "editorFontSize must be a finite number",
    );
  });
});

describe("external URL validation", () => {
  it("allows only http/https URLs", () => {
    expect(parseExternalOpenUrlInput({ url: "https://example.com/docs" })).toEqual({
      url: "https://example.com/docs",
    });
    expect(parseExternalOpenUrlInput({ url: "http://example.com" })).toEqual({
      url: "http://example.com",
    });
    expectInvalid(
      () => parseExternalOpenUrlInput({ url: "file:///C:/Windows/System32/calc.exe" }),
      "external:open-url.url must be an http/https URL",
    );
  });
});

describe("outline validation", () => {
  it("requires project and outline card when preparing a chapter", () => {
    expect(parseOutlinePrepareChapterInput({ projectId: "p1", outlineCardId: "card-1" }))
      .toEqual({ projectId: "p1", outlineCardId: "card-1" });

    expectInvalid(
      () => parseOutlinePrepareChapterInput({ projectId: "p1", outlineCardId: "" }),
      "outlineCardId must be a non-empty string",
    );
  });
});

describe("file, import, and terminal validation", () => {
  it("keeps project export/import payloads explicit about project and paths", () => {
    expect(
      parseProjectExportInput({
        projectId: "project-1",
        outputPath: "C:/tmp/book.md",
        fileName: "book.md",
      }),
    ).toEqual({
      projectId: "project-1",
      outputPath: "C:/tmp/book.md",
      fileName: "book.md",
    });

    expect(parseChapterImportTxtInput({ projectId: "project-1", filePath: "C:/tmp/book.txt" }))
      .toEqual({ projectId: "project-1", filePath: "C:/tmp/book.txt" });
    expect(parseChapterImportEpubInput({ projectId: "project-1", filePath: "C:/tmp/book.epub" }))
      .toEqual({ projectId: "project-1", filePath: "C:/tmp/book.epub" });

    expectInvalid(
      () => parseProjectExportInput({ projectId: "", outputPath: "C:/tmp/book.md" }),
      "projectId must be a non-empty string",
    );
    expectInvalid(
      () => parseChapterImportTxtInput({ projectId: "project-1", filePath: "" }),
      "filePath must be a non-empty string",
    );
  });

  it("validates save-file filters and string content", () => {
    expect(
      parseFsSaveFileInput({
        defaultPath: "draft.md",
        content: "# Draft",
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      }),
    ).toEqual({
      defaultPath: "draft.md",
      content: "# Draft",
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });

    expectInvalid(
      () => parseFsSaveFileInput({ content: 123 }),
      "content must be a string",
    );
    expectInvalid(
      () =>
        parseFsSaveFileInput({
          content: "",
          filters: [{ name: "Bad", extensions: ["md", 1] }],
        }),
      "filters[0].extensions[1] must be a non-empty string",
    );
  });

  it("bounds terminal dimensions and requires session ids", () => {
    expect(parseTerminalSpawnInput({ cwd: "C:/work", cols: 120, rows: 32 })).toEqual({
      cwd: "C:/work",
      cols: 120,
      rows: 32,
      shell: undefined,
    });
    expect(parseTerminalInputPayload({ id: "term-1", data: "pnpm test\r" })).toEqual({
      id: "term-1",
      data: "pnpm test\r",
    });
    expect(parseTerminalResizePayload({ id: "term-1", cols: 80, rows: 24 })).toEqual({
      id: "term-1",
      cols: 80,
      rows: 24,
    });

    expectInvalid(
      () => parseTerminalSpawnInput({ cols: 19, rows: 24 }),
      "cols must be an integer between 20 and 400",
    );
    expectInvalid(
      () => parseTerminalResizePayload({ id: "term-1", cols: 80.5, rows: 24 }),
      "cols must be an integer between 20 and 400",
    );
    expectInvalid(
      () => parseTerminalInputPayload({ id: "", data: "x" }),
      "id must be a non-empty string",
    );
  });
});

describe("provider-key validation", () => {
  it("accepts strategy updates and rejects invalid key metadata", () => {
    expect(
      parseProviderKeyUpsertInput({
        providerId: "provider-1",
        id: "key-1",
        label: "Primary",
        weight: 2,
        strategy: "weighted",
        cooldownMs: 30000,
      }),
    ).toEqual({
      providerId: "provider-1",
      id: "key-1",
      label: "Primary",
      apiKey: undefined,
      weight: 2,
      disabled: undefined,
      strategy: "weighted",
      cooldownMs: 30000,
    });

    expect(parseProviderKeySetDisabledInput({ id: "key-1", disabled: true }))
      .toEqual({ id: "key-1", disabled: true });

    expectInvalid(
      () => parseProviderKeyUpsertInput({ providerId: "provider-1", label: "" }),
      "label must be a non-empty string",
    );
    expectInvalid(
      () => parseProviderKeyUpsertInput({ providerId: "provider-1", label: "x", weight: -1 }),
      "weight must be a non-negative integer",
    );
    expectInvalid(
      () =>
        parseProviderKeyUpsertInput({
          providerId: "provider-1",
          label: "x",
          strategy: "random",
        }),
      "strategy must be one of",
    );
    expectInvalid(
      () => parseProviderKeySetDisabledInput({ id: "key-1", disabled: "true" }),
      "disabled must be a boolean",
    );
  });
});

describe("model and review validation", () => {
  it("validates chat message roles", () => {
    expect(
      parseLLMChatInput({
        messages: [{ role: "user", content: "hi" }],
        temperature: 0.2,
      }),
    ).toMatchObject({
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
    });

    expectInvalid(
      () => parseLLMChatInput({ messages: [{ role: "system", content: "x" }] }),
      "role must be one of",
    );
  });

  it("accepts nullable review dimension links but validates enums", () => {
    expect(
      parseReviewDimUpsertInput({
        projectId: null,
        name: "Style",
        kind: "builtin",
        builtinId: "style",
        skillId: null,
      }),
    ).toMatchObject({
      projectId: null,
      builtinId: "style",
      skillId: null,
    });

    expectInvalid(
      () =>
        parseReviewDimUpsertInput({
          projectId: null,
          name: "Bad",
          kind: "other",
        }),
      "kind must be one of",
    );
  });
});

describe("world pack and character validation", () => {
  it("accepts cover bytes as ArrayBuffer or Uint8Array only", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(
      parseWorldPackCoverWriteInput({
        packId: "pack-1",
        ext: "png",
        bytes,
        mime: "image/png",
      }),
    ).toMatchObject({ packId: "pack-1", bytes });

    expectInvalid(
      () =>
        parseWorldPackCoverWriteInput({
          packId: "pack-1",
          ext: "png",
          bytes: [1, 2, 3],
          mime: "image/png",
        }),
      "bytes must be an ArrayBuffer or Uint8Array",
    );
  });

  it("requires at least string array shape for fusion sources", () => {
    expect(parseWorldPackFuseInput({ sourcePackIds: ["a", "b"], brief: "" })).toEqual({
      sourcePackIds: ["a", "b"],
      brief: "",
      providerId: undefined,
      model: undefined,
      persist: undefined,
    });

    expectInvalid(
      () => parseWorldPackFuseInput({ sourcePackIds: ["a", 1], brief: "" }),
      "sourcePackIds[1] must be a non-empty string",
    );
  });

  it("validates character sync resolution fields", () => {
    expect(
      parseCharacterSyncApplyInput({
        novelCharId: "n1",
        tavernCardId: "c1",
        direction: "novel_to_card",
        resolutions: [{ field: "persona", winner: "novel" }],
      }),
    ).toMatchObject({
      direction: "novel_to_card",
      resolutions: [{ field: "persona", winner: "novel" }],
    });

    expectInvalid(
      () =>
        parseCharacterSyncApplyInput({
          novelCharId: "n1",
          tavernCardId: "c1",
          direction: "auto",
          resolutions: [{ field: "name", winner: "novel" }],
        }),
      "field must be one of",
    );
  });
});

describe("automation and tavern validation", () => {
  it("validates auto writer agent bindings", () => {
    expect(
      parseAutoWriterStartInput({
        projectId: "p1",
        chapterId: "c1",
        userIdeas: "go",
        agents: [{ role: "writer", providerId: "p", model: "m" }],
      }),
    ).toMatchObject({
      projectId: "p1",
      agents: [{ role: "writer", providerId: "p", model: "m" }],
    });

    expectInvalid(
      () =>
        parseAutoWriterStartInput({
          projectId: "p1",
          chapterId: "c1",
          userIdeas: "go",
          agents: [{ role: "narrator", providerId: "p", model: "m" }],
        }),
      "role must be one of",
    );
  });

  it("requires tavern participants to be string arrays", () => {
    expect(
      parseTavernRoundRunInput({
        sessionId: "s1",
        participants: ["c1"],
        mode: "director",
      }),
    ).toMatchObject({ sessionId: "s1", participants: ["c1"] });

    expectInvalid(
      () => parseTavernRoundRunInput({ sessionId: "s1", participants: "c1" }),
      "participants must be an array of strings",
    );
  });
});

describe("IPC handler validation coverage", () => {
  it("does not leave typed IPC payload parameters in handlers", () => {
    const ipcDir = path.resolve(process.cwd(), "src", "main", "ipc");
    const handlerFiles = fs
      .readdirSync(ipcDir)
      .filter((file) => file.endsWith(".ts") && file !== "validation.ts")
      .map((file) => path.join(ipcDir, file));

    const typedInputPattern =
      /async\s*\([^)]*\binput:\s+(?!unknown\b)[A-Za-z][A-Za-z0-9]*Input\b/gs;
    const offenders = handlerFiles.flatMap((file) => {
      const content = fs.readFileSync(file, "utf8");
      return [...content.matchAll(typedInputPattern)].map(
        (match) => `${path.basename(file)}: ${match[0]}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});
