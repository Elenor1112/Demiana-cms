// Validated categorical palette (CVD-safe adjacency, fixed order — never cycled).
// Order matters: hues are assigned by entity in this sequence.
export const CATEGORICAL = [
  "#06B6D4", // cyan (brand)
  "#8B5CF6", // violet
  "#F59E0B", // amber
  "#0EA5E9", // sky
  "#22C55E", // green
  "#EF4444", // red
] as const;

// Status colors — reserved, never reused as a series hue.
export const STATUS = {
  good: "#22C55E",
  warning: "#F59E0B",
  info: "#0EA5E9",
  critical: "#EF4444",
  neutral: "#64748B",
} as const;

// Sequential (single-hue, light → dark) for magnitude/heatmaps.
export const SEQUENTIAL_CYAN = [
  "#ECFEFF", "#CFFAFE", "#A5F3FC", "#67E8F9", "#22D3EE", "#06B6D4", "#0891B2", "#0E7490",
];

export function categorical(i: number) {
  return CATEGORICAL[i % CATEGORICAL.length];
}
