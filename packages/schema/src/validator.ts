import { CONFIDENCE_RANK, type Confidence } from "./confidence.ts";
import { hitsProhibited } from "./prohibited.ts";
import type { Answer, Portrait } from "./portrait.ts";
import { isAnswerValue, QUESTIONS, type QuestionId } from "./questions.ts";
import { isSignalId, sourceOf, type SignalTier } from "./signals.ts";
import { isCitableTellId, isNonCitableEvidence, isTellId } from "./tells.ts";
import { isNonCitableSignalId } from "./withheld.ts";

export const DROP_REASONS = [
  "empty_evidence",
  "unknown_pointer",
  "non_citable_evidence",
  "tier_not_available",
  "unknown_question",
  "invalid_value",
  "decline_shape",
  "prohibited_attribute",
  "duplicate_question",
  "age_capped",
] as const;

export type DropReason = (typeof DROP_REASONS)[number];

export type Drop = {
  question: string;
  reason: DropReason;
  detail?: string;
};

export type ValidationResult = {
  portrait: Portrait;
  drops: Drop[];
};

function decline(question: QuestionId, reason: string, base?: Partial<Answer>): Answer {
  return {
    question,
    value: null,
    evidence: base?.evidence ?? [],
    reasoning: base?.reasoning ?? reason,
    falsifier: base?.falsifier ?? "an observation that would support a closed-set answer",
    declined_reason: reason,
  };
}

function evidenceOk(
  answer: Answer,
  available: Set<SignalTier>,
): { ok: true } | { ok: false; reason: DropReason; detail?: string } {
  if (answer.evidence.length === 0) return { ok: false, reason: "empty_evidence" };
  const badPointer = answer.evidence.find((id) => !isSignalId(id) && !isTellId(id));
  if (badPointer) return { ok: false, reason: "unknown_pointer", detail: badPointer };
  const blocked = answer.evidence.find((id) => isNonCitableSignalId(id) || isNonCitableEvidence(id));
  if (blocked) return { ok: false, reason: "non_citable_evidence", detail: blocked };
  const unseen = answer.evidence.find((id) => {
    if (isCitableTellId(id)) return false;
    if (!isSignalId(id)) return true;
    const src = sourceOf(id);
    return src !== "derived" && !available.has(src);
  });
  if (unseen) return { ok: false, reason: "tier_not_available", detail: unseen };
  return { ok: true };
}

export function validatePortrait(input: Portrait): ValidationResult {
  const drops: Drop[] = [];
  const available = new Set<SignalTier>(input.tiers_available);
  const best = new Map<QuestionId, Answer>();

  for (const raw of input.answers) {
    if (!QUESTIONS.includes(raw.question)) {
      drops.push({ question: raw.question, reason: "unknown_question" });
      continue;
    }
    const q = raw.question;
    let answer: Answer = { ...raw };

    const answered = answer.value != null;
    const declined = answer.declined_reason != null;
    if (answered === declined) {
      drops.push({ question: q, reason: "decline_shape" });
      best.set(q, decline(q, answer.declined_reason ?? "invalid answer shape", answer));
      continue;
    }

    if (!answered) {
      const next = decline(q, answer.declined_reason ?? "declined", answer);
      if (answer.confidence != null) {
        drops.push({ question: q, reason: "decline_shape", detail: "confidence on decline" });
      }
      const prev = best.get(q);
      if (prev) drops.push({ question: q, reason: "duplicate_question" });
      else best.set(q, next);
      continue;
    }

    if (!isAnswerValue(q, answer.value as string)) {
      drops.push({ question: q, reason: "invalid_value", ...(answer.value ? { detail: answer.value } : {}) });
      best.set(q, decline(q, `value not in closed set: ${answer.value}`, answer));
      continue;
    }

    const ev = evidenceOk(answer, available);
    if (!ev.ok) {
      drops.push({ question: q, reason: ev.reason, ...(ev.detail ? { detail: ev.detail } : {}) });
      best.set(q, decline(q, ev.detail ?? ev.reason, answer));
      continue;
    }

    const prose = `${answer.reasoning} ${answer.place ?? ""}`;
    if (hitsProhibited(prose)) {
      drops.push({ question: q, reason: "prohibited_attribute" });
      best.set(q, decline(q, "prohibited attribute", answer));
      continue;
    }

    if (q === "age_cohort" && answer.confidence && CONFIDENCE_RANK[answer.confidence] > CONFIDENCE_RANK.HUNCH) {
      drops.push({ question: q, reason: "age_capped", detail: answer.confidence });
      answer = { ...answer, confidence: "HUNCH" as Confidence };
    }

    const prev = best.get(q);
    if (prev) {
      drops.push({ question: q, reason: "duplicate_question" });
      const prevRank = prev.confidence ? CONFIDENCE_RANK[prev.confidence] : -1;
      const nextRank = answer.confidence ? CONFIDENCE_RANK[answer.confidence] : -1;
      if (nextRank <= prevRank) continue;
    }
    best.set(q, {
      ...answer,
      confidence: answer.confidence,
      declined_reason: undefined,
    });
  }

  const answers = QUESTIONS.map((q) => best.get(q) ?? decline(q, "not emitted"));
  return { portrait: { ...input, answers }, drops };
}
