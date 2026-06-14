import { test, expect, _electron as electron } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const APP_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(APP_ROOT, "..", "..");
const ENTRY = path.join(APP_ROOT, "out", "main", "index.js");
const AUDIT_DIR = path.join(REPO_ROOT, "output", "visual-audit", "local-first-loop");

async function launch() {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const appData = path.join(AUDIT_DIR, "appdata");
  fs.mkdirSync(appData, { recursive: true });
  const app = await electron.launch({
    args: [ENTRY, `--user-data-dir=${appData}`],
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: appData,
      NODE_ENV: "test",
      INKFORGE_TEST_MODE: "1",
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  return { app, win };
}

test("local-first writing loop persists chapters, book assets, snapshots, logs, and export", async () => {
  const exportPath = path.join(AUDIT_DIR, "local-first-loop.md");
  const packagePath = path.join(AUDIT_DIR, "local-first-loop.inkforge.zip");
  fs.rmSync(exportPath, { force: true });
  fs.rmSync(packagePath, { force: true });

  const { app, win } = await launch();
  await win.waitForFunction(() => Boolean(window.inkforge?.project && window.inkforge?.projectPackage));

  const result = await win.evaluate(async ({ exportPath, packagePath }) => {
    const api = window.inkforge;
    await api.settings.set({ updates: { onboardingCompleted: true, theme: "paper" } });

    const project = await api.project.create({
      name: `本地闭环验证-${Date.now()}`,
      dailyGoal: 1200,
    });
    const projectMeta = await api.outlineGen.updateProjectMeta({
      projectId: project.id,
      synopsis: "沈青禾在雨夜茶馆接下一封失踪来信，必须在天亮前找出送信人。",
      genre: "悬疑",
      subGenre: "武侠",
      tags: ["本地优先", "验证"],
      globalWorldview: "雨声茶馆只在暴雨夜开门，进入者必须交出一段真实记忆。",
    });

    const chapter = await api.chapter.create({
      projectId: project.id,
      title: "雨夜来客",
      filePath: "",
      wordCount: 0,
    });
    const content = [
      "# 雨夜来客",
      "",
      "沈青禾推开茶馆的木门时，雨正从檐角连成一线。",
      "",
      "掌柜陆闻舟没有问她从哪里来，只把一封潮湿的信推到灯下。信封上没有署名，封口处却压着她师门独有的朱砂印。",
      "",
      "她认得那枚印。三年前，师父就是带着同样的印泥离开青松门，此后再也没有回头。",
      "",
      "角落里的少年阿迟抱剑不语，像是早知道她会在这一刻看见那封信。",
    ].join("\n");
    const savedChapter = await api.chapter.update({
      id: chapter.id,
      content,
      wordCount: content.replace(/\s+/g, "").length,
    });
    const readBack = await api.chapter.read({ id: chapter.id });

    const character = await api.novelCharacter.create({
      projectId: project.id,
      name: "沈青禾",
      persona: "谨慎、克制，习惯先观察再出剑。",
      traits: { goal: "找出送信人", taboo: "不轻易提师父失踪" },
      backstory: "青松门弟子，三年前师父失踪后一直独自查访。",
    });
    const world = await api.world.create({
      projectId: project.id,
      category: "地点",
      title: "雨声茶馆",
      content: "只在暴雨夜开门。掌柜陆闻舟会向每位来客索取一段真实记忆作为茶资。",
      aliases: ["茶馆", "雨夜茶馆"],
      tags: ["舞台", "规则"],
      keys: ["茶馆", "暴雨", "记忆"],
      position: "before",
      probability: 100,
    });
    const material = await api.material.create({
      projectId: project.id,
      kind: "plot",
      title: "第一章目标",
      content: "让沈青禾发现师父失踪与雨声茶馆有关，并埋下阿迟提前知情的疑点。",
      tags: ["第一章", "伏笔"],
    });
    const sample = await api.sampleLib.create({
      projectId: project.id,
      title: "雨夜文风样本",
      author: "InkForge validation",
      notes: "用于验证样本库结构化保存，不参与真实模型调用。",
      chunks: [
        {
          ordinal: 1,
          chapterTitle: "雨夜",
          text: "雨声贴着瓦片往下滑，灯影在桌面上轻轻摇晃。",
        },
      ],
    });

    const snapshot = await api.snapshot.create({
      projectId: project.id,
      chapterId: chapter.id,
      label: "本地闭环验证",
      kind: "manual",
    });
    const snapshots = await api.snapshot.list({ chapterId: chapter.id, limit: 5 });
    const snapshotBody = await api.snapshot.get({ snapshotId: snapshot.snapshot.id });

    const log = await api.chapterLog.appendManual({
      projectId: project.id,
      chapterId: chapter.id,
      content: "完成本地写作闭环：章节、人物、世界观、素材、快照和导出。",
    });
    const logs = await api.chapterLog.list({ chapterId: chapter.id, limit: 5 });

    const chapterMd = await api.chapter.exportMd({ id: chapter.id });
    const exported = await api.projectExport.md({
      projectId: project.id,
      outputPath: exportPath,
      fileName: "local-first-loop",
    });
    const packageExported = await api.projectPackage.export({
      projectId: project.id,
      outputPath: packagePath,
      fileName: "local-first-loop",
    });
    const imported = await api.projectPackage.import({
      filePath: packagePath,
      nameOverride: `Imported local-first-loop ${Date.now()}`,
    });
    const importedChapters = await api.chapter.list({ projectId: imported.projectId });
    const importedRead = await api.chapter.read({ id: importedChapters[0].id });
    const importedCharacters = await api.novelCharacter.list({ projectId: imported.projectId });
    const importedWorlds = await api.world.list({ projectId: imported.projectId });
    const importedMaterials = await api.material.list({ projectId: imported.projectId });
    const importedSamples = await api.sampleLib.list({ projectId: imported.projectId });

    const characters = await api.novelCharacter.list({ projectId: project.id });
    const worlds = await api.world.list({ projectId: project.id });
    const materials = await api.material.list({ projectId: project.id });
    const samples = await api.sampleLib.list({ projectId: project.id });

    localStorage.setItem(
      "inkforge-app-store",
      JSON.stringify({
        state: {
          currentProjectId: project.id,
          currentChapterId: chapter.id,
          mainView: "writing",
          rightPanel: "timeline",
          terminalHeight: 240,
          autoWriterConfig: null,
        },
        version: 1,
      }),
    );

    return {
      projectId: project.id,
      projectName: projectMeta.name,
      synopsis: projectMeta.synopsis,
      globalWorldview: projectMeta.globalWorldview,
      chapterId: chapter.id,
      chapterTitle: savedChapter.title,
      chapterWordCount: savedChapter.wordCount,
      readContent: readBack.content,
      characterName: character.name,
      worldTitle: world.title,
      materialTitle: material.title,
      sampleTitle: sample.title,
      snapshotCount: snapshots.length,
      snapshotContent: snapshotBody.content,
      logContent: log.content,
      logCount: logs.length,
      chapterMdContent: chapterMd.content,
      exportByteCount: exported.byteCount,
      exportChapterCount: exported.chapterCount,
      packageByteCount: packageExported.byteCount,
      packageChapterCount: packageExported.chapterCount,
      importedProjectId: imported.projectId,
      importedChapterCount: importedChapters.length,
      importedReadContent: importedRead.content,
      importedCharactersCount: importedCharacters.length,
      importedWorldsCount: importedWorlds.length,
      importedMaterialsCount: importedMaterials.length,
      importedSamplesCount: importedSamples.length,
      charactersCount: characters.length,
      worldsCount: worlds.length,
      materialsCount: materials.length,
      samplesCount: samples.length,
    };
  }, { exportPath, packagePath });

  expect(result.projectName).toContain("本地闭环验证");
  expect(result.synopsis).toContain("沈青禾");
  expect(result.globalWorldview).toContain("雨声茶馆");
  expect(result.chapterTitle).toBe("雨夜来客");
  expect(result.chapterWordCount).toBeGreaterThan(100);
  expect(result.readContent).toContain("师门独有的朱砂印");
  expect(result.characterName).toBe("沈青禾");
  expect(result.worldTitle).toBe("雨声茶馆");
  expect(result.materialTitle).toBe("第一章目标");
  expect(result.sampleTitle).toBe("雨夜文风样本");
  expect(result.charactersCount).toBe(1);
  expect(result.worldsCount).toBe(1);
  expect(result.materialsCount).toBe(1);
  expect(result.samplesCount).toBe(1);
  expect(result.snapshotCount).toBeGreaterThanOrEqual(1);
  expect(result.snapshotContent).toContain("雨正从檐角连成一线");
  expect(result.logContent).toContain("本地写作闭环");
  expect(result.logCount).toBeGreaterThanOrEqual(1);
  expect(result.chapterMdContent).toContain("雨夜来客");
  expect(result.exportChapterCount).toBe(1);
  expect(result.exportByteCount).toBeGreaterThan(100);
  expect(result.packageChapterCount).toBe(1);
  expect(result.packageByteCount).toBeGreaterThan(500);
  expect(result.importedProjectId).toBeTruthy();
  expect(result.importedChapterCount).toBe(1);
  expect(result.importedReadContent).toBe(result.readContent);
  expect(result.importedCharactersCount).toBe(1);
  expect(result.importedWorldsCount).toBe(1);
  expect(result.importedMaterialsCount).toBe(1);
  expect(result.importedSamplesCount).toBe(1);
  expect(fs.existsSync(exportPath)).toBeTruthy();
  expect(fs.existsSync(packagePath)).toBeTruthy();
  expect(fs.readFileSync(exportPath, "utf8")).toContain("师门独有的朱砂印");

  await win.reload({ waitUntil: "domcontentloaded" });
  await expect(win.getByText("雨夜来客").first()).toBeVisible();
  await win.screenshot({
    path: path.join(AUDIT_DIR, "local-first-writing-loop.png"),
    fullPage: true,
  });

  await app.close();
});
