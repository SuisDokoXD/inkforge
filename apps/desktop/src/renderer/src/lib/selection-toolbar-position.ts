export type ToolbarPlacement = "above" | "below" | "clamped";

export interface RectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ToolbarPosition {
  top: number;
  left: number;
  placement: ToolbarPlacement;
  anchorRect: RectLike;
  measuredWidth: number;
  measuredHeight: number;
}

export const VIEWPORT_MARGIN = 8;
export const SELECTION_GAP = 8;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function filterVisibleRects(rects: readonly RectLike[], bounds: Pick<RectLike, "left" | "right" | "top" | "bottom">): RectLike[] {
  return rects.filter((rect) => Number.isFinite(rect.top) && Number.isFinite(rect.left) && rect.width > 0 && rect.height > 0 && rect.right >= bounds.left && rect.left <= bounds.right && rect.bottom >= bounds.top && rect.top <= bounds.bottom);
}

export function calculateToolbarPosition(rects: readonly RectLike[], toolbarWidth: number, toolbarHeight: number, bounds: Pick<RectLike, "left" | "right" | "top" | "bottom">): ToolbarPosition | null {
  if (toolbarWidth <= 0 || toolbarHeight <= 0) return null;
  const visible = filterVisibleRects(rects, bounds).sort((a, b) => a.top - b.top || a.left - b.left);
  if (visible.length === 0) return null;
  const first = visible[0];
  const last = visible[visible.length - 1];
  const anchorRect: RectLike = { top: Math.min(...visible.map((rect) => rect.top)), left: Math.min(...visible.map((rect) => rect.left)), right: Math.max(...visible.map((rect) => rect.right)), bottom: Math.max(...visible.map((rect) => rect.bottom)), width: 0, height: 0 };
  anchorRect.width = anchorRect.right - anchorRect.left;
  anchorRect.height = anchorRect.bottom - anchorRect.top;
  const usableLeft = bounds.left + VIEWPORT_MARGIN;
  const usableRight = bounds.right - VIEWPORT_MARGIN;
  const usableTop = bounds.top + VIEWPORT_MARGIN;
  const usableBottom = bounds.bottom - VIEWPORT_MARGIN;
  const centerX = (first.left + first.right + last.left + last.right) / 4;
  const above = first.top - toolbarHeight - SELECTION_GAP;
  const below = last.bottom + SELECTION_GAP;
  const spaceAbove = first.top - usableTop;
  const spaceBelow = usableBottom - last.bottom;
  let placement: ToolbarPlacement = "above";
  let top = above;
  if (above < usableTop && below + toolbarHeight <= usableBottom) {
    placement = "below";
    top = below;
  } else if (above < usableTop) {
    placement = "clamped";
    top = spaceAbove >= spaceBelow ? above : below;
  }
  const maxLeft = Math.max(usableLeft, usableRight - toolbarWidth);
  const maxTop = Math.max(usableTop, usableBottom - toolbarHeight);
  return { top: clamp(top, usableTop, maxTop), left: clamp(centerX - toolbarWidth / 2, usableLeft, maxLeft), placement, anchorRect, measuredWidth: toolbarWidth, measuredHeight: toolbarHeight };
}
