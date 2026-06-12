import type {
  FeedbackClearChapterInput,
  FeedbackDeleteEmptyInput,
  FeedbackDismissInput,
  FeedbackListInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalBoolean,
  optionalNumber,
  requiredNonEmptyString,
} from "./core";

export function parseFeedbackListInput(value: unknown): FeedbackListInput {
  const channel = "feedback:list";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}

export function parseFeedbackDismissInput(value: unknown): FeedbackDismissInput {
  const channel = "feedback:dismiss";
  const obj = asObject(value, channel);
  return {
    id: requiredNonEmptyString(obj, "id", channel),
    dismissed: optionalBoolean(obj, "dismissed", channel),
  };
}

export function parseFeedbackDeleteEmptyInput(value: unknown): FeedbackDeleteEmptyInput {
  const channel = "feedback:delete-empty";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
  };
}

export function parseFeedbackClearChapterInput(value: unknown): FeedbackClearChapterInput {
  const channel = "feedback:clear-chapter";
  const obj = asObject(value, channel);
  return {
    chapterId: requiredNonEmptyString(obj, "chapterId", channel),
  };
}
