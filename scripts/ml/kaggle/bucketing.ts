type Band = "low" | "medium" | "high";
type Trend = "down" | "flat" | "up";

export function bandByQuantiles(values: number[]): Band {
  const cleaned = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (cleaned.length === 0) return "medium";
  const q1 = cleaned[Math.floor(cleaned.length * 0.33)];
  const q2 = cleaned[Math.floor(cleaned.length * 0.66)];
  const avg = cleaned.reduce((sum, v) => sum + v, 0) / cleaned.length;
  if (avg <= q1) return "low";
  if (avg <= q2) return "medium";
  return "high";
}

export function trendBand(series: number[]): Trend {
  const cleaned = series.filter((v) => Number.isFinite(v));
  if (cleaned.length < 2) return "flat";
  const slope = cleaned[cleaned.length - 1] - cleaned[0];
  if (slope > 0) return "up";
  if (slope < 0) return "down";
  return "flat";
}

export function spikinessBand(series: number[]): Band {
  const cleaned = series.filter((v) => Number.isFinite(v));
  if (cleaned.length === 0) return "medium";
  const mean = cleaned.reduce((sum, v) => sum + v, 0) / cleaned.length;
  if (mean === 0) return "low";
  const variance =
    cleaned.reduce((sum, v) => sum + (v - mean) ** 2, 0) / cleaned.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv < 0.3) return "low";
  if (cv < 0.7) return "medium";
  return "high";
}

export function volatilityBand(series: number[]): Band {
  return spikinessBand(series);
}
