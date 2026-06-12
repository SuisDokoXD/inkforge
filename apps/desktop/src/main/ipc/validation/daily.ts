import type {
  DailyProgressInput,
  DailySummaryGenerateInput,
  DailySummaryGetInput,
  DailySummaryListInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalNumber,
  optionalString,
  requiredNonEmptyString,
} from "./core";

export function parseDailyProgressInput(value: unknown): DailyProgressInput {
  const channel = "daily:progress";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    date: optionalString(obj, "date", channel),
  };
}

export function parseDailySummaryGenerateInput(
  value: unknown,
): DailySummaryGenerateInput {
  const channel = "daily:summary-generate";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    date: optionalString(obj, "date", channel),
    providerId: optionalString(obj, "providerId", channel),
    model: optionalString(obj, "model", channel),
  };
}

export function parseDailySummaryGetInput(value: unknown): DailySummaryGetInput {
  const channel = "daily:summary-get";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    date: requiredNonEmptyString(obj, "date", channel),
  };
}

export function parseDailySummaryListInput(value: unknown): DailySummaryListInput {
  const channel = "daily:summary-list";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    startDate: optionalString(obj, "startDate", channel),
    endDate: optionalString(obj, "endDate", channel),
    limit: optionalNumber(obj, "limit", channel),
  };
}
