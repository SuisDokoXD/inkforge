#!/usr/bin/env node
/**
 * RAG / Sample Library 验收脚本（ported from ainovel）
 * 步骤：
 *   1) 跑迁移到 v17，断言 sample_libs / sample_chunks 表存在
 *   2) 创建一个虚拟 project + 插入测试 lib + 多个 chunks
 *   3) ragSearchSampleChunks 用关键词召回 → 验证命中
 *   4) ragSearchWorldEntries / ragSearchCharacters 跨源召回
 *   5) 跨 project 隔离：另一个 project 不应召回前一个 project 的 chunks
 *   6) deleteSampleLib → CASCADE 清 chunks
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:rag
 * 前置：先跑 pnpm --filter @inkforge/storage build
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const {
  openDatabase,
  runMigrations,
  createSampleLib,
  deleteSampleLib,
  listSampleLibs,
  ragSearchSampleChunks,
  ragSearchWorldEntries,
  ragSearchCharacters,
} = require("@inkforge/storage");

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function seedProject(db, name) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, created_at, daily_goal, last_opened)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name, `/tmp/${id}`, now, 1000, null);
  return id;
}

function seedWorldEntry(db, projectId, title, content) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO world_entries (id, project_id, category, title, content, aliases, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, "artifact", title, content, "[]", "[]", now, now);
}

function seedCharacter(db, projectId, name, persona, backstory) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO characters (id, project_id, name, persona, traits, backstory, relations, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, name, persona, "{}", backstory, "[]", now, now);
}

function main() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "inkforge-rag-"));
  console.log(`[verify-rag] workspace: ${workspaceDir}`);
  let db;
  try {
    db = openDatabase({ workspaceDir });
    runMigrations(db);

    // 1. 表存在
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => r.name);
    if (!tables.includes("sample_libs") || !tables.includes("sample_chunks")) {
      fail("sample_libs / sample_chunks tables missing");
    } else {
      ok("sample_libs + sample_chunks tables exist");
    }

    // 2. seed two projects
    const p1 = seedProject(db, "Project A");
    const p2 = seedProject(db, "Project B");

    // 3. seed sample_lib in p1
    const lib1 = createSampleLib(db, {
      projectId: p1,
      title: "武林外传",
      author: "测试作者",
      chunks: [
        { ordinal: 1, chapterTitle: "第一回", text: "大侠落座道：这赤霄剑乃是上古神兵，斩魔之器。" },
        { ordinal: 2, chapterTitle: "第二回", text: "青云宗弟子皆披明光铠，胸甲分两片。" },
        { ordinal: 3, chapterTitle: "第三回", text: "无关内容，主角进城吃面。" },
      ],
    });
    if (lib1.chunkCount !== 3) {
      fail(`createSampleLib chunkCount=${lib1.chunkCount}, expected 3`);
    } else {
      ok("createSampleLib seeded 3 chunks");
    }

    // 4. seed cross-source data in p1
    seedWorldEntry(db, p1, "赤霄剑", "上古神兵，能斩魔。");
    seedCharacter(db, p1, "张三", "沉稳", "青云宗大弟子。");

    // seed irrelevant in p2 (should NOT be returned for p1 queries)
    seedWorldEntry(db, p2, "苍冥剑", "another universe.");

    // 5. RAG hits
    const sampleHits = ragSearchSampleChunks(db, p1, ["赤霄"], 5);
    if (sampleHits.length === 0) {
      fail("sample chunks search returned no hits for '赤霄'");
    } else {
      ok(`sample chunks hit '${sampleHits[0].text.slice(0, 20)}...' (${sampleHits.length} total)`);
    }

    const worldHits = ragSearchWorldEntries(db, p1, ["赤霄"], 5);
    if (worldHits.length === 0) {
      fail("world_entries search returned no hits for '赤霄'");
    } else {
      ok(`world_entries hit '${worldHits[0].title}'`);
    }

    const charHits = ragSearchCharacters(db, p1, ["青云"], 5);
    if (charHits.length === 0) {
      fail("characters search returned no hits for '青云'");
    } else {
      ok(`characters hit '${charHits[0].name}'`);
    }

    // 6. Cross-project isolation
    const leakHits = ragSearchSampleChunks(db, p2, ["赤霄"], 5);
    if (leakHits.length > 0) {
      fail(`cross-project leak: p2 query returned p1 chunks (${leakHits.length})`);
    } else {
      ok("cross-project isolation verified (p2 cannot see p1 chunks)");
    }

    const worldLeak = ragSearchWorldEntries(db, p2, ["赤霄"], 5);
    if (worldLeak.length > 0) {
      fail(`cross-project leak in world_entries: ${JSON.stringify(worldLeak)}`);
    } else {
      ok("cross-project isolation verified for world_entries");
    }

    // 7. Delete CASCADE
    deleteSampleLib(db, lib1.id);
    const afterDelete = listSampleLibs(db, p1);
    if (afterDelete.length !== 0) {
      fail(`delete failed: ${afterDelete.length} libs remaining`);
    } else {
      ok("delete sample_lib + CASCADE cleared chunks");
    }
    const orphanChunks = db
      .prepare(`SELECT COUNT(*) AS n FROM sample_chunks WHERE lib_id = ?`)
      .get(lib1.id);
    if (orphanChunks.n !== 0) {
      fail(`orphan chunks after delete: ${orphanChunks.n}`);
    } else {
      ok("no orphan chunks after lib delete");
    }
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

  if (process.exitCode && process.exitCode !== 0) {
    console.error("\x1b[31mRAG 验证失败\x1b[0m");
  } else {
    console.log("\x1b[32mRAG 验证通过\x1b[0m");
  }
}

main();
