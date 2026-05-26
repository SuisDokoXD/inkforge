// =============================================================================
// 卡牌视觉哈希工具
// =============================================================================
// djb2 字符串哈希 + 基于哈希的稳定渐变背景，给"缺封面"的卡降级使用。
// 抽到共享文件是因为 WorldPackCard 和 PackSlotPanel 都需要，且必须保证同一张
// 卡在两处生成同样的渐变（否则插槽缩略图和库里卡片看上去会不一致）。
// =============================================================================

// djb2 字符串哈希：稳定、分布均匀、零依赖
export function hashCode(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// 哈希 → 双色相 + 加深的对角渐变。颜色稳定但视觉上够丰富。
export function fallbackGradient(seed: string): string {
  const h = hashCode(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 47) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 60% 28%) 0%, hsl(${hue2} 65% 18%) 60%, hsl(${(hue1 + 180) % 360} 50% 12%) 100%)`;
}

// 紧凑版渐变（PackSlotPanel 的小缩略图用，少一段更省 GPU）
export function fallbackGradientCompact(seed: string): string {
  const h = hashCode(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 47) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 55% 25%), hsl(${hue2} 60% 18%))`;
}
