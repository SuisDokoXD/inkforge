import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TriggerScheduler } from "../trigger-scheduler";
import type { SkillEditorEvent, TriggerDispatch } from "../trigger-scheduler";
import type { SkillDefinition, SkillTriggerDef } from "../types";

// 造一个技能：只关心 id + 触发器，其余取最小合法值。
function skill(id: string, triggers: SkillTriggerDef[]): SkillDefinition {
  return {
    id,
    name: id,
    prompt: "p",
    variables: [],
    triggers,
    binding: {},
    output: "ai-feedback",
    enabled: true,
    scope: "global",
    createdAt: "",
    updatedAt: "",
  };
}

// 基础事件字段。
const base = {
  projectId: "p1",
  chapterId: "c1",
  chapterTitle: "标题",
  at: new Date().toISOString(),
};

function makeScheduler(skills: SkillDefinition[]) {
  const dispatched: TriggerDispatch[] = [];
  const scheduler = new TriggerScheduler({
    getEnabledSkills: async () => skills,
    onDispatch: (d) => {
      dispatched.push(d);
    },
  });
  return { scheduler, dispatched };
}

describe("TriggerScheduler · 立即触发", () => {
  it("selection 事件触发 selection 技能", async () => {
    const { scheduler, dispatched } = makeScheduler([
      skill("a", [{ type: "selection", enabled: true }]),
      skill("b", [{ type: "manual", enabled: true }]), // 不应触发
    ]);
    const ev: SkillEditorEvent = { type: "selection", ...base, chapterText: "正文", selection: "选中" };
    await scheduler.ingest(ev);
    expect(dispatched.map((d) => d.skillId)).toEqual(["a"]);
    expect(dispatched[0]!.context.selection).toBe("选中");
    scheduler.dispose();
  });

  it("manual 事件带 skillId 时只触发该技能", async () => {
    const { scheduler, dispatched } = makeScheduler([
      skill("a", [{ type: "manual", enabled: true }]),
      skill("b", [{ type: "manual", enabled: true }]),
    ]);
    await scheduler.ingest({ type: "manual", ...base, chapterText: "正文", skillId: "b" });
    expect(dispatched.map((d) => d.skillId)).toEqual(["b"]);
    scheduler.dispose();
  });

  it("save 事件触发 on-save 技能；禁用的触发器不触发", async () => {
    const { scheduler, dispatched } = makeScheduler([
      skill("a", [{ type: "on-save", enabled: true }]),
      skill("b", [{ type: "on-save", enabled: false }]),
    ]);
    await scheduler.ingest({ type: "save", ...base, chapterText: "正文" });
    expect(dispatched.map((d) => d.skillId)).toEqual(["a"]);
    scheduler.dispose();
  });
});

describe("TriggerScheduler · every-n-chars 防抖与冷却", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const trig: SkillTriggerDef = {
    type: "every-n-chars",
    enabled: true,
    everyNChars: 10,
    debounceMs: 100,
    cooldownMs: 1000,
  };

  it("未达字数阈值不触发；达阈值经防抖后触发一次", async () => {
    const { scheduler, dispatched } = makeScheduler([skill("a", [trig])]);

    // 仅 5 字（增量 < 10）→ 不排程
    await scheduler.ingest({ type: "text-change", ...base, chapterText: "x".repeat(5) });
    await vi.advanceTimersByTimeAsync(200);
    expect(dispatched.length).toBe(0);

    // 12 字（增量 >= 10）→ 排程，防抖 100ms 后触发
    await scheduler.ingest({ type: "text-change", ...base, chapterText: "x".repeat(12) });
    expect(dispatched.length).toBe(0); // 防抖未到
    await vi.advanceTimersByTimeAsync(100);
    expect(dispatched.length).toBe(1);

    scheduler.dispose();
  });

  it("冷却期内不重复触发", async () => {
    const { scheduler, dispatched } = makeScheduler([skill("a", [trig])]);

    await scheduler.ingest({ type: "text-change", ...base, chapterText: "x".repeat(12) });
    await vi.advanceTimersByTimeAsync(100);
    expect(dispatched.length).toBe(1);

    // 立刻再来一次（距上次 < cooldown 1000ms）→ 被冷却拦截
    await scheduler.ingest({ type: "text-change", ...base, chapterText: "x".repeat(25) });
    await vi.advanceTimersByTimeAsync(100);
    expect(dispatched.length).toBe(1);

    scheduler.dispose();
  });
});
