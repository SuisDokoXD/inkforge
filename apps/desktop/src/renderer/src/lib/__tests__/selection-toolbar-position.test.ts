import { describe, expect, it } from "vitest";
import { calculateToolbarPosition, filterVisibleRects, type RectLike } from "../selection-toolbar-position";

const rect = (top: number, left: number, width = 200, height = 20): RectLike => ({ top, left, right: left + width, bottom: top + height, width, height });
const bounds = { top: 40, left: 100, right: 1000, bottom: 800 };

describe("selection toolbar positioning", () => {
  it("prefers above when available", () => expect(calculateToolbarPosition([rect(300, 300)], 180, 40, bounds)?.placement).toBe("above"));
  it("flips below near the editor top", () => expect(calculateToolbarPosition([rect(50, 300)], 180, 40, bounds)?.placement).toBe("below"));
  it("clamps horizontal edges", () => expect(calculateToolbarPosition([rect(300, 100, 1)], 180, 40, bounds)?.left).toBe(108));
  it("filters zero-sized and offscreen rectangles", () => expect(filterVisibleRects([rect(0, 0, 0), rect(900, 0)], bounds)).toHaveLength(0));
  it("uses first and last rows for multiline selection", () => {
    const result = calculateToolbarPosition([rect(200, 300), rect(230, 300)], 100, 20, bounds);
    expect(result?.anchorRect.top).toBe(200);
    expect(result?.anchorRect.bottom).toBe(250);
  });
});
