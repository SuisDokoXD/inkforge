import {
  AUTO_WRITER_PARAMETER_LIMITS,
  AUTO_WRITER_ROLE_DEFAULTS,
  type AutoWriterAgentBinding,
  type AutoWriterAgentRole,
} from "@inkforge/shared";

export interface AutoWriterGenerationOptions {
  temperature: number;
  maxTokens: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function resolveAutoWriterGenerationOptions(
  role: AutoWriterAgentRole,
  binding: AutoWriterAgentBinding,
): AutoWriterGenerationOptions {
  const defaults = AUTO_WRITER_ROLE_DEFAULTS[role];
  const temperature = clamp(
    finiteOrDefault(binding.temperature, defaults.temperature),
    AUTO_WRITER_PARAMETER_LIMITS.temperature.min,
    AUTO_WRITER_PARAMETER_LIMITS.temperature.max,
  );
  const maxTokens = Math.floor(
    clamp(
      finiteOrDefault(binding.maxTokens, defaults.maxTokens),
      AUTO_WRITER_PARAMETER_LIMITS.maxTokens.min,
      AUTO_WRITER_PARAMETER_LIMITS.maxTokens.max,
    ),
  );

  return { temperature, maxTokens };
}
