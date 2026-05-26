// =============================================================================
// CCv3 (Character Card V3) ↔ InkForge WorldPack 双向编解码
// =============================================================================
// 规范来源：https://github.com/kwaroran/character-card-spec-v3
//
// 本模块只做数据形状转换 + JSON 字符串解析；
// 不做磁盘 I/O（让 character-card-service 编排）。
//
// 双向映射：
//   CCv3.data.name                  ↔ pack.name
//   CCv3.data.creator_notes         ↔ pack.description（fallback）
//   CCv3.data.tags                  ↔ pack.tags
//   CCv3.data.character_book.name           ↔ pack.name（若顶层无 name）
//   CCv3.data.character_book.description    ↔ pack.description
//   CCv3.data.character_book.scan_depth     ↔ pack.scanDepth
//   CCv3.data.character_book.token_budget   ↔ pack.tokenBudget
//   CCv3.data.character_book.recursive_scanning ↔ pack.recursionEnabled
//
//   character_book.entries[i].keys             ↔ entry.keys
//   character_book.entries[i].secondary_keys   ↔ entry.secondaryKeys
//   character_book.entries[i].content          ↔ entry.content
//   character_book.entries[i].comment          ↔ entry.title（fallback）
//   character_book.entries[i].constant         ↔ entry.constant
//   character_book.entries[i].selective_logic  ↔ entry.selectiveLogic（数值映射见下）
//   character_book.entries[i].case_sensitive   ↔ entry.caseSensitive
//   character_book.entries[i].insertion_order  ↔ entry.order
//   character_book.entries[i].position         ↔ entry.position（字符串映射见下）
//   character_book.entries[i].probability      ↔ entry.probability
//   character_book.entries[i].enabled          ↔ enabled=false 时 probability=0
//   character_book.entries[i].extensions       ↔ entry.extensions
// =============================================================================

import type {
  WorldEntryPosition,
  WorldEntrySelectiveLogic,
} from "@inkforge/shared";

// --------------------------------------------------------------------------
// 1. CCv3 schema 子集（只列我们关心的字段，extensions 走 unknown）
// --------------------------------------------------------------------------

// SillyTavern 的 selective_logic_number 数值约定：0=AND_ANY, 1=NOT_ALL, 2=NOT_ANY, 3=AND_ALL
const LOGIC_NUM_TO_ENUM: Record<number, WorldEntrySelectiveLogic> = {
  0: "and_any",
  1: "not_all",
  2: "not_any",
  3: "and_all",
};
const LOGIC_ENUM_TO_NUM: Record<WorldEntrySelectiveLogic, number> = {
  and_any: 0,
  not_all: 1,
  not_any: 2,
  and_all: 3,
};

// 位置字符串：CCv3 用 "before_char"/"after_char"/"at_depth" 等；
// 我们只保留 before/after/at_depth 三态。其他降级到 before。
function ccv3PositionToInkforge(value: unknown): WorldEntryPosition {
  if (typeof value !== "string") return "before";
  const lower = value.toLowerCase();
  if (lower.includes("after")) return "after";
  if (lower.includes("at_depth") || lower.includes("depth")) return "at_depth";
  return "before";
}
function inkforgePositionToCcv3(p: WorldEntryPosition): string {
  if (p === "after") return "after_char";
  if (p === "at_depth") return "at_depth";
  return "before_char";
}

export interface Ccv3CardBookEntry {
  id?: number;
  keys: string[];
  secondary_keys?: string[];
  comment?: string;
  content: string;
  constant?: boolean;
  selective?: boolean;
  selective_logic?: number; // 0-3
  insertion_order?: number;
  enabled?: boolean;
  position?: string;
  probability?: number;
  case_sensitive?: boolean;
  name?: string;
  priority?: number;
  use_regex?: boolean;
  extensions?: Record<string, unknown>;
}

export interface Ccv3CardBook {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  entries?: Ccv3CardBookEntry[];
  extensions?: Record<string, unknown>;
}

export interface Ccv3CardData {
  name?: string;
  description?: string;
  personality?: string;
  tags?: string[];
  creator?: string;
  creator_notes?: string;
  character_version?: string;
  first_mes?: string;
  alternate_greetings?: string[];
  character_book?: Ccv3CardBook;
  extensions?: Record<string, unknown>;
}

export interface Ccv3Card {
  spec: "chara_card_v3" | "chara_card_v2";
  spec_version?: string;
  data?: Ccv3CardData;
}

// --------------------------------------------------------------------------
// 2. 转换结果 shape：用与 InsertWorldPack/InsertWorldPackEntry 输入对齐的形状
//    这样 service 层 forward 即可，避免无谓中间类型。
// --------------------------------------------------------------------------

export interface ParsedCardPack {
  // pack 字段
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  scanDepth: number;
  tokenBudget: number;
  recursionEnabled: boolean;
  // 解析出来的条目（按数组顺序对应 order=0..n-1）
  entries: ParsedCardEntry[];
  // 来源规范，记录到 character_card_imports.spec
  spec: "ccv3" | "ccv2";
}

export interface ParsedCardEntry {
  category: string;
  title: string;
  content: string;
  aliases: string[];
  tags: string[];
  keys: string[];
  position: WorldEntryPosition;
  probability: number;
  order: number;
  secondaryKeys: string[];
  selectiveLogic: WorldEntrySelectiveLogic;
  caseSensitive: boolean;
  constant: boolean;
  extensions: Record<string, unknown>;
}

// --------------------------------------------------------------------------
// 3. parseCcv3Json — 主入口
// --------------------------------------------------------------------------

// 把 CCv3 JSON 字符串 / 已解析对象转成 ParsedCardPack。
// 输入既可以是字符串（来自 .json 文件读取）也可以是对象（来自 base64 解码后的 JSON.parse）。
export function parseCcv3(input: string | unknown): ParsedCardPack {
  let raw: unknown;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (err) {
      throw new Error(
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    raw = input;
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Card data is not an object");
  }
  const card = raw as Ccv3Card;
  const spec: "ccv3" | "ccv2" =
    card.spec === "chara_card_v2" ? "ccv2" : "ccv3";

  const data = card.data ?? {};
  const book = data.character_book ?? {};
  const entries = book.entries ?? [];

  // pack-level
  const name =
    (data.name?.trim() || book.name?.trim() || "未命名角色卡").slice(0, 200);
  const description =
    (book.description ?? data.creator_notes ?? data.description ?? "").trim();
  const tagline = (data.creator_notes ?? "").split("\n")[0]?.slice(0, 200) ?? "";
  const tags = Array.isArray(data.tags)
    ? data.tags.map(String).filter(Boolean)
    : [];

  const parsed: ParsedCardPack = {
    name,
    tagline,
    description,
    tags,
    scanDepth: clampInt(book.scan_depth, 0, 20, 3),
    tokenBudget: clampInt(book.token_budget, 100, 100000, 1500),
    recursionEnabled: !!book.recursive_scanning,
    entries: entries.map((e, idx) => convertCcv3Entry(e, idx)),
    spec,
  };
  return parsed;
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function convertCcv3Entry(
  e: Ccv3CardBookEntry,
  idx: number,
): ParsedCardEntry {
  const keys = Array.isArray(e.keys) ? e.keys.map(String).filter(Boolean) : [];
  const secondaryKeys = Array.isArray(e.secondary_keys)
    ? e.secondary_keys.map(String).filter(Boolean)
    : [];
  const enabled = e.enabled !== false;
  // enabled=false → 保留条目但 probability=0，用户改 enabled=true 时再调即可
  const probability = enabled ? clampInt(e.probability, 0, 100, 100) : 0;
  const order = clampInt(e.insertion_order, -1000, 1000, idx);
  const selectiveLogic: WorldEntrySelectiveLogic =
    typeof e.selective_logic === "number"
      ? LOGIC_NUM_TO_ENUM[e.selective_logic] ?? "and_any"
      : "and_any";
  // title 取自 name / comment / 首个 key，三级 fallback
  const title =
    (e.name?.trim() || e.comment?.trim() || keys[0] || `条目 ${idx + 1}`).slice(
      0,
      200,
    );
  // category 来自 extensions.inkforge_category（我们的扩展字段），否则统一 "其他"
  const ext = e.extensions ?? {};
  const inkCat =
    typeof (ext as Record<string, unknown>).inkforge_category === "string"
      ? ((ext as Record<string, unknown>).inkforge_category as string)
      : "其他";
  return {
    category: inkCat,
    title,
    content: typeof e.content === "string" ? e.content : "",
    aliases: [], // CCv3 没显式 aliases，用空
    tags: [], // 卡内条目级 tags 我们目前不映射
    keys,
    position: ccv3PositionToInkforge(e.position),
    probability,
    order,
    secondaryKeys,
    selectiveLogic,
    caseSensitive: !!e.case_sensitive,
    constant: !!e.constant,
    extensions: ext,
  };
}

// --------------------------------------------------------------------------
// 4. serializeCcv3 — 反向：InkForge pack → CCv3 JSON 字符串
// --------------------------------------------------------------------------

export interface SerializeCcv3Input {
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  scanDepth: number;
  tokenBudget: number;
  recursionEnabled: boolean;
  entries: Array<{
    category: string;
    title: string;
    content: string;
    keys: string[];
    secondaryKeys: string[];
    position: WorldEntryPosition;
    probability: number;
    order: number;
    selectiveLogic: WorldEntrySelectiveLogic;
    caseSensitive: boolean;
    constant: boolean;
    extensions: Record<string, unknown>;
  }>;
}

// 反向序列化。spec 固定输出 v3。
export function serializeCcv3(input: SerializeCcv3Input): string {
  const card: Ccv3Card = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: input.name,
      description: input.description,
      tags: input.tags,
      creator_notes: input.tagline,
      character_book: {
        name: input.name,
        description: input.description,
        scan_depth: input.scanDepth,
        token_budget: input.tokenBudget,
        recursive_scanning: input.recursionEnabled,
        entries: input.entries.map((e, idx) => ({
          id: idx + 1,
          keys: e.keys,
          secondary_keys: e.secondaryKeys,
          comment: e.title,
          content: e.content,
          constant: e.constant,
          selective: e.secondaryKeys.length > 0,
          selective_logic: LOGIC_ENUM_TO_NUM[e.selectiveLogic],
          insertion_order: e.order,
          enabled: e.probability > 0,
          position: inkforgePositionToCcv3(e.position),
          probability: e.probability,
          case_sensitive: e.caseSensitive,
          name: e.title,
          extensions: {
            inkforge_category: e.category,
            ...(e.extensions ?? {}),
          },
        })),
      },
    },
  };
  return JSON.stringify(card, null, 2);
}
