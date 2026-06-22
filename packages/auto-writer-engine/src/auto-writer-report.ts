import type { AutoWriterRunReport } from "./types";

function yesNo(value: boolean): string {
  return value ? "已满足" : "需复核";
}

function statusText(status: NonNullable<AutoWriterRunReport["chapterQuality"]>["status"]): string {
  if (status === "pass") return "通过";
  if (status === "warn") return "有提醒";
  if (status === "fail") return "需复核";
  return "未运行";
}

function conflictStatusText(
  status: NonNullable<AutoWriterRunReport["writingConflict"]>["status"],
): string {
  if (status === "completed") return "已分析";
  if (status === "failed") return "分析未完成";
  if (status === "not-needed") return "无需分析";
  return "未运行";
}

export function renderAutoWriterRunReportMarkdown(report: AutoWriterRunReport): string {
  const lines: string[] = ["# 本次写作报告"];

  lines.push("", "## 要求执行");
  if (report.constraints.requiredTerms.length === 0 && report.constraints.forbiddenTerms.length === 0) {
    lines.push("- 没有识别到需要逐词检查的必写词或禁止词。");
  } else {
    for (const item of report.constraints.requiredTerms) {
      const segmentText = item.segmentIndexes.length > 0
        ? `；出现于第 ${item.segmentIndexes.map((index) => index + 1).join("、")} 段`
        : "";
      lines.push(`- 必写「${item.term}」：${yesNo(item.matched)}${segmentText}`);
    }
    for (const item of report.constraints.forbiddenTerms) {
      const segmentText = item.segmentIndexes.length > 0
        ? `；出现于第 ${item.segmentIndexes.map((index) => index + 1).join("、")} 段`
        : "";
      lines.push(`- 禁止「${item.term}」：${item.matched ? "需删除" : "未出现"}${segmentText}`);
    }
  }

  if (report.plotCommitments.length > 0) {
    lines.push("", "## 剧情承诺");
    for (const item of report.plotCommitments) {
      const terms = item.exactTerms.length > 0
        ? `；精确词：${item.exactTerms.map((term) => `「${term}」`).join("、")}`
        : "";
      lines.push(`- ${item.kind}：${item.text}${terms}`);
    }
  }

  lines.push("", "## 段落执行");
  if (report.segments.length === 0) {
    lines.push("- 没有完成的段落。");
  } else {
    for (const segment of report.segments) {
      const required = segment.requiredTerms.length > 0
        ? `；本段必写：${segment.requiredTerms.map((term) => `「${term}」`).join("、")}`
        : "";
      lines.push(
        `- 第 ${segment.index + 1} 段：重写 ${segment.rewriteCount} 次；采纳问题 ${segment.acceptedFindingCount} 条${required}`,
      );
    }
  }

  if (report.chapterQuality) {
    lines.push("", "## 章节复核");
    lines.push(`- 状态：${statusText(report.chapterQuality.status)}`);
    for (const finding of report.chapterQuality.findings) {
      const excerpt = finding.excerpt ? `；片段：${finding.excerpt}` : "";
      lines.push(`- ${finding.severity}/${finding.category}：${finding.suggestion}${excerpt}`);
    }
  }

  if (report.writingConflict) {
    lines.push("", "## 冲突分析");
    lines.push(`- 状态：${conflictStatusText(report.writingConflict.status)}`);
    if (report.writingConflict.reason) {
      lines.push(`- 说明：${report.writingConflict.reason}`);
    }
    if (report.writingConflict.analysis) {
      const analysis = report.writingConflict.analysis;
      lines.push(`- 根因：${analysis.rootCause}`);
      lines.push(`- 是否可调和：${analysis.reconcilable ? "是" : "否"}`);
      lines.push(`- 摘要：${analysis.summary}`);
      if (analysis.extraConstraints) {
        lines.push(`- 补充约束：${analysis.extraConstraints}`);
      }
      if (analysis.suggestedActions.length > 0) {
        lines.push("- 建议动作：");
        for (const action of analysis.suggestedActions) {
          lines.push(`  - ${action.label}：${action.description}`);
        }
      }
    }
  }

  return lines.join("\n");
}
