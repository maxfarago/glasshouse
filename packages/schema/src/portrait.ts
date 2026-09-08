import { z } from "zod";
import { CONFIDENCE_TIERS } from "./confidence.ts";
import { QUESTIONS } from "./questions.ts";
import { SIGNAL_TIERS } from "./signals.ts";

export const questionIdSchema = z.enum(QUESTIONS);
export const confidenceSchema = z.enum(CONFIDENCE_TIERS);
export const signalTierSchema = z.enum(SIGNAL_TIERS);

export const answerSchema = z.object({
  question: questionIdSchema,
  value: z.string().nullable(),
  place: z.string().min(1).optional(),
  confidence: confidenceSchema.optional(),
  evidence: z.array(z.string()),
  reasoning: z.string().min(1),
  falsifier: z.string().min(1),
  declined_reason: z.string().min(1).optional(),
});

export const portraitSchema = z.object({
  portrait_id: z.string().min(1),
  session_id: z.string().min(1),
  pass_index: z.number().int().positive(),
  prompt_version: z.string().min(1),
  model_id: z.string().min(1),
  sampling: z.enum(["deterministic", "live"]),
  payload_hash: z.string().min(1),
  tiers_available: z.array(signalTierSchema).min(1),
  answers: z.array(answerSchema).length(6),
  missed_tells: z
    .array(z.object({ id: z.string().min(1), why: z.string().min(1) }))
    .optional(),
});

export const modelOutputSchema = z.object({
  answers: z.array(answerSchema),
  missed_tells: z
    .array(z.object({ id: z.string().min(1), why: z.string().min(1) }))
    .optional(),
});

export type Answer = z.infer<typeof answerSchema>;
export type Portrait = z.infer<typeof portraitSchema>;
export type ModelOutput = z.infer<typeof modelOutputSchema>;

const questionTruth = z.object({
  value: z.string().nullable(),
  place_accept: z.array(z.string().min(1)).min(1).optional(),
});

export const groundTruthSchema = z.object({
  location: questionTruth,
  work_or_home: questionTruth,
  technical_expertise: questionTruth,
  visit_reason: questionTruth,
  profession: questionTruth,
  age_cohort: questionTruth,
});

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
export type QuestionTruth = z.infer<typeof questionTruth>;
