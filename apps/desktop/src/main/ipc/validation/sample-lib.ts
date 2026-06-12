import type {
  SampleLibCreateInput,
  SampleLibDeleteInput,
  SampleLibImportEpubInput,
  SampleLibImportTextInput,
  SampleLibListInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalString,
  requiredNonEmptyString,
  requiredNumber,
  requiredString,
  type UnknownRecord,
} from "./core";

function optionalSampleChunks(
  obj: UnknownRecord,
  channel: string,
): SampleLibCreateInput["chunks"] {
  const value = obj.chunks;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(channel, "chunks", "an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(channel, `chunks[${index}]`, "an object");
    }
    const chunk = item as UnknownRecord;
    return {
      ordinal: requiredNumber(chunk, "ordinal", channel),
      chapterTitle: optionalString(chunk, "chapterTitle", channel),
      text: requiredString(chunk, "text", channel),
    };
  });
}

export function parseSampleLibListInput(value: unknown): SampleLibListInput {
  const channel = "sample-lib:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseSampleLibCreateInput(value: unknown): SampleLibCreateInput {
  const channel = "sample-lib:create";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    title: requiredString(obj, "title", channel),
    author: optionalString(obj, "author", channel),
    notes: optionalString(obj, "notes", channel),
    chunks: optionalSampleChunks(obj, channel),
  };
}

export function parseSampleLibDeleteInput(value: unknown): SampleLibDeleteInput {
  const channel = "sample-lib:delete";
  const obj = asObject(value, channel);
  return {
    libId: requiredNonEmptyString(obj, "libId", channel),
  };
}

export function parseSampleLibImportTextInput(value: unknown): SampleLibImportTextInput {
  const channel = "sample-lib:import-text";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    title: requiredString(obj, "title", channel),
    author: optionalString(obj, "author", channel),
    notes: optionalString(obj, "notes", channel),
    text: requiredString(obj, "text", channel),
  };
}

export function parseSampleLibImportEpubInput(value: unknown): SampleLibImportEpubInput {
  const channel = "sample-lib:import-epub";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    filePath: requiredNonEmptyString(obj, "filePath", channel),
    title: optionalString(obj, "title", channel),
    author: optionalString(obj, "author", channel),
    notes: optionalString(obj, "notes", channel),
  };
}
