export { CLAIM_TYPES, type ClaimType } from "./claims.ts";
export {
  CONFIDENCE_RANK,
  CONFIDENCE_TIERS,
  TIER_MIDPOINTS,
  type Confidence,
} from "./confidence.ts";
export { canonicalize, hashSignalSet } from "./hash.ts";
export { asSignalSet } from "./parse.ts";
export { hitsProhibited } from "./prohibited.ts";
export {
  claimSchema,
  claimTypeSchema,
  confidenceSchema,
  declinedSchema,
  fixtureSchema,
  groundTruthSchema,
  portraitSchema,
  signalIdSchema,
  signalTierSchema,
  type Claim,
  type Declined,
  type Fixture,
  type GroundTruth,
  type Portrait,
} from "./portrait.ts";
export {
  SIGNAL_IDS,
  SIGNAL_REGISTRY,
  SIGNAL_TIERS,
  isSignalId,
  sourceOf,
  type SignalId,
  type SignalSet,
  type SignalSource,
  type SignalTier,
  type SignalValue,
} from "./signals.ts";
export {
  DROP_REASONS,
  validatePortrait,
  type Drop,
  type DropReason,
  type ValidationResult,
} from "./validator.ts";
