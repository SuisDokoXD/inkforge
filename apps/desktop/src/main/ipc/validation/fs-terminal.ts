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
  fail,
  optionalFilters,
  optionalNumber,
  optionalString,
  requiredNonEmptyString,
  requiredString,
} from "./core";

function optionalTerminalDimension(
  obj: Record<string, unknown>,
  key: "cols" | "rows",
  channel: string,
  min: number,
  max: number,
): number | undefined {
  const value = optionalNumber(obj, key, channel);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(channel, key, `an integer between ${min} and ${max}`);
  }
  return value;
}

function requiredTerminalDimension(
  obj: Record<string, unknown>,
  key: "cols" | "rows",
  channel: string,
  min: number,
  max: number,
): number {
  const value = optionalTerminalDimension(obj, key, channel, min, max);
  if (value === undefined) fail(channel, key, `an integer between ${min} and ${max}`);
  return value;
}

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
    cols: optionalTerminalDimension(obj, "cols", channel, 20, 400),
    rows: optionalTerminalDimension(obj, "rows", channel, 5, 200),
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
    cols: requiredTerminalDimension(obj, "cols", channel, 20, 400),
    rows: requiredTerminalDimension(obj, "rows", channel, 5, 200),
  };
}

export function parseTerminalDisposePayload(value: unknown): TerminalDisposePayload {
  const channel = "terminal:dispose";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}
