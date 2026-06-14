# 真实模型验证流程

> 当前定位：这是手动 proof 流程，不是默认 CI。它会调用已保存的模型服务配置并产生真实费用；脚本不会读取或输出 API Key。

## 覆盖目标

这套流程覆盖两个产品问题：

- AutoWriter 在多题材、多模型上的稳定性：是否完成、是否经过 Planner / Writer / Critic / Reflector、是否落库章节/快照/日志、是否命中硬性线索、是否踩禁忌内容。
- Review 在真实模型下的主进程链路：是否能完成审查、产出 findings、导出 Markdown 报告，并对故意放入的世界观/人物口吻/过早揭露问题给出提示。

它不证明真人作者满意度、真实修改耗时、长期多模型质量稳定性，也不证明所有模型服务都可用。

## 运行命令

先构建 Electron 入口：

```powershell
pnpm --filter @inkforge/desktop run build
```

运行默认 proof：

```powershell
pnpm --filter @inkforge/desktop run proof:real-model
```

默认行为：

- 读取 InkForge 已保存的模型服务配置。
- 优先使用 AutoWriter / Review 场景绑定，其次使用当前活动服务和带 `#writing` 标签的服务。
- 最多选择 2 个可用服务；如果本机只保存了 1 个可用服务，结果会明确写出“只验证到 1 个模型服务”。
- 每个服务运行前 3 个题材样例。
- 额外运行 1 个真实模型 Review 故意冲突样例。

可调参数：

```powershell
$env:INKFORGE_REAL_MODEL_CASES="4"
$env:INKFORGE_REAL_MODEL_PROVIDER_LIMIT="2"
$env:INKFORGE_REAL_MODEL_PROVIDER_IDS="provider-id-1,provider-id-2"
$env:INKFORGE_REAL_MODEL_TARGET="520"
$env:INKFORGE_REAL_MODEL_SEGMENTS="3"
$env:INKFORGE_REAL_MODEL_REWRITES="1"
$env:INKFORGE_REAL_MODEL_TIMEOUT_MS="720000"
$env:INKFORGE_REAL_MODEL_INCLUDE_REVIEW="1"
pnpm --filter @inkforge/desktop run proof:real-model
```

输出位置：

```text
output/playwright/real-model-eval/real-model-proof-suite-*.json
```

`output/` 是忽略目录。证据文件用于本机审计，不默认提交。

## 结果解释

重点看 `aggregate`：

- `providerCount`：实际验证了几个可用模型服务。
- `autoWriterCases`：AutoWriter 总用例数。
- `autoWriterCompleted`：完成生成的用例数。
- `autoWriterPassed`：机器规则通过数。
- `avgAutoWriterScore`：硬性线索、禁忌内容、长度、分段和阶段完成度的机器分。
- `avgAutoWriterRetainRatio`：机器估算保留率，不等于真人作者保留率。
- `autoWriterRequiredMisses`：未命中的硬性线索。
- `autoWriterForbiddenHits`：命中的禁忌内容。
- `reviewCompleted` / `reviewFindingCount` / `reviewExportOk`：真实模型 Review 是否完成、是否产出 findings、是否能导出报告。

如果 `multiModelBoundary` 显示只验证到 1 个模型服务，结论只能写成“多题材稳定性”，不能写成“多模型稳定性已证明”。

## 最近一次本机结果

2026-06-14 已运行：

```text
output/playwright/real-model-eval/real-model-proof-suite-2026-06-14T05-35-16-915Z.json
```

摘要：

- 实际可用模型服务：1 个；第二个已保存服务测试返回 403 余额不足。
- AutoWriter：3 个题材，3/3 completed，机器规则 1/3 通过，平均机器评分 96，平均估算保留率 0.96。
- AutoWriter 严格短语漏传：近未来科幻漏“穹顶城”，都市现实漏“旧照相馆”。
- Review：真实模型链路 completed，产出 8 条 findings，Markdown 导出通过。
- 结论边界：本轮证明多题材和 Review 真实链路；多模型流程已支持，但当前环境没有足够可用服务来证明多模型稳定性。

## CI 边界

默认 CI 不调用真实模型，也不需要 API Key。CI 只检查 proof runner 的语法、源码入口 e2e、桌面 verify 脚本和 Windows packaged UI smoke。
