import type {
  AutoWriterAgentBinding,
  AutoWriterAgentRole,
  AutoWriterCorrectInput,
  AutoWriterGetRunInput,
  AutoWriterInjectIdeaInput,
  AutoWriterListRunsInput,
  AutoWriterPauseInput,
  AutoWriterResumeInput,
  AutoWriterRunStatus,
  AutoWriterStartInput,
  AutoWriterStopInput,
} from "@inkforge/shared";
import {
  asObject,
  fail,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requiredEnum,
  requiredNonEmptyString,
  requiredString,
  type UnknownRecord,
} from "./core";

const AUTO_WRITER_AGENT_ROLES = [
  "planner",
  "writer",
  "critic",
  "reflector",
] as const satisfies readonly AutoWriterAgentRole[];

const AUTO_WRITER_RUN_STATUSES = [
  "running",
  "paused",
  "completed",
  "failed",
  "partial",
  "stopped",
] as const satisfies readonly AutoWriterRunStatus[];

const AUTO_WRITER_SPEED_MODES = ["fast", "quality"] as const;

function requiredAgentBindings(
  obj: UnknownRecord,
  channel: string,
): AutoWriterAgentBinding[] {
  const value = obj.agents;
  if (!Array.isArray(value)) fail(channel, "agents", "an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(channel, `agents[${index}]`, "an object");
    }
    const binding = item as UnknownRecord;
    return {
      role: requiredEnum(binding, "role", channel, AUTO_WRITER_AGENT_ROLES),
      providerId: requiredNonEmptyString(binding, "providerId", channel),
      model: requiredString(binding, "model", channel),
      temperature: optionalNumber(binding, "temperature", channel),
      maxTokens: optionalNumber(binding, "maxTokens", channel),
    };
  });
}

function parseRunIdInput<T extends { runId: string }>(
  value: unknown,
  channel: string,
): T {
  const obj = asObject(value, channel);
  return {
    runId: requiredNonEmptyString(obj, "runId", channel),
  } as T;
}

export function parseAutoWriterStartInput(value: unknown): AutoWriterStartInput {
  const channel = "auto-writer:start";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    userIdeas: requiredString(obj, "userIdeas", channel),
    agents: requiredAgentBindings(obj, channel),
    targetSegmentLength: optionalNumber(obj, "targetSegmentLength", channel),
    maxSegments: optionalNumber(obj, "maxSegments", channel),
    maxRewritesPerSegment: optionalNumber(obj, "maxRewritesPerSegment", channel),
    enableOocGate: optionalBoolean(obj, "enableOocGate", channel),
    sampleLibIds: optionalStringArray(obj, "sampleLibIds", channel),
    speedMode: optionalEnum(obj, "speedMode", channel, AUTO_WRITER_SPEED_MODES),
  };
}

export function parseAutoWriterStopInput(value: unknown): AutoWriterStopInput {
  return parseRunIdInput(value, "auto-writer:stop");
}

export function parseAutoWriterPauseInput(value: unknown): AutoWriterPauseInput {
  return parseRunIdInput(value, "auto-writer:pause");
}

export function parseAutoWriterResumeInput(value: unknown): AutoWriterResumeInput {
  return parseRunIdInput(value, "auto-writer:resume");
}

export function parseAutoWriterGetRunInput(value: unknown): AutoWriterGetRunInput {
  return parseRunIdInput(value, "auto-writer:get-run");
}

export function parseAutoWriterListRunsInput(value: unknown): AutoWriterListRunsInput {
  const channel = "auto-writer:list-runs";
  const obj = asObject(value, channel);
  return {
    chapterId: optionalString(obj, "chapterId", channel),
    projectId: optionalString(obj, "projectId", channel),
    limit: optionalNumber(obj, "limit", channel),
    status: optionalEnum(obj, "status", channel, AUTO_WRITER_RUN_STATUSES),
  };
}

export function parseAutoWriterInjectIdeaInput(
  value: unknown,
): AutoWriterInjectIdeaInput {
  const channel = "auto-writer:inject-idea";
  const obj = asObject(value, channel);
  return {
    runId: requiredNonEmptyString(obj, "runId", channel),
    content: requiredString(obj, "content", channel),
  };
}

export function parseAutoWriterCorrectInput(value: unknown): AutoWriterCorrectInput {
  const channel = "auto-writer:correct";
  const obj = asObject(value, channel);
  return {
    runId: requiredNonEmptyString(obj, "runId", channel),
    content: requiredString(obj, "content", channel),
    targetExcerpt: optionalString(obj, "targetExcerpt", channel),
  };
}
