export type ConnectionQuality = "fast" | "moderate" | "slow";

export function connectionQuality(effectiveType: string | null): ConnectionQuality | null {
  if (effectiveType === "4g") return "fast";
  if (effectiveType === "3g") return "moderate";
  if (effectiveType === "2g" || effectiveType === "slow-2g") return "slow";
  return null;
}