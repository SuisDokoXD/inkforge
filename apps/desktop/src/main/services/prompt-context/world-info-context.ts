// =============================================================================
// Prompt 上下文 · World Info 注入装配
// =============================================================================
// 把"扫文本 → 查项目 entries + 已插槽卡牌 entries → 调 activator → 拼前/后块"
// 这条链路从 skill-service.ts 抽出。
//
// 目的：
//   - skill-service 只关心 Skill 业务，不直接 import storage + activator
//   - 将来 autoWriter / chat / quick-action 也要 World Info 注入时，
//     直接 import 本模块的 buildWorldInfoContext 即可
//   - 失败容错收敛到这一层，调用方拿 { before, after } 即可，永远不抛
//   - v26：选择性把 activation trace 持久化到 world_info_traces 供诊断面板使用
// =============================================================================

import { activateWorldInfo } from "@inkforge/skill-engine";
import {
  appendWorldInfoTrace,
  listSlottedPackEntriesAsWorldEntries,
  listWorldEntries,
  trimProjectTraces,
} from "@inkforge/storage";
import type { DB } from "@inkforge/storage";
import type { WorldInfoEntryTrace } from "@inkforge/shared";
import { logger } from "../logger";

export interface BuildWorldInfoContextInput {
  db: DB;
  projectId: string;
  // 扫描文本：一般是 [选段, 章节末 N 字, 渲染后的 prompt] 拼接，调用方负责
  scanText: string;
  // 候选 entry 列表上限，默认 500
  projectEntryLimit?: number;
  // v26：诊断 trace 持久化配置。传值 → 写一条到 world_info_traces 表 + 修剪。
  trace?: {
    scene: string;           // 'skill' / 'auto-writer' / 'chat' 等
    runId?: string | null;   // AutoWriter run id 等
    keep?: number;           // 每项目保留条数，默认 30
  };
}

export interface WorldInfoContextResult {
  before: string;
  after: string;
  // 命中并实际注入的 entry id（含项目自有 + 卡牌注入），便于上层 telemetry
  activatedIds: string[];
  // 命中但因预算丢弃的 entry id
  droppedIds: string[];
  // v26 · 完整 trace 数组，UI 诊断面板用
  traces: WorldInfoEntryTrace[];
  // v26 · 字符预算占用
  charsUsed: number;
  charBudget: number;
}

const EMPTY: WorldInfoContextResult = {
  before: "",
  after: "",
  activatedIds: [],
  droppedIds: [],
  traces: [],
  charsUsed: 0,
  charBudget: 0,
};

// 32 位 hex id，足够 trace 表本地唯一。
function makeTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// 装配项目级 World Info 上下文。任何异常都吞掉返回空块，不阻塞调用方。
export function buildWorldInfoContext(
  input: BuildWorldInfoContextInput,
): WorldInfoContextResult {
  try {
    const projectEntries = listWorldEntries(input.db, {
      projectId: input.projectId,
      limit: input.projectEntryLimit ?? 500,
    });
    const slottedPackEntries = listSlottedPackEntriesAsWorldEntries(
      input.db,
      input.projectId,
    );
    const allEntries = [...projectEntries, ...slottedPackEntries];
    if (allEntries.length === 0 || !input.scanText) return EMPTY;

    const activated = activateWorldInfo({
      scanText: input.scanText,
      entries: allEntries,
    });
    // after 与 atDepth 现阶段一并放到 prompt 之后
    const after = [activated.after, activated.atDepth]
      .filter((s) => s.length > 0)
      .join("\n\n");
    if (activated.droppedIds.length > 0) {
      logger.warn(
        `world-info budget dropped ${activated.droppedIds.length} entries`,
      );
    }

    // 可选：把这次激活落 trace 表给诊断面板。失败不阻塞主流程。
    if (input.trace) {
      try {
        appendWorldInfoTrace(input.db, {
          id: makeTraceId(),
          projectId: input.projectId,
          runId: input.trace.runId ?? null,
          scene: input.trace.scene,
          scanTextPreview: input.scanText.slice(0, 200),
          entries: activated.traces,
          charsUsed: activated.charsUsed,
          charBudget: activated.charBudget,
        });
        trimProjectTraces(input.db, input.projectId, input.trace.keep ?? 30);
      } catch (err) {
        logger.warn(
          `world-info trace persist failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      before: activated.before,
      after,
      activatedIds: activated.activatedIds,
      droppedIds: activated.droppedIds,
      traces: activated.traces,
      charsUsed: activated.charsUsed,
      charBudget: activated.charBudget,
    };
  } catch (err) {
    logger.warn(
      `world-info activation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return EMPTY;
  }
}
