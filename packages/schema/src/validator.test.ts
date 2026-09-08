import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Answer, Portrait } from "./portrait.ts";
import { QUESTIONS } from "./questions.ts";
import { validatePortrait } from "./validator.ts";

function blank(): Answer {
  return {
    question: "work_or_home",
    value: "home",
    confidence: "LIKELY",
    evidence: ["sig.derived.asn_type"],
    reasoning: "residential asn",
    falsifier: "a datacenter asn",
  };
}

function portrait(answers: Answer[]): Portrait {
  const byQ = new Map(answers.map((a) => [a.question, a]));
  return {
    portrait_id: "p",
    session_id: "s",
    pass_index: 1,
    prompt_version: "stub",
    model_id: "stub-v0",
    sampling: "deterministic",
    payload_hash: "abc",
    tiers_available: ["T0", "T1"],
    answers: QUESTIONS.map((q) => byQ.get(q) ?? { ...blank(), question: q, value: null, declined_reason: "pad", confidence: undefined }),
  };
}

describe("validatePortrait", () => {
  it("force-declines empty evidence", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([{ ...blank(), evidence: [] }]),
    );
    const row = out.answers.find((a) => a.question === "work_or_home");
    assert.equal(row?.value, null);
    assert.equal(drops[0]?.reason, "empty_evidence");
  });

  it("force-declines unknown pointers", () => {
    const { drops } = validatePortrait(
      portrait([{ ...blank(), question: "location", value: "country", evidence: ["sig.nope"] }]),
    );
    assert.equal(drops[0]?.reason, "unknown_pointer");
  });

  it("force-declines pointers from unavailable tiers", () => {
    const { drops } = validatePortrait(
      portrait([{ ...blank(), question: "location", value: "country", evidence: ["sig.tls.ja4"] }]),
    );
    assert.equal(drops[0]?.reason, "tier_not_available");
  });

  it("allows derived and tell pointers", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([
        {
          ...blank(),
          question: "profession",
          value: "software_engineering",
          evidence: ["tell.software_from_font", "sig.derived.software_implied"],
        },
      ]),
    );
    assert.equal(drops.length, 0);
    assert.equal(out.answers.find((a) => a.question === "profession")?.value, "software_engineering");
  });

  it("force-declines withheld evidence", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([
        {
          ...blank(),
          question: "age_cohort",
          value: "35_49",
          confidence: "HUNCH",
          evidence: ["sig.client.prefers_reduced_motion"],
        },
      ]),
    );
    assert.equal(out.answers.find((a) => a.question === "age_cohort")?.value, null);
    assert.equal(drops[0]?.reason, "non_citable_evidence");
  });

  it("caps age_cohort above HUNCH", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([
        {
          ...blank(),
          question: "age_cohort",
          value: "25_34",
          confidence: "LIKELY",
          evidence: ["sig.derived.device_family"],
        },
      ]),
    );
    assert.equal(out.answers.find((a) => a.question === "age_cohort")?.confidence, "HUNCH");
    assert.equal(drops[0]?.reason, "age_capped");
  });

  it("force-declines invalid closed-set values", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([{ ...blank(), value: "apartment" }]),
    );
    assert.equal(out.answers.find((a) => a.question === "work_or_home")?.value, null);
    assert.equal(drops[0]?.reason, "invalid_value");
  });

  it("strips confidence on decline", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([
        {
          ...blank(),
          value: null,
          confidence: "LIKELY",
          declined_reason: "datacenter asn",
        },
      ]),
    );
    const row = out.answers.find((a) => a.question === "work_or_home");
    assert.equal(row?.confidence, undefined);
    assert.ok(drops.some((d) => d.reason === "decline_shape"));
  });

  it("always returns six answers", () => {
    const { portrait: out } = validatePortrait(
      portrait([{ ...blank(), question: "location", value: "city", evidence: ["sig.edge.geo.city"] }]),
    );
    assert.equal(out.answers.length, 6);
    assert.deepEqual(
      out.answers.map((a) => a.question),
      QUESTIONS,
    );
  });
});
