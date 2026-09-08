import { randomUUID } from "node:crypto";
import {
  QUESTIONS,
  stripForInfer,
  type Answer,
  type Portrait,
  type QuestionId,
  type SignalSet,
} from "@glasshouse/schema";
import { hashSignalSet } from "@glasshouse/schema/hash";
import type { InferInput, Inference } from "./types.ts";

const MODEL_ID = "stub-v0";
const PROMPT_VERSION = "stub";

function str(signals: SignalSet, id: keyof SignalSet): string | null {
  const v = signals[id];
  return typeof v === "string" ? v : null;
}

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

function answered(
  question: QuestionId,
  value: string,
  confidence: Answer["confidence"],
  evidence: string[],
  reasoning: string,
  falsifier: string,
  place?: string,
): Answer {
  return { question, value, place, confidence, evidence, reasoning, falsifier };
}

function buildAnswers(signals: SignalSet): Answer[] {
  const asnType = str(signals, "sig.derived.asn_type");
  const tz = str(signals, "sig.client.timezone");
  const country = str(signals, "sig.edge.geo.country");
  const city = str(signals, "sig.edge.geo.city");
  const implied = signals["sig.derived.software_implied"];
  const hasSoftware = Array.isArray(implied) && implied.length > 0;
  const datacenter = asnType === "datacenter";

  const byQ = new Map<QuestionId, Answer>();

  if (datacenter && tz) {
    byQ.set(
      "location",
      answered(
        "location",
        "country",
        "LIKELY",
        ["sig.client.timezone", "sig.derived.asn_type"],
        "timezone survives the exit; edge city does not.",
        "a timezone matching the advertised exit",
        tz.includes("Amsterdam") ? "Netherlands" : tz,
      ),
    );
  } else if (city && !datacenter) {
    byQ.set(
      "location",
      answered(
        "location",
        "city",
        "LIKELY",
        ["sig.edge.geo.city", "sig.client.timezone"],
        "edge city and timezone agree.",
        "a timezone outside this metro",
        city,
      ),
    );
  } else {
    byQ.set("location", decline("location", "no person-location signal survived"));
  }

  if (asnType === "corporate" || asnType === "education") {
    byQ.set(
      "work_or_home",
      answered("work_or_home", "work", "LIKELY", ["sig.derived.asn_type"], "org asn.", "a residential asn"),
    );
  } else if (asnType === "residential") {
    byQ.set(
      "work_or_home",
      answered("work_or_home", "home", "HUNCH", ["sig.derived.asn_type"], "residential asn only.", "a corporate asn"),
    );
  } else {
    byQ.set("work_or_home", decline("work_or_home", "datacenter or unknown asn"));
  }

  if (hasSoftware) {
    byQ.set(
      "technical_expertise",
      answered(
        "technical_expertise",
        "expert",
        "PLAUSIBLE",
        ["sig.derived.software_implied"],
        "mapped developer software.",
        "no probe-hit fonts",
      ),
    );
    byQ.set(
      "profession",
      answered(
        "profession",
        "software_engineering",
        "PLAUSIBLE",
        ["tell.software_from_font", "sig.derived.software_implied"],
        "mapped from fonts.",
        "probe hits that do not map to a toolchain",
      ),
    );
  } else {
    byQ.set("technical_expertise", decline("technical_expertise", "no mapped software tell"));
    byQ.set("profession", decline("profession", "no mapped tell"));
  }

  byQ.set("visit_reason", decline("visit_reason", "no referrer"));
  byQ.set("age_cohort", decline("age_cohort", "no generational software tell"));

  return QUESTIONS.map((q) => byQ.get(q) ?? decline(q, "not emitted"));
}

export const stubInference: Inference = {
  model_id: MODEL_ID,
  async infer(input) {
    const signals = stripForInfer(input.signals);
    const portrait: Portrait = {
      portrait_id: randomUUID(),
      session_id: input.session_id,
      pass_index: input.pass_index,
      prompt_version: input.prompt_version || PROMPT_VERSION,
      model_id: MODEL_ID,
      sampling: input.sampling,
      payload_hash: hashSignalSet(signals),
      tiers_available: input.tiers_available,
      answers: buildAnswers(signals),
    };
    return portrait;
  },
};
