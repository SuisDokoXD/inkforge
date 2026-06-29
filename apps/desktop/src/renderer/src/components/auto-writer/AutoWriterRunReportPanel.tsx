import {
  AlertTriangle,
  BookMarked,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  ListChecks,
  SearchCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AutoWriterRunRecord } from "@inkforge/shared";
import { Badge } from "../ui";

interface TermCoverage {
  term: string;
  matched: boolean;
  segmentIndexes: number[];
}

interface PlotCommitment {
  kind: "foreshadow" | "payoff" | "reveal" | "avoid-reveal" | string;
  text: string;
  exactTerms: string[];
}

interface ChapterFinding {
  severity: "info" | "warn" | "error" | string;
  category: string;
  excerpt: string;
  suggestion: string;
}

interface WritingConflictAction {
  id: string;
  label: string;
  description: string;
}

interface WritingConflictAnalysis {
  reconcilable: boolean;
  summary: string;
  rootCause: string;
  extraConstraints: string;
  suggestedActions: WritingConflictAction[];
}

interface ReferenceSummary {
  characterNames: string[];
  worldEntryTitles: string[];
  styleSampleSources: string[];
  hasExistingChapterText: boolean;
  hasGlobalWorldview: boolean;
  hasPreviousChaptersText: boolean;
}

interface AutoWriterReportViewModel {
  requiredTerms: TermCoverage[];
  forbiddenTerms: TermCoverage[];
  styleDirectives: string[];
  plotBoundaries: string[];
  plotCommitments: PlotCommitment[];
  segments: Array<{
    index: number;
    beat: string;
    rewriteCount: number;
    acceptedFindingCount: number;
    requiredTerms: string[];
    referenceTrace?: unknown;
  }>;
  chapterQuality: {
    status: "not-run" | "pass" | "warn" | "fail" | string;
    findings: ChapterFinding[];
  } | null;
  writingConflict: {
    status: "not-run" | "not-needed" | "completed" | "failed" | string;
    analysis: WritingConflictAnalysis | null;
    reason: string;
  } | null;
  references: ReferenceSummary;
}

interface AutoWriterRunReportPanelProps {
  run: AutoWriterRunRecord | null;
  loading?: boolean;
}

export function AutoWriterRunReportPanel({
  run,
  loading = false,
}: AutoWriterRunReportPanelProps): JSX.Element | null {
  if (loading) {
    return (
      <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/35 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-200">
          <FileCheck2 className="h-4 w-4 text-ink-400" />
          正在整理本次写作报告
        </div>
      </section>
    );
  }

  if (!run) return null;

  const report = parseReport(run.statsJson);
  if (!report) {
    return (
      <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/35 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-200">
          <FileCheck2 className="h-4 w-4 text-ink-400" />
          本次写作报告
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          这次运行没有生成详细报告。旧版本记录或完全失败的运行可能只保留基础统计。
        </p>
      </section>
    );
  }

  const requiredMatched = report.requiredTerms.filter((item) => item.matched).length;
  const forbiddenHit = report.forbiddenTerms.filter((item) => item.matched).length;
  const totalRewrites = report.segments.reduce(
    (sum, segment) => sum + segment.rewriteCount,
    0,
  );
  const chapterTone = chapterStatusTone(report.chapterQuality?.status ?? "not-run");

  return (
    <section className="mb-4 rounded-md border border-ink-700 bg-ink-900/35 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-100">
            <FileCheck2 className="h-4 w-4 text-accent-300" />
            本次写作报告
          </div>
          <div className="mt-1 text-xs text-ink-500">
            汇总要求执行、章节复核和本次参考资料。
          </div>
        </div>
        <Badge tone={chapterTone} size="md" className="shrink-0 rounded">
          {chapterStatusLabel(report.chapterQuality?.status ?? "not-run")}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="必写词"
          value={`${requiredMatched}/${report.requiredTerms.length}`}
          tone={requiredMatched === report.requiredTerms.length ? "success" : "warning"}
        />
        <SummaryTile
          label="禁止词"
          value={forbiddenHit > 0 ? `${forbiddenHit} 处需复核` : "未出现"}
          tone={forbiddenHit > 0 ? "danger" : "success"}
        />
        <SummaryTile
          label="段落"
          value={`${report.segments.length} 段`}
          tone="neutral"
        />
        <SummaryTile
          label="重写"
          value={`${totalRewrites} 次`}
          tone={totalRewrites > 0 ? "warning" : "neutral"}
        />
      </div>

      <ReportBlock
        icon={<ListChecks className="h-4 w-4 text-ink-400" />}
        title="要求执行"
        empty={
          report.requiredTerms.length === 0 &&
          report.forbiddenTerms.length === 0 &&
          report.styleDirectives.length === 0 &&
          report.plotBoundaries.length === 0
        }
        emptyText="这次没有识别到需要逐词检查的硬性要求。"
      >
        <TermList title="必写词" terms={report.requiredTerms} mode="required" />
        <TermList title="禁止词" terms={report.forbiddenTerms} mode="forbidden" />
        <TextList title="风格要求" items={report.styleDirectives} />
        <TextList title="剧情边界" items={report.plotBoundaries} />
      </ReportBlock>

      <ReportBlock
        icon={<GitBranch className="h-4 w-4 text-ink-400" />}
        title="剧情承诺"
        empty={report.plotCommitments.length === 0}
        emptyText="这次没有识别到伏笔、回收或揭示类承诺。"
      >
        <div className="space-y-2">
          {report.plotCommitments.map((item, index) => (
            <div
              key={`${item.kind}-${index}`}
              className="rounded-md border border-ink-700/80 bg-ink-950/45 px-3 py-2"
            >
              <div className="mb-1 flex items-center gap-2">
                <Badge tone="accent" className="rounded">
                  {plotKindLabel(item.kind)}
                </Badge>
                {item.exactTerms.length > 0 ? (
                  <span className="text-[11px] text-ink-500">
                    精确词：{item.exactTerms.join("、")}
                  </span>
                ) : null}
              </div>
              <div className="text-sm leading-6 text-ink-200">{item.text}</div>
            </div>
          ))}
        </div>
      </ReportBlock>

      <ReportBlock
        icon={<SearchCheck className="h-4 w-4 text-ink-400" />}
        title="章节复核"
        empty={!report.chapterQuality || report.chapterQuality.findings.length === 0}
        emptyText={
          report.chapterQuality?.status === "pass"
            ? "章节级检查通过，没有发现需要复核的问题。"
            : "这次没有运行章节级检查。"
        }
      >
        <div className="space-y-2">
          {report.chapterQuality?.findings.map((finding, index) => (
            <FindingRow key={index} finding={finding} />
          ))}
        </div>
      </ReportBlock>

      {report.writingConflict ? (
        <ReportBlock
          icon={<AlertTriangle className="h-4 w-4 text-ink-400" />}
          title="冲突分析"
          empty={report.writingConflict.status !== "completed"}
          emptyText={
            report.writingConflict.reason ||
            (report.writingConflict.status === "not-needed"
              ? "章节复核没有发现需要分流的问题。"
              : "这次没有完成冲突分析。")
          }
        >
          {report.writingConflict.analysis ? (
            <ConflictAnalysis analysis={report.writingConflict.analysis} />
          ) : null}
        </ReportBlock>
      ) : null}

      <ReportBlock
        icon={<BookMarked className="h-4 w-4 text-ink-400" />}
        title="参考资料"
        empty={!hasReferences(report.references)}
        emptyText="这次没有记录到额外参考资料。"
      >
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <ReferencePill active={report.references.hasExistingChapterText} label="已读本章原文" />
          <ReferencePill active={report.references.hasPreviousChaptersText} label="已读前情摘要" />
          <ReferencePill active={report.references.hasGlobalWorldview} label="已读全局设定" />
          <ReferencePill
            active={report.references.styleSampleSources.length > 0}
            label={`文风样本 ${report.references.styleSampleSources.length}`}
          />
        </div>
        <NameList title="人物" items={report.references.characterNames} />
        <NameList title="世界观" items={report.references.worldEntryTitles} />
        <NameList title="文风来源" items={report.references.styleSampleSources} />
      </ReportBlock>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}): JSX.Element {
  const cls =
    tone === "success"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
      : tone === "warning"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
        : tone === "danger"
          ? "border-rose-500/25 bg-rose-500/10 text-rose-200"
          : "border-ink-700 bg-ink-950/45 text-ink-200";
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function ReportBlock({
  icon,
  title,
  empty,
  emptyText,
  children,
}: {
  icon: JSX.Element;
  title: string;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="mt-4 border-t border-ink-700/80 pt-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-200">
        {icon}
        {title}
      </div>
      {empty ? <div className="text-sm leading-6 text-ink-500">{emptyText}</div> : children}
    </div>
  );
}

function TermList({
  title,
  terms,
  mode,
}: {
  title: string;
  terms: TermCoverage[];
  mode: "required" | "forbidden";
}): JSX.Element | null {
  if (terms.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-ink-500">{title}</div>
      <div className="flex flex-wrap gap-2">
        {terms.map((item) => {
          const ok = mode === "required" ? item.matched : !item.matched;
          return (
            <span
              key={`${mode}-${item.term}`}
              className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                ok
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-200"
              }`}
              title={segmentIndexesText(item.segmentIndexes)}
            >
              {ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : null}
              <span className="truncate">{item.term}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TextList({ title, items }: { title: string; items: string[] }): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-ink-500">{title}</div>
      <ul className="space-y-1 text-sm leading-6 text-ink-300">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function FindingRow({ finding }: { finding: ChapterFinding }): JSX.Element {
  return (
    <div className="rounded-md border border-ink-700/80 bg-ink-950/45 px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge tone={severityTone(finding.severity)} className="rounded">
          {severityLabel(finding.severity)}
        </Badge>
        <span className="text-[11px] text-ink-500">{categoryLabel(finding.category)}</span>
      </div>
      <div className="text-sm leading-6 text-ink-200">{finding.suggestion}</div>
      {finding.excerpt ? (
        <blockquote className="mt-2 border-l border-ink-700 pl-3 text-xs leading-5 text-ink-500">
          {finding.excerpt}
        </blockquote>
      ) : null}
    </div>
  );
}

function ConflictAnalysis({ analysis }: { analysis: WritingConflictAnalysis }): JSX.Element {
  return (
    <div className="rounded-md border border-ink-700/80 bg-ink-950/45 px-3 py-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={analysis.reconcilable ? "warning" : "danger"} className="rounded">
          {analysis.reconcilable ? "可重新尝试" : "先改要求"}
        </Badge>
        <span className="text-xs text-ink-500">{rootCauseLabel(analysis.rootCause)}</span>
      </div>
      <div className="text-sm leading-6 text-ink-200">{analysis.summary}</div>
      {analysis.extraConstraints ? (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-xs leading-5 text-amber-100">
          补充约束：{analysis.extraConstraints}
        </div>
      ) : null}
      {analysis.suggestedActions.length > 0 ? (
        <div className="mt-3 space-y-1">
          {analysis.suggestedActions.map((action) => (
            <div key={`${action.id}-${action.label}`} className="text-xs leading-5 text-ink-400">
              <span className="text-ink-200">{action.label}</span>：{action.description}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReferencePill({ active, label }: { active: boolean; label: string }): JSX.Element {
  return (
    <div
      className={`rounded-md border px-2 py-1.5 ${
        active
          ? "border-accent-500/25 bg-accent-500/10 text-accent-200"
          : "border-ink-700 bg-ink-950/45 text-ink-500"
      }`}
    >
      {label}
    </div>
  );
}

function NameList({ title, items }: { title: string; items: string[] }): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-xs text-ink-500">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 12).map((item) => (
          <Badge key={`${title}-${item}`} tone="neutral" className="max-w-full rounded">
            <span className="truncate">{item}</span>
          </Badge>
        ))}
        {items.length > 12 ? (
          <Badge tone="neutral" className="rounded">
            +{items.length - 12}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function parseReport(statsJson: Record<string, unknown>): AutoWriterReportViewModel | null {
  const report = asRecord(statsJson.report);
  if (!report) return null;
  const constraints = asRecord(report.constraints);
  const chapterQuality = asRecord(report.chapterQuality);
  const writingConflict = asRecord(report.writingConflict);
  const segments = asArray(report.segments)
    .map(parseSegment)
    .filter((item): item is AutoWriterReportViewModel["segments"][number] => item !== null);

  return {
    requiredTerms: parseTermCoverages(constraints?.requiredTerms),
    forbiddenTerms: parseTermCoverages(constraints?.forbiddenTerms),
    styleDirectives: stringArray(constraints?.styleDirectives),
    plotBoundaries: stringArray(constraints?.plotBoundaries),
    plotCommitments: asArray(report.plotCommitments)
      .map(parsePlotCommitment)
      .filter((item): item is PlotCommitment => item !== null),
    segments,
    chapterQuality: chapterQuality
      ? {
          status: stringValue(chapterQuality.status, "not-run"),
          findings: asArray(chapterQuality.findings)
            .map(parseFinding)
            .filter((item): item is ChapterFinding => item !== null),
        }
      : null,
    writingConflict: writingConflict
      ? {
          status: stringValue(writingConflict.status, "not-run"),
          reason: stringValue(writingConflict.reason, ""),
          analysis: parseConflictAnalysis(writingConflict.analysis),
        }
      : null,
    references: collectReferences(segments),
  };
}

function parseSegment(value: unknown): AutoWriterReportViewModel["segments"][number] | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    index: numberValue(record.index, 0),
    beat: stringValue(record.beat, ""),
    rewriteCount: numberValue(record.rewriteCount, 0),
    acceptedFindingCount: numberValue(record.acceptedFindingCount, 0),
    requiredTerms: stringArray(record.requiredTerms),
    referenceTrace: record.referenceTrace,
  };
}

function parseTermCoverages(value: unknown): TermCoverage[] {
  return asArray(value)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const term = stringValue(record.term, "");
      if (!term) return null;
      return {
        term,
        matched: Boolean(record.matched),
        segmentIndexes: asArray(record.segmentIndexes)
          .map((index) => numberValue(index, -1))
          .filter((index) => index >= 0),
      };
    })
    .filter((item): item is TermCoverage => item !== null);
}

function parsePlotCommitment(value: unknown): PlotCommitment | null {
  const record = asRecord(value);
  if (!record) return null;
  const text = stringValue(record.text, "");
  if (!text) return null;
  return {
    kind: stringValue(record.kind, ""),
    text,
    exactTerms: stringArray(record.exactTerms),
  };
}

function parseFinding(value: unknown): ChapterFinding | null {
  const record = asRecord(value);
  if (!record) return null;
  const suggestion = stringValue(record.suggestion, "");
  const excerpt = stringValue(record.excerpt, "");
  if (!suggestion && !excerpt) return null;
  return {
    severity: stringValue(record.severity, "warn"),
    category: stringValue(record.category, "fact"),
    excerpt,
    suggestion: suggestion || excerpt,
  };
}

function parseConflictAnalysis(value: unknown): WritingConflictAnalysis | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    reconcilable: Boolean(record.reconcilable),
    summary: stringValue(record.summary, ""),
    rootCause: stringValue(record.rootCause, "other"),
    extraConstraints: stringValue(record.extraConstraints, ""),
    suggestedActions: asArray(record.suggestedActions)
      .map((item) => {
        const action = asRecord(item);
        if (!action) return null;
        const label = stringValue(action.label, "");
        const description = stringValue(action.description, "");
        if (!label && !description) return null;
        return {
          id: stringValue(action.id, ""),
          label: label || "下一步",
          description: description || label,
        };
      })
      .filter((item): item is WritingConflictAction => item !== null),
  };
}

function collectReferences(
  segments: Array<AutoWriterReportViewModel["segments"][number] & { referenceTrace?: unknown }>,
): ReferenceSummary {
  const summary: ReferenceSummary = {
    characterNames: [],
    worldEntryTitles: [],
    styleSampleSources: [],
    hasExistingChapterText: false,
    hasGlobalWorldview: false,
    hasPreviousChaptersText: false,
  };

  for (const segment of segments) {
    const trace = asRecord(segment.referenceTrace);
    const usedContext = asRecord(trace?.usedContext);
    if (!usedContext) continue;
    summary.hasExistingChapterText ||= Boolean(usedContext.hasExistingChapterText);
    summary.hasGlobalWorldview ||= Boolean(usedContext.hasGlobalWorldview);
    summary.hasPreviousChaptersText ||= Boolean(usedContext.hasPreviousChaptersText);
    pushUnique(summary.characterNames, stringArray(usedContext.characterNames));
    pushUnique(summary.worldEntryTitles, stringArray(usedContext.worldEntryTitles));
    pushUnique(summary.styleSampleSources, stringArray(usedContext.styleSampleSources));
  }

  return summary;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function pushUnique(target: string[], items: string[]): void {
  for (const item of items) {
    if (!target.includes(item)) target.push(item);
  }
}

function hasReferences(summary: ReferenceSummary): boolean {
  return (
    summary.hasExistingChapterText ||
    summary.hasGlobalWorldview ||
    summary.hasPreviousChaptersText ||
    summary.characterNames.length > 0 ||
    summary.worldEntryTitles.length > 0 ||
    summary.styleSampleSources.length > 0
  );
}

function segmentIndexesText(indexes: number[]): string {
  if (indexes.length === 0) return "未在正文中定位";
  return `出现在第 ${indexes.map((index) => index + 1).join("、")} 段`;
}

function chapterStatusLabel(status: string): string {
  if (status === "pass") return "复核通过";
  if (status === "warn") return "有提醒";
  if (status === "fail") return "需复核";
  return "未复核";
}

function chapterStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "pass") return "success";
  if (status === "warn") return "warning";
  if (status === "fail") return "danger";
  return "neutral";
}

function severityLabel(severity: string): string {
  if (severity === "error") return "问题";
  if (severity === "warn") return "提醒";
  return "记录";
}

function severityTone(severity: string): "success" | "warning" | "danger" | "neutral" {
  if (severity === "error") return "danger";
  if (severity === "warn") return "warning";
  return "neutral";
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    fact: "事实",
    timeline: "时间线",
    character: "人物",
    world: "世界观",
    constraint: "写作要求",
    "plot-boundary": "剧情边界",
    foreshadow: "伏笔",
    style: "文风",
  };
  return labels[category] ?? "复核";
}

function plotKindLabel(kind: string): string {
  if (kind === "foreshadow") return "埋伏笔";
  if (kind === "payoff") return "回收";
  if (kind === "reveal") return "揭示";
  if (kind === "avoid-reveal") return "暂不揭示";
  return "剧情";
}

function rootCauseLabel(rootCause: string): string {
  const labels: Record<string, string> = {
    "outline-history": "大纲或前情冲突",
    "constraint-history": "写作要求未执行",
    "world-history": "世界观冲突",
    "foreshadow-outline": "伏笔安排冲突",
    mixed: "多处原因",
    other: "其他原因",
  };
  return labels[rootCause] ?? "其他原因";
}
