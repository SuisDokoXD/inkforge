import type {
  ProjectPackageExportInput,
  ProjectPackageImportInput,
} from "@inkforge/shared";
import {
  asObject,
  optionalString,
  requiredNonEmptyString,
} from "./core";

export function parseProjectPackageExportInput(
  value: unknown,
): ProjectPackageExportInput {
  const channel = "project-package:export";
  const obj = asObject(value, channel);
  return {
    projectId: requiredNonEmptyString(obj, "projectId", channel),
    outputPath: optionalString(obj, "outputPath", channel),
    fileName: optionalString(obj, "fileName", channel),
  };
}

export function parseProjectPackageImportInput(
  value: unknown,
): ProjectPackageImportInput {
  const channel = "project-package:import";
  const obj = asObject(value, channel);
  return {
    filePath: optionalString(obj, "filePath", channel),
    nameOverride: optionalString(obj, "nameOverride", channel),
  };
}
