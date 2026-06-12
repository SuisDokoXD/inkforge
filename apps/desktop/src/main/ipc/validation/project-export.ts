import type {
  ChapterImportEpubInput,
  ChapterImportTxtInput,
  ProjectExportInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalString,
  requiredNonEmptyString,
} from "./core";

export function parseProjectExportInput(
  value: unknown,
  channel = "project:export",
): ProjectExportInput {
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    outputPath: optionalString(obj, "outputPath", channel),
    fileName: optionalString(obj, "fileName", channel),
  };
}

export function parseChapterImportTxtInput(value: unknown): ChapterImportTxtInput {
  const channel = "chapter:import-txt";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    filePath: requiredNonEmptyString(obj, "filePath", channel),
  };
}

export function parseChapterImportEpubInput(value: unknown): ChapterImportEpubInput {
  const channel = "chapter:import-epub";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    filePath: requiredNonEmptyString(obj, "filePath", channel),
  };
}
