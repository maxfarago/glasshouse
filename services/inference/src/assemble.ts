import { randomUUID } from "node:crypto";
import { stripWithheld, type ModelOutput, type Portrait } from "@glasshouse/schema";
import { hashSignalSet } from "@glasshouse/schema/hash";
import type { InferInput } from "./types.ts";

export function assemblePortrait(input: InferInput, output: ModelOutput, modelId: string): Portrait {
  return {
    portrait_id: randomUUID(),
    session_id: input.session_id,
    pass_index: input.pass_index,
    prompt_version: input.prompt_version,
    model_id: modelId,
    sampling: input.sampling,
    signal_set_hash: hashSignalSet(stripWithheld(input.signals)),
    tiers_available: input.tiers_available,
    claims: output.claims.map((c) => ({ ...c, claim_id: randomUUID() })),
    declined: output.declined,
    thin_signal_note: output.thin_signal_note,
    behavior_sparse: input.behavior_sparse,
  };
}
