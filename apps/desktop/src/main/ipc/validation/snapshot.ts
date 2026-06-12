import type {
  AutoWriterAgentRole,
  ChapterSnapshotKind,
  SnapshotCreateInput,
  SnapshotDeleteInput,
  SnapshotGetInput,
  SnapshotListInput,
  SnapshotRestoreInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalEnum,
  optionalEnumArray,
  optionalNullableString,
  optionalNumber,
  optionalString,
  requiredNonEmptyString,
} from "./core";

const SNAPSHOT_KINDS = [
  "manual",
  "pre-ai",
  "post-ai",
  "pre-rewrite",
  "pre-restore",
  "auto-periodic",
] as const;
const AUTO_WRITER_AGENT_ROLES = ["planner", "writer", "critic", "reflector"] as const;

export function parseSnapshotCreateInput(value: unknown): SnapshotCreateInput {
  const channel = "snapshot:create";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    label: optionalNullableString(obj, "label", channel),
    kind: optionalEnum(obj, "kind", channel, SNAPSHOT_KINDS) as ChapterSnapshotKind | undefined,
    runId: optionalString(obj, "runId", channel),
    agentRole: optionalEnum(obj, "agentRole", channel, AUTO_WRITER_AGENT_ROLES) as
      | AutoWriterAgentRole
      | undefined,
    sourceMessageId: optionalString(obj, "sourceMessageId", channel),
  };
}

export function parseSnapshotListInput(value: unknown): SnapshotListInput {
  const channel = "snapshot:list";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    limit: optionalNumber(obj, "limit", channel),
    kinds: optionalEnumArray(obj, "kinds", channel, SNAPSHOT_KINDS) as
      | ChapterSnapshotKind[]
      | undefined,
    runId: optionalString(obj, "runId", channel),
  };
}

export function parseSnapshotGetInput(value: unknown): SnapshotGetInput {
  const channel = "snapshot:get";
  const obj = asObject(value, channel);
  return {
    snapshotId: requiredNonEmptyString(obj, "snapshotId", channel),
  };
}

export function parseSnapshotRestoreInput(value: unknown): SnapshotRestoreInput {
  const channel = "snapshot:restore";
  const obj = asObject(value, channel);
  return {
    snapshotId: requiredNonEmptyString(obj, "snapshotId", channel),
  };
}

export function parseSnapshotDeleteInput(value: unknown): SnapshotDeleteInput {
  const channel = "snapshot:delete";
  const obj = asObject(value, channel);
  return {
    snapshotId: requiredNonEmptyString(obj, "snapshotId", channel),
  };
}
