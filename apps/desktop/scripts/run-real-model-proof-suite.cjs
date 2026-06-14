#!/usr/bin/env node
/**
 * Optional real-model proof suite.
 *
 * This script launches the built Electron app, uses saved InkForge model
 * service settings, and writes evidence JSON under output/playwright.
 * It never reads or prints API key values.
 *
 * Run after `pnpm --filter @inkforge/desktop run build`:
 *   pnpm --filter @inkforge/desktop run proof:real-model
 *
 * Useful knobs:
 *   INKFORGE_REAL_MODEL_CASES=3
 *   INKFORGE_REAL_MODEL_PROVIDER_LIMIT=2
 *   INKFORGE_REAL_MODEL_PROVIDER_IDS=id1,id2
 *   INKFORGE_REAL_MODEL_TIMEOUT_MS=720000
 *   INKFORGE_REAL_MODEL_INCLUDE_REVIEW=1
 */
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const entry = path.join(appRoot, "out", "main", "index.js");
const outDir = path.join(repoRoot, "output", "playwright", "real-model-eval");
const { _electron: electron } = require(
  require.resolve("@playwright/test", { paths: [appRoot] }),
);

const caseLimit = positiveInt(process.env.INKFORGE_REAL_MODEL_CASES, 3);
const providerLimit = positiveInt(process.env.INKFORGE_REAL_MODEL_PROVIDER_LIMIT, 2);
const targetSegmentLength = positiveInt(process.env.INKFORGE_REAL_MODEL_TARGET, 520);
const maxSegments = positiveInt(process.env.INKFORGE_REAL_MODEL_SEGMENTS, 3);
const maxRewritesPerSegment = positiveInt(process.env.INKFORGE_REAL_MODEL_REWRITES, 1);
const timeoutMs = positiveInt(process.env.INKFORGE_REAL_MODEL_TIMEOUT_MS, 720_000);
const includeReview = process.env.INKFORGE_REAL_MODEL_INCLUDE_REVIEW !== "0";
const userDataDir =
  process.env.INKFORGE_REAL_MODEL_USER_DATA_DIR ||
  path.join(
    process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming"),
    "@inkforge",
    "desktop",
  );

function positiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function blueprints() {
  return [
    {
      id: "suspense-wuxia",
      namePrefix: "Proof悬疑武侠",
      meta: {
        genre: "悬疑武侠",
        subGenre: "雨夜茶馆",
        tags: ["proof-suite", "悬疑", "武侠"],
        synopsis:
          "沈青禾追查师父顾照夜失踪，来到只在雨夜开门的雨声茶馆。茶馆能传递消息，但解释真相需要交出一段真实记忆。",
        globalWorldview:
          "雨声茶馆只在雨夜开门。陆闻舟不能主动说出谜底，只能通过沉默、反问和物件引导。青松门朱砂印若为真，会有淡淡松脂味；伪造朱砂印常带药腥味。前三章不能直接揭露顾照夜的下落。",
      },
      characters: [
        ["沈青禾", "克制、警觉、少说多看；追查师父顾照夜失踪。", "青松门弟子，熟悉朱砂印和松脂味。"],
        ["阿迟", "年少持剑，冲动但忠诚，知道部分危险线索。", "多年未见后突然出现在雨声茶馆。"],
        ["陆闻舟", "茶馆主人，守规则，不能主动说谜底。", "被雨声茶馆规则束缚。"],
      ],
      worldEntries: [
        ["规则", "雨声茶馆", "只在雨夜开门；解释真相必须以真实记忆作为代价。", ["雨声茶馆", "真实记忆", "雨夜"]],
        ["信物", "青松门朱砂印", "真印带淡淡松脂味；伪印常带药腥味。", ["朱砂印", "松脂味", "药腥味"]],
      ],
      chapter: {
        title: "雨夜来信",
        initialContent:
          "## 雨夜来信\n\n雨水敲在茶馆檐角。\n\n沈青禾把湿透的斗笠放在桌边，指尖按住那封没有署名的信。封口的朱砂印被雨气洇开，却仍泛着一点极淡的松脂味。\n\n阿迟站在门边，手一直扣着剑柄。\n\n陆闻舟没有抬眼，只把一盏冷茶推到她面前。",
        outline:
          "沈青禾拆信，阿迟阻止，陆闻舟提出真实记忆作为代价。重点写人物克制、茶馆规则、松脂味与朱砂印，不揭露顾照夜下落。",
        userIdeas:
          "续写沈青禾拆信后的第一轮冲突。必须写出：阿迟叫出小名“青禾”；陆闻舟说明解释朱砂印需要一段真实记忆；沈青禾保持克制但警觉；必须出现松脂味、真实记忆、雨声茶馆。不要直接揭露师父顾照夜的去向。",
        requiredClues: [
          ["沈青禾", ["沈青禾"]],
          ["阿迟", ["阿迟"]],
          ["陆闻舟", ["陆闻舟"]],
          ["小名", ["青禾"]],
          ["松脂味", ["松脂味"]],
          ["真实记忆", ["真实记忆", "真实的记忆"]],
          ["雨声茶馆", ["雨声茶馆"]],
        ],
        forbidden: ["顾照夜就在", "顾照夜藏在", "顾照夜已经死了", "陆闻舟就是顾照夜"],
      },
    },
    {
      id: "near-future-sf",
      namePrefix: "Proof近未来科幻",
      meta: {
        genre: "近未来科幻",
        subGenre: "穹顶城失控",
        tags: ["proof-suite", "科幻", "城市"],
        synopsis:
          "工程师林澈调查穹顶城的蓝色雨事故。纪南星是负责潮汐钟的维护员，知道系统并非真正失控，但不能公开说出核心漏洞。",
        globalWorldview:
          "穹顶城靠潮汐钟调节气候和供水。蓝色雨不是自然降水，而是冷凝层被错误唤醒后的副产物。城管局禁止公开提到零号协议。故事不能把事故简单写成 AI 觉醒。",
      },
      characters: [
        ["林澈", "冷静的结构工程师，习惯先排除硬件错误。", "曾参与穹顶城旧区加固，对潮汐钟结构很熟。"],
        ["纪南星", "潮汐钟维护员，谨慎、专业，知道零号协议存在。", "父亲曾因蓝色雨事故被处分。"],
        ["许庚", "城管局调查员，表面冷硬，实际想压住恐慌。", "负责事故公关与封锁。"],
      ],
      worldEntries: [
        ["设施", "潮汐钟", "穹顶城核心设施，调节冷凝层、供水和城市气压。", ["潮汐钟", "冷凝层", "供水"]],
        ["异常", "蓝色雨", "蓝色雨是冷凝层误唤醒后的副产物，会让金属表面出现盐霜。", ["蓝色雨", "盐霜"]],
        ["禁忌", "零号协议", "零号协议与事故有关，但第一章只能给出线索，不能直接解释全部真相。", ["零号协议"]],
      ],
      chapter: {
        title: "蓝雨警报",
        initialContent:
          "## 蓝雨警报\n\n凌晨四点，穹顶城第七环的玻璃外壁开始下雨。\n\n雨水是蓝色的。\n\n林澈蹲在排水槽旁，用指腹抹过金属边缘。盐霜在他手套上留下一道发白的痕。",
        outline:
          "林澈到第七环事故现场排查蓝色雨。纪南星带来潮汐钟的异常记录，许庚要求他把事故写成普通管线故障。结尾让零号协议成为悬念。",
        userIdeas:
          "续写事故现场。必须出现林澈、纪南星、许庚、穹顶城、潮汐钟、蓝色雨、盐霜、零号协议。林澈要用工程师方式推理；纪南星不能直接说出全部真相；不要把事故写成 AI 觉醒。",
        requiredClues: [
          ["林澈", ["林澈"]],
          ["纪南星", ["纪南星"]],
          ["许庚", ["许庚"]],
          ["穹顶城", ["穹顶城"]],
          ["潮汐钟", ["潮汐钟"]],
          ["蓝色雨", ["蓝色雨", "蓝雨"]],
          ["盐霜", ["盐霜"]],
          ["零号协议", ["零号协议"]],
        ],
        forbidden: ["AI觉醒", "人工智能觉醒", "机器人叛乱", "系统有了自我意识"],
      },
    },
    {
      id: "urban-realistic",
      namePrefix: "Proof都市现实",
      meta: {
        genre: "都市现实",
        subGenre: "旧街更新",
        tags: ["proof-suite", "都市", "现实"],
        synopsis:
          "许知遥回到海棠巷处理旧照相馆拆迁资料，发现奶奶留下的一盘录音带。周砚代表更新项目组，却不愿让她把旧街写成单纯怀旧。",
        globalWorldview:
          "海棠巷正在城市更新，旧照相馆是街区记忆的入口。录音带里记录了二十年前一次未公开的听证会。故事要克制现实，不写成总裁爽文或悬浮复仇。",
      },
      characters: [
        ["许知遥", "纪录片剪辑师，外冷内软，回乡处理奶奶遗物。", "小时候在海棠巷旧照相馆长大。"],
        ["周砚", "城市更新项目协调人，理性克制，不完全站在开发方。", "曾是旧照相馆常客。"],
        ["奶奶", "已经去世，只通过遗物、照片和录音带留下影响。", "旧照相馆主人。"],
      ],
      worldEntries: [
        ["地点", "海棠巷", "正在城市更新的老街，旧照相馆位于巷口。", ["海棠巷", "城市更新"]],
        ["物件", "旧照相馆", "保存着街坊旧照片和奶奶留下的暗房。", ["旧照相馆", "暗房"]],
        ["线索", "录音带", "录着二十年前一次未公开的听证会，不能第一章就解释全部往事。", ["录音带", "听证会"]],
      ],
      chapter: {
        title: "暗房里的录音带",
        initialContent:
          "## 暗房里的录音带\n\n许知遥推开旧照相馆后门时，暗房里还有一股淡淡的显影液味。\n\n海棠巷的拆迁公告贴在玻璃门上，边角被雨水卷起。\n\n柜台后面，奶奶常坐的木椅空着。",
        outline:
          "许知遥回到海棠巷，整理旧照相馆遗物。周砚来催资料交接，她在暗房里发现录音带，录音提到二十年前的听证会。",
        userIdeas:
          "续写许知遥整理旧照相馆。必须出现许知遥、周砚、奶奶、海棠巷、旧照相馆、暗房、录音带、二十年前听证会。语气克制现实，不要写成总裁爽文、悬浮复仇或突然恋爱。",
        requiredClues: [
          ["许知遥", ["许知遥"]],
          ["周砚", ["周砚"]],
          ["奶奶", ["奶奶"]],
          ["海棠巷", ["海棠巷"]],
          ["旧照相馆", ["旧照相馆"]],
          ["暗房", ["暗房"]],
          ["录音带", ["录音带", "磁带"]],
          ["二十年前听证会", ["二十年前", "听证会"]],
        ],
        forbidden: ["霸道总裁", "复仇归来", "一夜之间", "突然吻", "豪门"],
      },
    },
    {
      id: "fantasy-court",
      namePrefix: "Proof宫廷奇幻",
      meta: {
        genre: "宫廷奇幻",
        subGenre: "失效星图",
        tags: ["proof-suite", "奇幻", "宫廷"],
        synopsis:
          "女史闻星澜负责修补王朝星图，却发现星图每次失效都与禁庭钟声同步。摄政王谢危川想隐瞒旧王朝契约。",
        globalWorldview:
          "王朝靠星图校准季节。禁庭钟声不能直接唤醒亡灵，只会改变星图墨线。第一章不能揭露摄政王的全部动机。",
      },
      characters: [
        ["闻星澜", "谨慎的女史，擅长用史料互证，不轻易表态。", "出身旧史馆，知道星图修补法。"],
        ["谢危川", "摄政王，言辞克制，试图压住宫中传言。", "参与过上一轮星图封存。"],
        ["小满", "宫中报时童子，记得异常钟声的细节。", "夜里见过星图墨线逆流。"],
      ],
      worldEntries: [
        ["器物", "王朝星图", "星图用银墨画成，墨线会随季节和契约变动。", ["星图", "银墨"]],
        ["地点", "禁庭钟楼", "钟声会影响星图墨线，但不能召唤亡灵。", ["禁庭", "钟声"]],
      ],
      chapter: {
        title: "银墨逆流",
        initialContent:
          "## 银墨逆流\n\n闻星澜在天亮前赶到史馆。\n\n案上的王朝星图已经干透，银墨却像活水一样从北境倒流回禁庭。\n\n远处钟楼敲了第三声，小满站在门外，不敢进来。",
        outline:
          "闻星澜检查星图，谢危川要求封存异象，小满说出钟声次数。重点写史料互证、银墨逆流和禁庭钟声。",
        userIdeas:
          "续写史馆冲突。必须出现闻星澜、谢危川、小满、王朝星图、银墨、禁庭钟声、史馆。不要写成召唤亡灵，也不要揭露谢危川全部动机。",
        requiredClues: [
          ["闻星澜", ["闻星澜"]],
          ["谢危川", ["谢危川"]],
          ["小满", ["小满"]],
          ["王朝星图", ["王朝星图", "星图"]],
          ["银墨", ["银墨"]],
          ["禁庭钟声", ["禁庭", "钟声"]],
          ["史馆", ["史馆"]],
        ],
        forbidden: ["召唤亡灵", "亡灵复活", "谢危川真正目的是", "全部动机"],
      },
    },
  ];
}

async function runInRenderer(payload) {
  const api = window.inkforge;

  const countChars = (text) => String(text || "").replace(/\s+/g, "").length;
  const paragraphCount = (text) =>
    String(text || "").split(/\n\s*\n/).filter((item) => item.trim()).length;
  const requiredList = (chapter) =>
    chapter.requiredClues.map(([label, terms]) => ({ label, terms }));

  function evaluateText(text, chapter, phases, done) {
    const requiredHits = {};
    for (const clue of requiredList(chapter)) {
      requiredHits[clue.label] = clue.terms.some((term) => text.includes(term));
    }
    const requiredCount = Object.values(requiredHits).filter(Boolean).length;
    const requiredTotal = chapter.requiredClues.length;
    const forbiddenHits = chapter.forbidden.filter((item) => text.includes(item));
    const chars = countChars(text);
    const paragraphs = paragraphCount(text);
    const phaseNames = phases.map((item) => item.phase);
    const phaseOk =
      phaseNames.includes("planner") &&
      phaseNames.includes("writer") &&
      phaseNames.includes("critic") &&
      phaseNames.includes("reflector") &&
      phaseNames.includes("done");
    const completionOk = done.status === "completed";
    const coverageScore = (requiredCount / requiredTotal) * 50;
    const forbiddenScore = forbiddenHits.length === 0 ? 20 : 0;
    const lengthScore = chars >= 1200 ? 15 : chars >= 800 ? 10 : chars >= 500 ? 5 : 0;
    const paragraphScore = paragraphs >= 8 ? 10 : paragraphs >= 4 ? 6 : paragraphs >= 2 ? 3 : 0;
    const phaseScore = phaseOk ? 5 : 0;
    const score = Math.max(
      0,
      Math.min(100, Math.round(coverageScore + forbiddenScore + lengthScore + paragraphScore + phaseScore)),
    );
    let retainRatio = score / 100;
    if (!completionOk) retainRatio = Math.min(retainRatio, 0.4);
    if (forbiddenHits.length > 0) retainRatio = Math.min(retainRatio, 0.55);
    if (requiredCount / requiredTotal < 0.75) retainRatio = Math.min(retainRatio, 0.7);
    return {
      pass: completionOk && phaseOk && forbiddenHits.length === 0 && requiredCount === requiredTotal && score >= 85,
      score,
      estimatedRetainRatio: Number(retainRatio.toFixed(2)),
      generatedChars: chars,
      paragraphCount: paragraphs,
      requiredCoverage: `${requiredCount}/${requiredTotal}`,
      requiredHits,
      forbiddenHits,
      phaseOk,
      completionOk,
    };
  }

  function orderedProviderCandidates(providers, scene, settings, requestedIds) {
    const byId = new Map(providers.map((item) => [item.id, item]));
    if (requestedIds.length > 0) return requestedIds.map((id) => byId.get(id)).filter(Boolean);
    const rows = scene ? (scene.mode === "advanced" ? scene.advanced : scene.basic) : [];
    const autoWriter = rows.find((item) => item.sceneKey === "auto-writer" && item.providerId);
    const review = rows.find((item) => item.sceneKey === "review" && item.providerId);
    const ids = [
      autoWriter?.providerId,
      review?.providerId,
      settings.activeProviderId,
      ...providers.filter((p) => p.tags?.includes("#writing")).map((p) => p.id),
      ...providers.map((p) => p.id),
    ].filter(Boolean);
    const seen = new Set();
    return ids
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return byId.has(id);
      })
      .map((id) => byId.get(id));
  }

  async function selectProviders() {
    const providers = await api.provider.list();
    if (!providers.length) throw new Error("no saved provider");
    const scene = await api.sceneBinding.list().catch(() => null);
    const settings = await api.settings.get({}).catch(() => ({}));
    const requestedIds = payload.providerIds;
    const candidates = orderedProviderCandidates(providers, scene, settings, requestedIds);
    const selected = [];
    const tests = [];
    for (const provider of candidates) {
      const test = await api.provider.test({ id: provider.id });
      tests.push({
        providerId: provider.id,
        label: provider.label,
        vendor: provider.vendor,
        ok: test.ok,
        durationMs: test.durationMs,
        error: test.error,
      });
      if (!test.ok) continue;
      const rows = scene ? (scene.mode === "advanced" ? scene.advanced : scene.basic) : [];
      const binding = rows.find(
        (item) =>
          (item.sceneKey === "auto-writer" || item.sceneKey === "review") &&
          item.providerId === provider.id,
      );
      selected.push({
        provider,
        model: binding?.model || provider.defaultModel,
        providerTest: tests[tests.length - 1],
      });
      if (selected.length >= payload.providerLimit) break;
    }
    if (!selected.length) {
      throw new Error(`no usable provider: ${tests.map((item) => item.error).filter(Boolean).join("; ")}`);
    }
    return { selected, providerTests: tests };
  }

  async function setupProject(blueprint) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const project = await api.project.create({
      name: `${blueprint.namePrefix}-${stamp}`,
      dailyGoal: 3000,
    });
    await api.outlineGen.updateProjectMeta({ projectId: project.id, ...blueprint.meta });
    for (const [name, persona, backstory] of blueprint.characters) {
      await api.novelCharacter.create({
        projectId: project.id,
        name,
        persona,
        traits: {},
        backstory,
      });
    }
    for (const [category, title, content, keys] of blueprint.worldEntries) {
      await api.world.create({
        projectId: project.id,
        category,
        title,
        content,
        aliases: [],
        tags: ["proof-suite"],
        keys,
        position: "before",
        probability: 100,
        constant: true,
      });
    }
    const chapter = await api.chapter.create({
      projectId: project.id,
      parentId: null,
      title: blueprint.chapter.title,
      order: 1,
      status: "draft",
      filePath: "",
    });
    await api.chapter.update({
      id: chapter.id,
      content: blueprint.chapter.initialContent,
      wordCount: countChars(blueprint.chapter.initialContent),
    });
    await api.outline.create({
      projectId: project.id,
      chapterId: chapter.id,
      title: `${blueprint.chapter.title} 大纲`,
      content: blueprint.chapter.outline,
      status: "planned",
      order: 1,
    });
    return { project, chapter };
  }

  async function waitForAutoWriter(runId) {
    return Promise.race([
      new Promise((resolve) => {
        const off = api.autoWriter.onDone((event) => {
          if (event.runId === runId) {
            off();
            resolve(event);
          }
        });
      }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ runId, status: "timeout", error: `timeout after ${payload.timeoutMs}ms` }), payload.timeoutMs),
      ),
    ]);
  }

  async function runAutoWriterCase(blueprint, selected) {
    const ids = await setupProject(blueprint);
    const phases = [];
    let runId = "";
    const offPhase = api.autoWriter.onPhase((event) => {
      if (!runId || event.runId === runId) {
        phases.push({
          phase: event.phase,
          segmentIndex: event.segmentIndex,
          rewriteCount: event.rewriteCount,
          emittedAt: event.emittedAt,
        });
      }
    });
    const startedAt = performance.now();
    const started = await api.autoWriter.start({
      projectId: ids.project.id,
      chapterId: ids.chapter.id,
      userIdeas: blueprint.chapter.userIdeas,
      agents: [{ role: "writer", providerId: selected.provider.id, model: selected.model }],
      targetSegmentLength: payload.targetSegmentLength,
      maxSegments: payload.maxSegments,
      maxRewritesPerSegment: payload.maxRewritesPerSegment,
      enableOocGate: true,
      speedMode: "quality",
    });
    runId = started.runId;
    const done = await waitForAutoWriter(runId);
    offPhase();
    const durationMs = Math.round(performance.now() - startedAt);
    const updated = await api.chapter.read({ id: ids.chapter.id });
    const text = String(updated.content || "")
      .slice(String(blueprint.chapter.initialContent || "").length)
      .trim();
    const snapshots = await api.snapshot.list({ chapterId: ids.chapter.id, runId, limit: 20 });
    const logs = await api.chapterLog.list({ chapterId: ids.chapter.id, limit: 20 });
    return {
      providerId: selected.provider.id,
      providerLabel: selected.provider.label,
      model: selected.model,
      caseId: blueprint.id,
      genre: blueprint.meta.genre,
      projectId: ids.project.id,
      chapterId: ids.chapter.id,
      runId,
      durationMs,
      done,
      phaseCount: phases.length,
      snapshotCount: snapshots.length,
      logCount: logs.length,
      evaluation: evaluateText(text, blueprint.chapter, phases, done),
    };
  }

  async function waitForReview(reportId) {
    return Promise.race([
      new Promise((resolve) => {
        const off = api.review.onDone((event) => {
          if (event.reportId === reportId) {
            off();
            resolve(event);
          }
        });
      }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ reportId, status: "timeout", error: `timeout after ${payload.timeoutMs}ms` }), payload.timeoutMs),
      ),
    ]);
  }

  async function runReviewProof(selected) {
    const blueprint = {
      id: "review-deliberate-conflict",
      namePrefix: "Proof真实审稿",
      meta: {
        genre: "悬疑奇幻",
        subGenre: "钟楼契约",
        tags: ["proof-suite", "review"],
        synopsis: "闻星澜调查王朝星图失效。史馆规则要求星图只能在黄昏校准。",
        globalWorldview:
          "王朝星图只能在黄昏校准；禁庭钟声只能改变银墨走向，不能召唤亡灵。闻星澜说话克制，不会突然热血宣言。",
      },
      characters: [
        ["闻星澜", "谨慎、克制，习惯用史料互证。", "旧史馆女史，负责修补王朝星图。"],
        ["谢危川", "摄政王，克制、善于隐瞒。", "参与过上一轮星图封存。"],
      ],
      worldEntries: [
        ["规则", "星图校准", "王朝星图只能在黄昏校准，午夜校准会导致银墨错位。", ["星图", "黄昏", "银墨"]],
        ["禁忌", "禁庭钟声", "禁庭钟声只能改变银墨走向，不能召唤亡灵。", ["禁庭钟声", "亡灵"]],
      ],
      chapter: {
        title: "午夜校准",
        initialContent:
          "## 午夜校准\n\n闻星澜一脚踢开史馆大门，拍着桌子大喊：“所有人都听我的，我今晚就要逆天改命！”\n\n她在午夜把王朝星图铺开，用禁庭钟声召唤出三名亡灵，让亡灵替她指出谢危川的全部阴谋。\n\n谢危川站在旁边，忽然坦白自己从一开始就想毁掉星图，还说黄昏校准的规则完全不存在。\n\n银墨在纸上没有任何变化，仿佛此前所有关于星图的设定都只是误会。",
        outline: "这段故意包含人物口吻突变、世界观规则冲突和过早揭露，用于验证 Review 是否能产出真实 findings。",
        userIdeas: "",
        requiredClues: [],
        forbidden: [],
      },
    };
    const ids = await setupProject(blueprint);
    const dims = await api.reviewDim.list({ projectId: ids.project.id });
    const dimensionIds = dims
      .filter((dim) => dim.kind === "builtin")
      .slice(0, 5)
      .map((dim) => dim.id);
    const progress = [];
    let reportId = "";
    const offProgress = api.review.onProgress((event) => {
      if (!reportId || event.reportId === reportId) {
        progress.push({
          phase: event.phase,
          processedChapters: event.processedChapters,
          totalChapters: event.totalChapters,
          partialFindings: event.partialFindings,
          emittedAt: event.emittedAt,
        });
      }
    });
    const startedAt = performance.now();
    const started = await api.review.run({
      projectId: ids.project.id,
      rangeKind: "chapter",
      rangeIds: [ids.chapter.id],
      dimensionIds,
      providerId: selected.provider.id,
      model: selected.model,
    });
    reportId = started.reportId;
    const done = await waitForReview(reportId);
    offProgress();
    const durationMs = Math.round(performance.now() - startedAt);
    const report = await api.review.get({ reportId });
    const exported = await api.review.export({ reportId }).catch((error) => ({
      fileName: null,
      content: "",
      format: "md",
      error: error instanceof Error ? error.message : String(error),
    }));
    const findings = report?.findings || [];
    const joined = findings
      .map((item) => `${item.severity} ${item.excerpt} ${item.suggestion}`)
      .join("\n");
    return {
      providerId: selected.provider.id,
      providerLabel: selected.provider.label,
      model: selected.model,
      projectId: ids.project.id,
      chapterId: ids.chapter.id,
      reportId,
      durationMs,
      done,
      progress,
      findingCount: findings.length,
      severityTotals: report?.report?.summary?.totals || null,
      exportOk: Boolean(exported.content && exported.content.includes("全文审查报告")),
      exportChars: countChars(exported.content || ""),
      heuristicHits: {
        mentionsCharacterVoice: /闻星澜|口吻|人物|宣言/.test(joined),
        mentionsWorldRule: /星图|黄昏|午夜|禁庭|亡灵|世界/.test(joined),
        mentionsEarlyReveal: /谢危川|揭露|阴谋|动机|坦白/.test(joined),
      },
    };
  }

  function aggregate(autoWriter, review, selected, providerTests) {
    const passed = autoWriter.filter((item) => item.evaluation.pass).length;
    const completed = autoWriter.filter((item) => item.done.status === "completed").length;
    return {
      providerCount: selected.length,
      selectedProviders: selected.map((item) => ({
        id: item.provider.id,
        label: item.provider.label,
        vendor: item.provider.vendor,
        model: item.model,
      })),
      providerTests,
      autoWriterCases: autoWriter.length,
      autoWriterCompleted: completed,
      autoWriterPassed: passed,
      avgAutoWriterScore: Math.round(
        autoWriter.reduce((sum, item) => sum + item.evaluation.score, 0) / Math.max(1, autoWriter.length),
      ),
      avgAutoWriterRetainRatio: Number(
        (
          autoWriter.reduce((sum, item) => sum + item.evaluation.estimatedRetainRatio, 0) /
          Math.max(1, autoWriter.length)
        ).toFixed(2),
      ),
      autoWriterForbiddenHits: autoWriter.flatMap((item) =>
        item.evaluation.forbiddenHits.map((hit) => `${item.providerLabel}/${item.caseId}:${hit}`),
      ),
      autoWriterRequiredMisses: autoWriter.flatMap((item) =>
        Object.entries(item.evaluation.requiredHits || {})
          .filter(([, ok]) => !ok)
          .map(([label]) => `${item.providerLabel}/${item.caseId}:${label}`),
      ),
      reviewCompleted: review ? review.done.status === "completed" : false,
      reviewFindingCount: review ? review.findingCount : 0,
      reviewExportOk: review ? review.exportOk : false,
      multiModelBoundary:
        selected.length >= 2
          ? "ran multiple saved usable providers/models"
          : "only one saved usable provider/model was selected or available",
    };
  }

  await api.settings.set({ updates: { onboardingCompleted: true } });
  const providerIds = payload.providerIds;
  const { selected, providerTests } = await selectProviders();
  const selectedBlueprints = payload.blueprints.slice(0, payload.caseLimit);
  const autoWriter = [];
  for (const provider of selected) {
    for (const blueprint of selectedBlueprints) {
      autoWriter.push(await runAutoWriterCase(blueprint, provider));
    }
  }
  const review = payload.includeReview ? await runReviewProof(selected[0]) : null;
  return {
    runAt: new Date().toISOString(),
    config: {
      caseLimit: payload.caseLimit,
      providerLimit: payload.providerLimit,
      requestedProviderIds: providerIds,
      targetSegmentLength: payload.targetSegmentLength,
      maxSegments: payload.maxSegments,
      maxRewritesPerSegment: payload.maxRewritesPerSegment,
      timeoutMs: payload.timeoutMs,
      includeReview: payload.includeReview,
    },
    aggregate: aggregate(autoWriter, review, selected, providerTests),
    autoWriter,
    review,
    scoringNote:
      "Machine scores are deterministic proxies from clue coverage, forbidden hits, length, paragraphing, and stage completion; they are not human author quality scores.",
  };
}

async function main() {
  if (!fs.existsSync(entry)) {
    throw new Error(`Built Electron entry not found: ${entry}. Run pnpm --filter @inkforge/desktop run build first.`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const providerIds = (process.env.INKFORGE_REAL_MODEL_PROVIDER_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const app = await electron.launch({
    args: [entry, `--user-data-dir=${userDataDir}`],
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.inkforge?.autoWriter && window.inkforge?.review), {
      timeout: 60_000,
    });
    const result = await page.evaluate(runInRenderer, {
      blueprints: blueprints(),
      caseLimit,
      providerLimit,
      providerIds,
      targetSegmentLength,
      maxSegments,
      maxRewritesPerSegment,
      timeoutMs,
      includeReview,
    });
    const jsonPath = path.join(
      outDir,
      `real-model-proof-suite-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
    console.log(JSON.stringify({ jsonPath, config: result.config, aggregate: result.aggregate }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
