import type { OutlineCardRecord, ProjectRecord } from "@inkforge/shared";

export interface CardQuality {
  score: number;
  label: string;
  cls: string;
}

export const CARD_SECTION_LABELS = [
  "本章功能",
  "视角人物",
  "开场落点",
  "关键场景",
  "冲突推进",
  "情绪层次",
  "结尾钩子",
  "散文小节",
] as const;

export function countNonWhitespace(text: string): number {
  return Array.from(text).filter((ch) => /\S/.test(ch)).length;
}

export function getCardQuality(card: OutlineCardRecord): CardQuality {
  const labelHits = CARD_SECTION_LABELS.filter((label) => card.content.includes(label)).length;
  const lengthScore = Math.min(4, Math.floor(countNonWhitespace(card.content) / 70));
  const score = Math.min(10, labelHits + lengthScore);
  if (score >= 8) {
    return {
      score,
      label: "厚",
      cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
    };
  }
  if (score >= 5) {
    return {
      score,
      label: "中",
      cls: "bg-amber-500/15 text-amber-300 ring-amber-500/25",
    };
  }
  return {
    score,
    label: "薄",
    cls: "bg-red-500/15 text-red-300 ring-red-500/25",
  };
}

export function getMetaCompleteness(project: ProjectRecord | undefined): {
  done: number;
  total: number;
  percent: number;
} {
  if (!project) return { done: 0, total: 3, percent: 0 };
  const checks = [
    project.genre.trim().length > 0,
    project.tags.length > 0,
    countNonWhitespace(project.synopsis) >= 80,
  ];
  const done = checks.filter(Boolean).length;
  return {
    done,
    total: checks.length,
    percent: Math.round((done / checks.length) * 100),
  };
}

export function parseOutlineSections(content: string): Array<{ label: string; body: string }> {
  const sections: Array<{ label: string; body: string }> = [];
  for (const rawLine of content.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([^：:]{2,8})[：:]\s*(.*)$/);
    const label = match?.[1]?.trim() ?? "";
    if (match && CARD_SECTION_LABELS.includes(label as (typeof CARD_SECTION_LABELS)[number])) {
      sections.push({ label, body: match[2]?.trim() ?? "" });
    } else if (sections.length > 0) {
      const last = sections[sections.length - 1];
      last.body = [last.body, line].filter(Boolean).join("\n");
    }
  }
  return sections;
}
