import type {
  ChapterAutosaveClearInput,
  ChapterAutosavePeekInput,
  ChapterAutosaveWriteInput,
  ChapterCreateInput,
  ChapterDeleteInput,
  ChapterExportMdInput,
  ChapterImportMdInput,
  ChapterListInput,
  ChapterReadInput,
  ChapterReorderInput,
  ChapterUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalNullableString,
  optionalNumber,
  optionalString,
  requiredNonEmptyString,
  requiredString,
  requiredStringArray,
} from "./core";

export function parseChapterCreateInput(value: unknown): ChapterCreateInput {
  const channel = "chapter:create";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    parentId: optionalNullableString(obj, "parentId", channel),
    title: requiredString(obj, "title", channel),
    order: optionalNumber(obj, "order", channel),
    status: optionalString(obj, "status", channel),
    wordCount: optionalNumber(obj, "wordCount", channel),
    filePath: optionalString(obj, "filePath", channel) ?? "",
  };
}

export function parseChapterUpdateInput(value: unknown): ChapterUpdateInput {
  const channel = "chapter:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    title: optionalString(obj, "title", channel),
    status: optionalString(obj, "status", channel),
    wordCount: optionalNumber(obj, "wordCount", channel),
    filePath: optionalString(obj, "filePath", channel),
    content: optionalString(obj, "content", channel),
  };
}

export function parseChapterListInput(value: unknown): ChapterListInput {
  const channel = "chapter:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseChapterReadInput(value: unknown): ChapterReadInput {
  const channel = "chapter:read";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseChapterDeleteInput(value: unknown): ChapterDeleteInput {
  const channel = "chapter:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseChapterReorderInput(value: unknown): ChapterReorderInput {
  const channel = "chapter:reorder";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    orderedIds: requiredStringArray(obj, "orderedIds", channel),
  };
}

export function parseChapterImportMdInput(value: unknown): ChapterImportMdInput {
  const channel = "chapter:import-md";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    title: optionalString(obj, "title", channel),
    content: requiredString(obj, "content", channel),
    parentId: optionalNullableString(obj, "parentId", channel),
  };
}

export function parseChapterExportMdInput(value: unknown): ChapterExportMdInput {
  const channel = "chapter:export-md";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseChapterAutosaveWriteInput(value: unknown): ChapterAutosaveWriteInput {
  const channel = "chapter:autosave-write";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    content: requiredString(obj, "content", channel),
  };
}

export function parseChapterAutosavePeekInput(value: unknown): ChapterAutosavePeekInput {
  const channel = "chapter:autosave-peek";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}

export function parseChapterAutosaveClearInput(value: unknown): ChapterAutosaveClearInput {
  const channel = "chapter:autosave-clear";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}
