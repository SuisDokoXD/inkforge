import { describe, expect, it } from "vitest";
import { assertTerminalDevModeEnabled } from "../terminal-access";

describe("terminal access guard", () => {
  it("allows terminal access only when developer mode is enabled", () => {
    expect(() => assertTerminalDevModeEnabled(true)).not.toThrow();
    expect(() => assertTerminalDevModeEnabled(false)).toThrow(
      "terminal is available only when developer mode is enabled",
    );
  });
});
