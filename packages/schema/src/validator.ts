import { CLAIM_TYPES, type ClaimType } from "./claims.ts";
import { CONFIDENCE_RANK } from "./confidence.ts";
import { hitsProhibited } from "./prohibited.ts";
import type { Claim, Portrait } from "./portrait.ts";
import { isSignalId, sourceOf, type SignalTier } from "./signals.ts";

export const DROP_REASONS = [
  "empty_evidence",
  "unknown_pointer",
  "tier_not_available",
  "unknown_claim_type",
  "prohibited_attribute",
  "duplicate_claim_type",
] as const;

export type DropReason = (typeof DROP_REASONS)[number];

export type Drop = {
  claim_type: string;
  reason: DropReason;
  detail?: string;
};

export type ValidationResult = {
  portrait: Portrait;
  drops: Drop[];
};

function claimTypeOk(value: string): value is ClaimType {
  return (CLAIM_TYPES as readonly string[]).includes(value);
}

export function validatePortrait(input: Portrait): ValidationResult {
  const drops: Drop[] = [];
  const kept: Claim[] = [];
  const best = new Map<ClaimType, Claim>();
  const available = new Set<SignalTier>(input.tiers_available);

  for (const claim of input.claims) {
    if (!claimTypeOk(claim.claim_type)) {
      drops.push({ claim_type: claim.claim_type, reason: "unknown_claim_type" });
      continue;
    }
    if (claim.evidence.length === 0) {
      drops.push({ claim_type: claim.claim_type, reason: "empty_evidence" });
      continue;
    }
    const badPointer = claim.evidence.find((id) => !isSignalId(id));
    if (badPointer) {
      drops.push({ claim_type: claim.claim_type, reason: "unknown_pointer", detail: badPointer });
      continue;
    }
    const unseen = claim.evidence.find((id) => {
      if (!isSignalId(id)) return true;
      const src = sourceOf(id);
      return src !== "derived" && !available.has(src);
    });
    if (unseen) {
      drops.push({ claim_type: claim.claim_type, reason: "tier_not_available", detail: unseen });
      continue;
    }
    if (hitsProhibited(claim.statement) || hitsProhibited(claim.reasoning)) {
      drops.push({ claim_type: claim.claim_type, reason: "prohibited_attribute" });
      continue;
    }
    const prev = best.get(claim.claim_type);
    if (prev) {
      const winner =
        CONFIDENCE_RANK[claim.confidence] > CONFIDENCE_RANK[prev.confidence] ? claim : prev;
      const loser = winner === claim ? prev : claim;
      drops.push({ claim_type: loser.claim_type, reason: "duplicate_claim_type" });
      best.set(claim.claim_type, winner);
      continue;
    }
    best.set(claim.claim_type, claim);
  }

  for (const type of CLAIM_TYPES) {
    const claim = best.get(type);
    if (claim) kept.push(claim);
  }

  return {
    portrait: { ...input, claims: kept },
    drops,
  };
}
