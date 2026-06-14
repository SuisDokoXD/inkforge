import { describe, expect, it } from "vitest";
import {
  AUTO_WRITER_PARAMETER_LIMITS,
  AUTO_WRITER_ROLE_DEFAULTS,
  type AutoWriterAgentBinding,
} from "@inkforge/shared";
import { resolveAutoWriterGenerationOptions } from "../auto-writer-generation-options";

function binding(patch: Partial<AutoWriterAgentBinding> = {}): AutoWriterAgentBinding {
  return {
    role: "writer",
    providerId: "provider-1",
    model: "model-1",
    ...patch,
  };
}

describe("resolveAutoWriterGenerationOptions", () => {
  it("uses role-specific defaults when the binding omits generation settings", () => {
    expect(resolveAutoWriterGenerationOptions("planner", binding())).toEqual(
      AUTO_WRITER_ROLE_DEFAULTS.planner,
    );
    expect(resolveAutoWriterGenerationOptions("writer", binding())).toEqual(
      AUTO_WRITER_ROLE_DEFAULTS.writer,
    );
    expect(resolveAutoWriterGenerationOptions("critic", binding())).toEqual(
      AUTO_WRITER_ROLE_DEFAULTS.critic,
    );
    expect(resolveAutoWriterGenerationOptions("reflector", binding())).toEqual(
      AUTO_WRITER_ROLE_DEFAULTS.reflector,
    );
  });

  it("keeps explicit generation settings within safe provider bounds", () => {
    expect(
      resolveAutoWriterGenerationOptions(
        "writer",
        binding({ temperature: 0.55, maxTokens: 1234.8 }),
      ),
    ).toEqual({ temperature: 0.55, maxTokens: 1234 });

    expect(
      resolveAutoWriterGenerationOptions(
        "writer",
        binding({ temperature: 5, maxTokens: 99999 }),
      ),
    ).toEqual({
      temperature: AUTO_WRITER_PARAMETER_LIMITS.temperature.max,
      maxTokens: AUTO_WRITER_PARAMETER_LIMITS.maxTokens.max,
    });
  });
});
