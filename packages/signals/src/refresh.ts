const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];

export function snapRefreshHz(frameMs: number): number | null {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return null;
  const hz = 1000 / frameMs;
  let best = RATES[0] ?? 60;
  let bestD = Math.abs(hz - best);
  for (const r of RATES) {
    const d = Math.abs(hz - r);
    if (d < bestD) {
      best = r;
      bestD = d;
    }
  }
  if (bestD > 12) return Math.round(hz / 5) * 5;
  return best;
}
