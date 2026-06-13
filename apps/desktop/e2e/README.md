# M5-G · E2E 冒烟测试

> 用 Playwright + Electron driver。运行前会先执行 `electron-vite build`。

## 跑法

```powershell
pnpm --filter @inkforge/desktop run e2e:install   # 首次：装 Chromium
pnpm --filter @inkforge/desktop run e2e           # 跑测试
$env:INKFORGE_RUN_PACKAGED_UI="1"; pnpm --filter @inkforge/desktop run e2e:packaged
```

## 覆盖路径

1. 启动到主窗口：body 出现 "InkForge" 字样
2. 欢迎向导可完成（点"下一步" 5 次）
3. 新建项目 + 章节 + 写 200 字触发 Timeline
4. Skill 页能打开并列出预设
5. 审查页 ▶ 一键审查（走 INKFORGE_MOCK_LLM）出至少一条 finding
6. 诊断摘要按钮能把 "诊断摘要" 复制到剪贴板
7. 本地写作闭环：通过 preload API 创建项目元数据、章节正文、人物、世界条目、素材、样本库、手动快照、章节日志，并导出 Markdown；重载后确认章节仍可见。
8. AutoWriter / Review mock LLM 闭环：`INKFORGE_MOCK_LLM=1` 时走真实主进程模型入口，完成 Planner/Writer/Critic/Reflector、快照、章节日志和 Review 报告。
9. Packaged UI smoke：启动 Windows unpacked `InkForge.exe`，通过 `--remote-debugging-port` 用 Playwright CDP 连接真实打包 renderer，断言主界面、preload API 和本地数据库初始化正常。

## TODO

- 在关键 UI 节点加 `data-testid`（`onboarding-next` / `activity-skill` / `activity-review` /
  `open-settings` / `diag-copy`）
- 用固定真实模型跑 AutoWriter 质量样例，记录保留率、设定错误和修改成本。
- 在 CI 中加 `e2e` job（需要额外安装 Chromium，CI 上用 `xvfb-run`）
