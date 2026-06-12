import { describe, expect, it } from "vitest";
import { makeRoleResolver } from "../types";

describe("makeRoleResolver", () => {
  it("uses the explicit binding when present", () => {
    const resolve = makeRoleResolver([
      { role: "writer", providerId: "provider-w", model: "writer-model" },
      { role: "critic", providerId: "provider-c", model: "critic-model" },
    ]);

    expect(resolve("critic")).toEqual({
      role: "critic",
      providerId: "provider-c",
      model: "critic-model",
    });
  });

  it("copies the fallback binding while replacing the requested role", () => {
    const resolve = makeRoleResolver([
      { role: "writer", providerId: "provider-w", model: "writer-model", temperature: 0.4 },
    ]);

    expect(resolve("planner")).toEqual({
      role: "planner",
      providerId: "provider-w",
      model: "writer-model",
      temperature: 0.4,
    });
  });

  it("throws a clear error when no binding exists", () => {
    const resolve = makeRoleResolver([]);

    expect(() => resolve("writer")).toThrow("auto-writer: no agent binding configured");
  });
});
