import { z } from "zod";
import { CLAIM_TYPES } from "./claims.ts";
import { CONFIDENCE_TIERS } from "./confidence.ts";
import { SIGNAL_REGISTRY, SIGNAL_TIERS } from "./signals.ts";

export const claimTypeSchema = z.enum(CLAIM_TYPES);
export const confidenceSchema = z.enum(CONFIDENCE_TIERS);
export const signalTierSchema = z.enum(SIGNAL_TIERS);
export const signalIdSchema = z.enum(Object.keys(SIGNAL_REGISTRY) as [keyof typeof SIGNAL_REGISTRY, ...Array<keyof typeof SIGNAL_REGISTRY>]);

export const claimSchema = z.object({
  claim_id: z.string().min(1),
  claim_type: claimTypeSchema,
  confidence: confidenceSchema,
  statement: z.string().min(1),
  evidence: z.array(z.string()),
  reasoning: z.string().min(1),
  falsifier: z.string().min(1),
});

export const declinedSchema = z.object({
  claim_type: claimTypeSchema,
  reason: z.string().min(1),
});

export const portraitSchema = z.object({
  portrait_id: z.string().min(1),
  session_id: z.string().min(1),
  pass_index: z.number().int().positive(),
  prompt_version: z.string().min(1),
  model_id: z.string().min(1),
  sampling: z.enum(["deterministic", "live"]),
  signal_set_hash: z.string().min(1),
  tiers_available: z.array(signalTierSchema).min(1),
  claims: z.array(claimSchema),
  declined: z.array(declinedSchema),
  thin_signal_note: z.string().nullable(),
  behavior_sparse: z.boolean(),
});

export const modelOutputSchema = z.object({
  claims: z.array(
    z.object({
      claim_type: claimTypeSchema,
      confidence: confidenceSchema,
      statement: z.string().min(1),
      evidence: z.array(z.string()),
      reasoning: z.string().min(1),
      falsifier: z.string().min(1),
    }),
  ),
  declined: z.array(declinedSchema),
  thin_signal_note: z.string().nullable(),
});

export type Claim = z.infer<typeof claimSchema>;
export type Declined = z.infer<typeof declinedSchema>;
export type Portrait = z.infer<typeof portraitSchema>;
export type ModelOutput = z.infer<typeof modelOutputSchema>;

export const groundTruthSchema = z.partialRecord(
  claimTypeSchema,
  z.object({ accept: z.array(z.string().min(1)).min(1) }),
);

export const fixtureSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  eval_at: z.string().min(1),
  session_id: z.string().min(1),
  pass_index: z.number().int().positive(),
  tiers_available: z.array(signalTierSchema).min(1),
  behavior_sparse: z.boolean(),
  signals: z.record(z.string(), z.unknown()),
  ground_truth: groundTruthSchema,
});

export type GroundTruth = z.infer<typeof groundTruthSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
