import { describe, it, expect } from "vitest";
import { validateSkillDefinition, assertSkillDefinition } from "../validate";

// 一个最小可用的合法定义工厂。
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    name: "润色",
    prompt: "润色：{{selection}}",
    variables: [],
    triggers: [{ type: "selection", enabled: true }],
    binding: { temperature: 0.5 },
    output: "replace-selection",
    enabled: true,
    scope: "global",
    ...overrides,
  };
}

describe("validateSkillDefinition", () => {
  it("合法定义返回 ok + 归一化 value", () => {
    const r = validateSkillDefinition(validInput());
    expect(r.ok).toBe(true);
    expect(r.value?.name).toBe("润色");
    expect(r.value?.createdAt).toBeTruthy(); // 缺省补时间戳
  });

  it("缺 id / name / prompt 报 required", () => {
    const r = validateSkillDefinition(validInput({ id: "", name: "", prompt: "" }));
    expect(r.ok).toBe(false);
    const paths = r.issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["id", "name", "prompt"]));
  });

  it("非法 output / scope / trigger 类型报 invalid_value", () => {
    const r = validateSkillDefinition(
      validInput({ output: "nope", scope: "weird", triggers: [{ type: "bad" }] }),
    );
    expect(r.ok).toBe(false);
    const paths = r.issues.map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(["output", "scope", "triggers[0].type"]),
    );
  });

  it("every-n-chars 缺 everyNChars(>0) 报错", () => {
    const r = validateSkillDefinition(
      validInput({ triggers: [{ type: "every-n-chars", enabled: true }] }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === "triggers[0].everyNChars")).toBe(true);
  });

  it("variables 非数组 / 缺 key|label 报错", () => {
    expect(validateSkillDefinition(validInput({ variables: "x" })).ok).toBe(false);
    const r = validateSkillDefinition(validInput({ variables: [{ required: true }] }));
    const paths = r.issues.map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(["variables[0].key", "variables[0].label"]),
    );
  });

  it("非对象输入直接判非法", () => {
    expect(validateSkillDefinition(null).ok).toBe(false);
    expect(validateSkillDefinition(42).ok).toBe(false);
  });
});

describe("assertSkillDefinition", () => {
  it("合法返回 value，非法抛错", () => {
    expect(assertSkillDefinition(validInput()).id).toBe("s1");
    expect(() => assertSkillDefinition({ id: "" })).toThrow();
  });
});
