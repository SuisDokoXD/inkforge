import type {
  TavernDirectorPostInput,
  TavernMessageListInput,
  TavernMode,
  TavernRoundRunInput,
  TavernRoundStopInput,
  TavernSessionCreateInput,
  TavernSessionDeleteInput,
  TavernSessionGetInput,
  TavernSessionListInput,
  TavernSummaryCompactInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalEnum,
  optionalNumber,
  optionalString,
  requiredEnum,
  requiredNonEmptyString,
  requiredNumber,
  requiredString,
  requiredStringArray,
} from "./core";

const TAVERN_MODES = ["director", "auto"] as const satisfies readonly TavernMode[];
const TAVERN_MESSAGE_ORDERS = ["asc", "desc"] as const;

export function parseTavernSessionCreateInput(
  value: unknown,
): TavernSessionCreateInput {
  const channel = "tavern-session:create";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    title: requiredString(obj, "title", channel),
    topic: requiredString(obj, "topic", channel),
    mode: requiredEnum(obj, "mode", channel, TAVERN_MODES),
    budgetTokens: requiredNumber(obj, "budgetTokens", channel),
    summaryProviderId: optionalString(obj, "summaryProviderId", channel),
    summaryModel: optionalString(obj, "summaryModel", channel),
    lastK: optionalNumber(obj, "lastK", channel),
  };
}

export function parseTavernSessionGetInput(value: unknown): TavernSessionGetInput {
  const channel = "tavern-session:get";
  const obj = asObject(value, channel);
  return {
    sessionId: requiredNonEmptyString(obj, "sessionId", channel),
  };
}

export function parseTavernSessionListInput(value: unknown): TavernSessionListInput {
  const channel = "tavern-session:list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseTavernSessionDeleteInput(
  value: unknown,
): TavernSessionDeleteInput {
  const channel = "tavern-session:delete";
  const obj = asObject(value, channel);
  return {
    sessionId: requiredNonEmptyString(obj, "sessionId", channel),
  };
}

export function parseTavernMessageListInput(value: unknown): TavernMessageListInput {
  const channel = "tavern-message:list";
  const obj = asObject(value, channel);
  return {
    sessionId: requiredNonEmptyString(obj, "sessionId", channel),
    limit: optionalNumber(obj, "limit", channel),
    beforeCreatedAt: optionalString(obj, "beforeCreatedAt", channel),
    order: optionalEnum(obj, "order", channel, TAVERN_MESSAGE_ORDERS),
  };
}

export function parseTavernDirectorPostInput(
  value: unknown,
): TavernDirectorPostInput {
  const channel = "tavern-director:post";
  const obj = asObject(value, channel);
  return {
    sessionId: requiredNonEmptyString(obj, "sessionId", channel),
    content: requiredString(obj, "content", channel),
  };
}

export function parseTavernRoundRunInput(value: unknown): TavernRoundRunInput {
  const channel = "tavern-round:run";
  const obj = asObject(value, channel);
  return {
    sessionId: requiredNonEmptyString(obj, "sessionId", channel),
    mode: optionalEnum(obj, "mode", channel, TAVERN_MODES),
    participants: requiredStringArray(obj, "participants", channel),
    lastK: optionalNumber(obj, "lastK", channel),
    autoRounds: optionalNumber(obj, "autoRounds", channel),
    directorMessage: optionalString(obj, "directorMessage", channel),
  };
}

export function parseTavernRoundStopInput(value: unknown): TavernRoundStopInput {
  const channel = "tavern-round:stop";
  const obj = asObject(value, channel);
  return {
    roundId: requiredNonEmptyString(obj, "roundId", channel),
  };
}

export function parseTavernSummaryCompactInput(
  value: unknown,
): TavernSummaryCompactInput {
  const channel = "tavern-summary:compact";
  const obj = asObject(value, channel);
  return {
    sessionId: requiredNonEmptyString(obj, "sessionId", channel),
    keepLastK: requiredNumber(obj, "keepLastK", channel),
  };
}
