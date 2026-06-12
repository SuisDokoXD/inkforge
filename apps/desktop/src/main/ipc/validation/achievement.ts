import type {
  AchievementCheckInput,
  AchievementListInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalEnum,
  requiredNonEmptyString,
} from "./core";

const ACHIEVEMENT_TRIGGERS = [
  "chapter-update",
  "chapter-create",
  "character-create",
  "character-update",
  "world-create",
  "world-update",
  "auto-writer-done",
  "letter-generate",
  "snapshot-create",
  "review-done",
  "manual",
] as const;

export function parseAchievementListInput(value: unknown): AchievementListInput {
  const channel = "achievement:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}

export function parseAchievementCheckInput(value: unknown): AchievementCheckInput {
  const channel = "achievement:check";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    trigger: optionalEnum(obj, "trigger", channel, ACHIEVEMENT_TRIGGERS),
  };
}

export function parseAchievementStatsInput(value: unknown): { projectId: string } {
  const channel = "achievement:stats";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
  };
}
