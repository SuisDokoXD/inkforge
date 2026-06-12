import type {
  FsPickFileInput,
  FsSaveFileInput,
  TerminalDisposePayload,
  TerminalInputPayload,
  TerminalResizePayload,
  TerminalSpawnInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalFilters,
  optionalNumber,
  optionalString,
  requiredNonEmptyString,
  requiredNumber,
  requiredString,
} from "./core";

export function parseFsPickFileInput(value: unknown): FsPickFileInput {
  const channel = "fs:pick-file";
  const obj = asObject(value, channel);
  return {
    title: optionalString(obj, "title", channel),
    filters: optionalFilters(obj, channel),
  };
}

export function parseFsSaveFileInput(value: unknown): FsSaveFileInput {
  const channel = "fs:save-file";
  const obj = asObject(value, channel);
  return {
    defaultPath: optionalString(obj, "defaultPath", channel),
    content: requiredString(obj, "content", channel),
    filters: optionalFilters(obj, channel),
  };
}

export function parseTerminalSpawnInput(value: unknown): TerminalSpawnInput {
  const channel = "terminal:spawn";
  const obj = asObject(value, channel);
  return {
    cwd: optionalString(obj, "cwd", channel),
    cols: optionalNumber(obj, "cols", channel),
    rows: optionalNumber(obj, "rows", channel),
    shell: optionalString(obj, "shell", channel),
  };
}

export function parseTerminalInputPayload(value: unknown): TerminalInputPayload {
  const channel = "terminal:input";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    data: requiredString(obj, "data", channel),
  };
}

export function parseTerminalResizePayload(value: unknown): TerminalResizePayload {
  const channel = "terminal:resize";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    cols: requiredNumber(obj, "cols", channel),
    rows: requiredNumber(obj, "rows", channel),
  };
}

export function parseTerminalDisposePayload(value: unknown): TerminalDisposePayload {
  const channel = "terminal:dispose";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}
