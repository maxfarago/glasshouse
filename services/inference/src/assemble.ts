import { randomUUID } from "node:crypto";
import { QUESTIONS, stripForInfer, type Answer, type ModelOutput, type Portrait, type QuestionId } from "@glasshouse/schema";
import { hashSignalSet } from "@glasshouse/schema/hash";
import type { InferInput } from "./types.ts";

function decline(question: QuestionId, reason: string): Answer {
  return {
    question,
    value: null,
    evidence: [],
    reasoning: reason,
    falsifier: "an observation that would support a closed-set answer",
    declined_reason: reason,
  };
}

export function assemblePortrait(input: InferInput, output: ModelOutput, modelId: string): Portrait {
  const byQ = new Map<QuestionId, Answer>();
  for (const a of output.answers) {
    if (!byQ.has(a.question)) byQ.set(a.question, a);
  }
  return {
    portrait_id: randomUUID(),
    session_id: input.session_id,
    pass_index: input.pass_index,
    prompt_version: input.prompt_version,
    model_id: modelId,
    sampling: input.sampling,
    payload_hash: hashSignalSet(stripForInfer(input.signals)),
    tiers_available: input.tiers_available,
    answers: QUESTIONS.map((q) => byQ.get(q) ?? decline(q, "not emitted")),
    missed_tells: input.sampling === "deterministic" ? output.missed_tells : undefined,
  };
}
