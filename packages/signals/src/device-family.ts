export type Screen = { w: number; h: number };

type Bucket = {
  family: string;
  w: number;
  h: number;
  dpr: number;
  touchMin: number;
};

const BUCKETS: Bucket[] = [
  { family: "iPhone 14/15/16 class", w: 393, h: 852, dpr: 3, touchMin: 1 },
  { family: "iPhone 14/15/16 Pro Max class", w: 430, h: 932, dpr: 3, touchMin: 1 },
  { family: "iPhone SE class", w: 375, h: 667, dpr: 2, touchMin: 1 },
  { family: "iPad class", w: 820, h: 1180, dpr: 2, touchMin: 1 },
  { family: "MacBook Pro 14 class", w: 1512, h: 982, dpr: 2, touchMin: 0 },
  { family: "MacBook Pro 16 class", w: 1728, h: 1117, dpr: 2, touchMin: 0 },
  { family: "MacBook Air 13 class", w: 1470, h: 956, dpr: 2, touchMin: 0 },
  { family: "desktop 1440 class", w: 1440, h: 900, dpr: 2, touchMin: 0 },
];

export function deviceFamily(
  screen: Screen | null | undefined,
  dpr: number | null | undefined,
  maxTouch: number | null | undefined,
): string | null {
  if (!screen || dpr == null) return null;
  const short = Math.min(screen.w, screen.h);
  const long = Math.max(screen.w, screen.h);
  const touch = maxTouch ?? 0;
  let best: { family: string; dist: number } | null = null;
  for (const b of BUCKETS) {
    if (touch > 0 !== b.touchMin > 0) continue;
    const bShort = Math.min(b.w, b.h);
    const bLong = Math.max(b.w, b.h);
    const dist = Math.abs(short - bShort) + Math.abs(long - bLong) + Math.abs(dpr - b.dpr) * 40;
    if (!best || dist < best.dist) best = { family: b.family, dist };
  }
  if (!best || best.dist > 120) {
    if (touch > 0) return "phone class";
    return "desktop class";
  }
  return best.family;
}
