import type { ReviewBuiltinId, ReviewDimensionRecord } from "@inkforge/shared";

const BUILTIN_REVIEW_DIMENSION_HELP: Record<ReviewBuiltinId, string> = {
  "consistency-character": "人物动机、口吻、关系是否前后一致",
  "consistency-timeline": "时间顺序、因果推进是否连贯",
  foreshadowing: "伏笔是否有铺垫、回应或遗留风险",
  worldbuilding: "设定、规则、地点与常识是否冲突",
  style: "语言风格、叙述口吻与前文是否统一",
};

export function getReviewDimensionHelp(
  dimension: ReviewDimensionRecord | null | undefined,
): string {
  if (!dimension) return "未知审查维度";
  if (dimension.kind !== "builtin") return "自定义审查维度";
  if (!dimension.builtinId) return "内置审查维度";
  return BUILTIN_REVIEW_DIMENSION_HELP[dimension.builtinId] ?? "内置审查维度";
}
