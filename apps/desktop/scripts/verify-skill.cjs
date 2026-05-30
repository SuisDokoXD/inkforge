#!/usr/bin/env node
/**
 * Skill 验收脚本：skill-repo 存储往返 + skill-engine 纯逻辑集成。
 * 无 Electron，开临时 SQLite 跑迁移后逐项自断言。
 *
 * 覆盖：
 *   1) 迁移后 skills 表存在
 *   2) createSkill → getSkill：variables/triggers 数组、binding 对象、enabled 布尔正确 JSON 往返
 *   3) listSkills：scope 过滤 + enabledOnly 过滤
 *   4) updateSkill：改 prompt / 切 enabled 落库
 *   5) deleteSkill：删除后查不到
 *   6) 引擎集成：validateSkillDefinition 认可落库记录；renderSkillTemplate 替换占位；
 *      TriggerScheduler 对 selection 事件派发该启用技能
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:skill
 * 前置：先跑 pnpm --filter @inkforge/storage build && pnpm --filter @inkforge/skill-engine build
 *       且 better-sqlite3 需为 Node ABI（见 CLAUDE.md ABI 切换说明）。
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  openDatabase,
  runMigrations,
  createSkill,
  getSkill,
  updateSkill,
  listSkills,
  deleteSkill,
} = require("@inkforge/storage");

const {
  validateSkillDefinition,
  renderSkillTemplate,
  TriggerScheduler,
} = require("@inkforge/skill-engine");

let failed = 0;

function ok(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  failed += 1;
}

function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

// 造一个带变量/触发器的技能输入。
function skillInput(id, overrides = {}) {
  return {
    id,
    name: `润色-${id}`,
    prompt: "润色这段：{{selection}}，语气={{vars.tone}}",
    variables: [{ key: "tone", label: "语气", default: "平和", required: false }],
    triggers: [{ type: "selection", enabled: true }],
    binding: { temperature: 0.5 },
    output: "replace-selection",
    enabled: true,
    scope: "global",
    ...overrides,
  };
}

async function main() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "inkforge-skill-"));
  console.log(`[verify-skill] workspace: ${workspaceDir}`);
  let db;
  try {
    db = openDatabase({ workspaceDir });
    runMigrations(db);

    // 1) 表存在
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => r.name);
    assert(tables.includes("skills"), "skills 表存在");

    // 2) create → get：JSON 字段往返
    const created = createSkill(db, skillInput("a"));
    const got = getSkill(db, "a");
    assert(got !== null, "createSkill 后能 getSkill 取回");
    assert(Array.isArray(got.variables) && got.variables[0].key === "tone", "variables 反序列化为数组");
    assert(Array.isArray(got.triggers) && got.triggers[0].type === "selection", "triggers 反序列化为数组");
    assert(got.binding && got.binding.temperature === 0.5, "binding 反序列化为对象");
    assert(got.enabled === true, "enabled 反序列化为布尔 true");
    assert(got.createdAt === created.createdAt, "createdAt 一致");

    // 3) listSkills 过滤
    createSkill(db, skillInput("b", { scope: "project", enabled: false }));
    createSkill(db, skillInput("c", { enabled: false }));
    const all = listSkills(db);
    assert(all.length === 3, `listSkills 无过滤返回全部（实际 ${all.length}）`);
    const globals = listSkills(db, { scope: "global" });
    assert(globals.every((s) => s.scope === "global"), "scope=global 仅返回 global 技能");
    const enabledOnly = listSkills(db, { enabledOnly: true });
    assert(
      enabledOnly.length === 1 && enabledOnly[0].id === "a",
      `enabledOnly 仅返回启用技能（实际 ${enabledOnly.map((s) => s.id).join(",")}）`,
    );

    // 4) updateSkill：改 prompt + 切 enabled
    updateSkill(db, { id: "a", prompt: "新提示：{{selection}}", enabled: false });
    const updated = getSkill(db, "a");
    assert(updated.prompt === "新提示：{{selection}}", "updateSkill 改 prompt 落库");
    assert(updated.enabled === false, "updateSkill 切 enabled 落库");

    // 5) deleteSkill
    deleteSkill(db, "a");
    assert(getSkill(db, "a") === null, "deleteSkill 后查不到");
    assert(listSkills(db).length === 2, "deleteSkill 后剩 2 条");

    // 6) 引擎集成
    const valid = validateSkillDefinition(skillInput("v"));
    assert(valid.ok === true, "validateSkillDefinition 认可合法落库记录");

    const rendered = renderSkillTemplate("润色：{{selection}}|{{vars.tone}}", {
      selection: "原文片段",
      chapter: { title: "第一章", text: "正文" },
      character: { name: "", persona: "" },
      vars: { tone: "雀跃" },
      now: new Date(),
      rng: () => 0,
    });
    assert(rendered.text === "润色：原文片段|雀跃", `renderSkillTemplate 替换占位（实际「${rendered.text}」）`);

    const dispatched = [];
    const scheduler = new TriggerScheduler({
      getEnabledSkills: async () => [
        {
          ...skillInput("sel", { triggers: [{ type: "selection", enabled: true }] }),
          createdAt: "",
          updatedAt: "",
        },
      ],
      onDispatch: (d) => dispatched.push(d),
    });
    await scheduler.ingest({
      type: "selection",
      projectId: "p1",
      chapterId: "c1",
      chapterTitle: "标题",
      at: new Date().toISOString(),
      chapterText: "正文",
      selection: "选中片段",
    });
    scheduler.dispose();
    assert(
      dispatched.length === 1 && dispatched[0].skillId === "sel",
      `TriggerScheduler 对 selection 事件派发该技能（实际 ${dispatched.map((d) => d.skillId).join(",")}）`,
    );
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  if (failed > 0) {
    console.error(`\n\x1b[31m${failed} 项断言失败\x1b[0m`);
    process.exit(1);
  }
  console.log("\n\x1b[32mSkill 存储 + 引擎集成验证通过\x1b[0m");
}

main();
