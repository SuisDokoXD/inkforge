import { describe, it, expect } from "vitest";
import {
  renderSkillTemplate,
  parseSkillTemplate,
} from "../template";
import type { SkillTemplateContext } from "../template";

// 固定的渲染上下文：注入 now/rng 让时间宏与随机宏可复现。
function ctx(overrides: Partial<SkillTemplateContext> = {}): SkillTemplateContext {
  return {
    selection: "选中片段",
    chapter: { title: "第一章", text: "0123456789" },
    character: { name: "阿空", persona: "冷静" },
    vars: { mood: "雀跃" },
    now: new Date(2026, 0, 5, 9, 5, 3), // 2026-01-05 09:05:03（验证补零）
    rng: () => 0, // 恒取第一个候选 / 骰子最小值
    ...overrides,
  };
}

describe("renderSkillTemplate · 上下文宏", () => {
  it("替换 selection / chapter / character / vars", () => {
    const r = renderSkillTemplate(
      "{{selection}}|{{chapter.title}}|{{chapter.text}}|{{character.name}}|{{character.persona}}|{{vars.mood}}",
      ctx(),
    );
    expect(r.text).toBe("选中片段|第一章|0123456789|阿空|冷静|雀跃");
    expect(r.missing).toEqual([]);
  });

  it("context_before_N 取章节末尾 N 字，并对超大 N 截断到 5000", () => {
    expect(renderSkillTemplate("{{context_before_3}}", ctx()).text).toBe("789");
    // N 超过文本长度时返回整段
    expect(renderSkillTemplate("{{context_before_99}}", ctx()).text).toBe("0123456789");
    // 超大 N 不报错（内部 clamp 到 5000）
    expect(() => renderSkillTemplate("{{context_before_999999}}", ctx())).not.toThrow();
  });

  it("未知 vars.key 渲染为空串而非 missing", () => {
    const r = renderSkillTemplate("{{vars.nope}}", ctx());
    expect(r.text).toBe("");
    expect(r.missing).toEqual([]);
  });
});

describe("renderSkillTemplate · 工具宏", () => {
  it("random 用注入的 rng 选择（rng=0 → 第一个）", () => {
    expect(renderSkillTemplate("{{random:晴,雨,雪}}", ctx()).text).toBe("晴");
  });

  it("roll 用注入的 rng 计算点数（rng=0 → 每颗最小 1）", () => {
    expect(renderSkillTemplate("{{roll:2d6}}", ctx()).text).toBe("2");
    expect(renderSkillTemplate("{{roll:1d20}}", ctx()).text).toBe("1");
    // 非法表达式 → 空串
    expect(renderSkillTemplate("{{roll:abc}}", ctx()).text).toBe("");
  });

  it("time / date / datetime 用注入的 now 并补零", () => {
    expect(renderSkillTemplate("{{date}}", ctx()).text).toBe("2026-01-05");
    expect(renderSkillTemplate("{{time}}", ctx()).text).toBe("09:05:03");
    expect(renderSkillTemplate("{{datetime}}", ctx()).text).toBe("2026-01-05 09:05:03");
  });

  it("注释宏擦除、newline 宏产出换行", () => {
    expect(renderSkillTemplate("A{{//这是注释}}B", ctx()).text).toBe("AB");
    expect(renderSkillTemplate("A{{newline}}B", ctx()).text).toBe("A\nB");
  });
});

describe("renderSkillTemplate · 缺失与安全", () => {
  it("默认 emptyOnMissing：未知占位擦除并计入 missing", () => {
    const r = renderSkillTemplate("X{{unknown_macro}}Y", ctx());
    expect(r.text).toBe("XY");
    expect(r.missing).toEqual(["{{unknown_macro}}"]);
  });

  it("strict 模式遇未知占位抛错", () => {
    expect(() =>
      renderSkillTemplate("{{unknown_macro}}", ctx(), { strict: true }),
    ).toThrow();
  });

  it("替换值含 $1/$& 等正则特殊串时按字面插入（不触发正则替换语义）", () => {
    const r = renderSkillTemplate("[{{selection}}]", ctx({ selection: "$1 $& $`" }));
    expect(r.text).toBe("[$1 $& $`]");
  });
});

describe("parseSkillTemplate", () => {
  it("解析出所有占位 token 及其位置", () => {
    const tokens = parseSkillTemplate("a{{selection}}b{{vars.x}}");
    expect(tokens.map((t) => t.key)).toEqual(["selection", "vars.x"]);
    expect(tokens[0]!.raw).toBe("{{selection}}");
  });
});
