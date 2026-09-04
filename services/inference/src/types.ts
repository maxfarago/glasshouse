import type { Portrait, SignalSet, SignalTier } from "@glasshouse/schema";

export type InferInput = {
  session_id: string;
  pass_index: number;
  prompt_version: string;
  tiers_available: SignalTier[];
  behavior_sparse: boolean;
  signals: SignalSet;
  sampling: "deterministic" | "live";
};

export type Inference = {
  model_id: string;
  infer(input: InferInput): Promise<Portrait>;
};
