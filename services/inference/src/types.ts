import type { ModelOutput, Portrait, SignalSet, SignalTier } from "@glasshouse/schema";

export type InferTell = {
  id: string;
  category: string;
  headline: string;
  detail: string;
  evidence: string[];
};

export type InferInput = {
  session_id: string;
  pass_index: number;
  prompt_version: string;
  tiers_available: SignalTier[];
  behavior_sparse: boolean;
  signals: SignalSet;
  tells?: InferTell[];
  sampling: "deterministic" | "live";
};

export type InferEvent =
  | { type: "thinking"; text: string }
  | { type: "portrait"; output: ModelOutput };

export type Inference = {
  model_id: string;
  infer(input: InferInput): Promise<Portrait>;
  stream?(input: InferInput): AsyncIterable<InferEvent>;
};
