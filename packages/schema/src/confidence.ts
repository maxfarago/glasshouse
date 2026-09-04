export const CONFIDENCE_TIERS = ["HUNCH", "PLAUSIBLE", "LIKELY", "CONFIDENT"] as const;

export type Confidence = (typeof CONFIDENCE_TIERS)[number];

export const TIER_MIDPOINTS: Record<Confidence, number> = {
  HUNCH: 0.2,
  PLAUSIBLE: 0.45,
  LIKELY: 0.7,
  CONFIDENT: 0.9,
};

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  HUNCH: 0,
  PLAUSIBLE: 1,
  LIKELY: 2,
  CONFIDENT: 3,
};
