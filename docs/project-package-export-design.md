# InkForge 项目备份包设计

InkForge 的 TXT / Markdown / HTML / DOCX / EPUB 导出只面向“作品正文”。完整迁移和备份使用独立的 `.inkforge.zip` 项目包，避免把成品发布格式和可恢复项目数据混在一起。

## 目标

- 创建一个可离线保存、可跨工作区导入的单文件项目备份。
- 导入时默认新建项目，不覆盖现有项目。
- 保留项目创作资产：项目元数据、章节正文、人物、世界观、素材、参考库、世界关系、作者批注、封面、版本备份、章节日志和审查记录。
- 不导出模型服务密钥、provider 配置、app settings、scene bindings、工作区配置、CI 输出或 proof JSON。
- 对 ZIP entry 做路径安全校验，拒绝路径穿越和明显 archive bomb。

## 文件格式

扩展名：

```text
<project>.inkforge.zip
```

包内结构：

```text
manifest.json
data/project.json
chapters/0001-<chapterId>.md
snapshots/<snapshotId>.md
assets/book-cover/<coverId>.<ext>
assets/world-pack-cover/<packId>.<ext>
```

`manifest.json` 是轻量摘要，便于后续做快速预览：

```json
{
  "format": "inkforge.project-package",
  "schemaVersion": 1,
  "exportedAt": "2026-06-14T00:00:00.000Z",
  "sourceProjectId": "uuid",
  "sourceProjectName": "项目名",
  "chapterCount": 12,
  "characterCount": 8,
  "worldEntryCount": 30,
  "materialCount": 16,
  "sampleLibCount": 2,
  "snapshotCount": 24
}
```

`data/project.json` 保存完整结构化数据：

- `project`：名称、日目标、简介、类型、标签、总纲、全局世界观。
- `chapters`：章节 SQL 行和对应 Markdown entry。
- `rows`：项目相关表的行数据。
- `assets`：封面、章节快照、世界观卡封面的 ZIP entry 映射。

## 当前 v1 包含范围

已导出并导入：

- `projects` 的项目元数据，导入后使用新项目 ID 和新目录。
- `chapters` 及每章 Markdown 正文。
- `characters`，导入时断开 `linked_tavern_card_id`，避免依赖未迁移的全局酒馆卡和模型服务。
- `world_entries`。
- `materials`。
- `outline_cards`。
- `sample_libs` / `sample_chunks`。
- `world_relationships`，导入时重映射人物和世界条目端点。
- `project_world_pack_slots` 关联的 `world_packs` / `world_pack_entries` / slot。
- `author_notes`。
- `voice_profiles`。
- `book_covers` 和封面文件。
- `chapter_origin_tags`。
- `chapter_logs` / `chapter_log_entries`。
- `chapter_snapshots` 和快照 Markdown 文件。
- `chapter_summaries`，导入时清空 `provider_id`。
- `auto_writer_runs`，导入时把 `running` / `paused` 状态改为 `stopped`。
- `review_dimensions` / `review_reports` / `review_findings`，导入时重映射章节、报告和项目级审查维度。
- `research_notes`。
- `ai_feedbacks`。
- `daily_logs`。
- `achievements_unlocked`。
- `character_letters`，导入时清空 `provider_id`。
- `tavern_sessions` / `tavern_messages`，导入时清空模型服务和酒馆卡引用。
- `world_info_traces`。

显式排除：

- `providers`。
- `provider_keys`。
- `app_settings`。
- `scene_bindings_basic` / `scene_bindings_advanced`。
- `skills` 和全局 Skill 市场状态。
- 工作区配置、keystore master、API key、模型服务地址、CI output、真实模型 proof JSON。
- 未插槽关联到当前项目的全局世界观卡。
- 未绑定到当前项目的全局酒馆卡。

## 导出流程

1. 主进程通过 `project-package:export` 接收 `projectId` 和可选 `outputPath`。
2. 如果没有 `outputPath`，弹出保存对话框，默认文件名为 `<项目名>.inkforge.zip`。
3. 查询项目相关表，读取章节 Markdown、封面文件、快照文件和插槽世界观卡封面。
4. 写入 `manifest.json`、`data/project.json` 和资产文件。
5. 返回输出路径、字节数和核心计数。

实现入口：

- `packages/shared/src/ipc/channels.ts`
- `packages/shared/src/ipc/types-scene-sample-export.ts`
- `apps/desktop/src/main/ipc/project-package.ts`
- `apps/desktop/src/main/services/project-package-service.ts`
- `apps/desktop/src/renderer/src/components/ExportDialog.tsx`

## 导入流程

1. 主进程通过 `project-package:import` 接收可选 `filePath`；没有路径时弹出打开对话框。
2. 读取 ZIP central directory，拒绝不安全 entry：
   - 空路径。
   - 反斜杠。
   - 绝对路径。
   - Windows drive path。
   - `..` 或空 path segment。
   - 超过 entry 数、单 entry 大小、总解压大小上限。
3. 读取 `manifest.json` 和 `data/project.json`，要求 `format = inkforge.project-package` 且 `schemaVersion = 1`。
4. 生成新项目 ID 和唯一项目目录。
5. 为章节、人物、世界条目、素材、样本库、快照、日志、世界观卡等所有行生成新 ID。
6. 重映射外键和 JSON 内的章节/世界观卡 ID。
7. 写入章节正文、封面、快照、世界观卡封面。
8. 按依赖顺序写入数据库。
9. 返回新项目 ID、名称、路径和核心计数。

导入不会覆盖原项目，也不会把包内路径直接写到本机文件系统。

## 安全边界

- ZIP 读取只支持 `STORED` 和 `DEFLATE`。
- entry 数上限：`2000`。
- 单 entry 解压上限：`50 MB`。
- 总解压上限：`250 MB`。
- 包内路径只允许相对 POSIX 路径。
- 导入项目目录由本机重新生成，不信任包内项目路径。
- 所有模型服务 ID 只作为历史记录弱引用保留；密钥和 provider 表完全不进入包。

## 验证

静态/结构验证：

```powershell
pnpm --filter @inkforge/desktop run verify:project-package
```

端到端验证：

```powershell
pnpm --filter @inkforge/desktop run e2e
```

`local-first-writing-loop.spec.ts` 会在写作闭环中导出 `.inkforge.zip`，再导入为新项目，并断言章节正文、人物、世界条目、素材和参考库可以读回。

## 版本策略

- v1 只接受 `schemaVersion = 1`。
- 后续 schema 增量应保持旧包可导入：新增字段使用默认值，删除字段走迁移兼容层。
- 如果未来要支持跨大版本降级导入，应在 `data/project.json` 中加入 `minAppVersion` 和迁移策略。
- 如果未来把全局 Skill、全局酒馆卡或 provider 绑定也纳入迁移，必须增加显式导入确认，不能默认带入密钥或可联网能力。
