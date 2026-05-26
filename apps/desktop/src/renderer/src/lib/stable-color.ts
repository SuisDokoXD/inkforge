// =============================================================================
// 稳定哈希染色工具
// =============================================================================
// 给"分类名"、"标签"这类离散字符串挑选一个稳定的语义色：
//   - 同一字符串永远拿到同一颜色（djb2 哈希取模色板）
//   - 色板偏暗色调，配合现有 ink-* 暗主题
//
// 用在：
//   - WorldCategorySidebar：类别左侧小圆点
//   - WorldEntryList：条目卡片小色条
//   - 未来：tag chips、character chips 也可复用
// =============================================================================

// 暗色主题下视觉舒适的 10 色板（HSL 模式可控亮度/饱和度）
const PALETTE = [
  "#f59e0b", // amber 500
  "#fb7185", // rose 400
  "#a78bfa", // violet 400
  "#60a5fa", // blue 400
  "#34d399", // emerald 400
  "#fbbf24", // amber 400
  "#f472b6", // pink 400
  "#22d3ee", // cyan 400
  "#a3e635", // lime 400
  "#fdba74", // orange 300
];

// djb2 经典字符串哈希，速度快、分布均匀，足够给染色用
function djb2(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// 给字符串挑一个色板上的稳定颜色（同一字符串永远同色）
export function pickStableColor(key: string): string {
  if (!key) return PALETTE[0];
  return PALETTE[djb2(key) % PALETTE.length];
}
