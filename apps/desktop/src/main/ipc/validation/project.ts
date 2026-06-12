import type {
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectOpenInput,
  ProjectUpdateInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredNonEmptyString,
  requiredString,
} from "./core";

export function parseProjectCreateInput(value: unknown): ProjectCreateInput {
  const channel = "project:create";
  const obj = asObject(value, channel);
  return {
    name: requiredString(obj, "name", channel),
    path: optionalString(obj, "path", channel),
    dailyGoal: optionalNumber(obj, "dailyGoal", channel),
  };
}

export function parseProjectUpdateInput(value: unknown): ProjectUpdateInput {
  const channel = "project:update";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    name: optionalString(obj, "name", channel),
    dailyGoal: optionalNumber(obj, "dailyGoal", channel),
  };
}

export function parseProjectDeleteInput(value: unknown): ProjectDeleteInput {
  const channel = "project:delete";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    removeFiles: optionalBoolean(obj, "removeFiles", channel),
  };
}

export function parseProjectOpenInput(value: unknown): ProjectOpenInput {
  const channel = "project:open";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
  };
}
