import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Claim, Portrait } from "./portrait.ts";
import { validatePortrait } from "./validator.ts";

function portrait(claims: Array<Partial<Claim> & Pick<Claim, "claim_type" | "evidence" | "statement">>): Portrait {
  return {
    portrait_id: "p",
    session_id: "s",
    pass_index: 1,
    prompt_version: "stub",
    model_id: "stub-v0",
    sampling: "deterministic",
    signal_set_hash: "abc",
    tiers_available: ["T0", "T1"],
    claims: claims.map((c, i) => ({
      claim_id: `c${i}`,
      confidence: "LIKELY",
      reasoning: "chain",
      falsifier: "counterexample",
      ...c,
    })),
    declined: [],
    thin_signal_note: null,
    behavior_sparse: false,
  };
}

describe("validatePortrait", () => {
  it("drops empty evidence", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([{ claim_type: "visit_intent", statement: "they came to look", evidence: [] }]),
    );
    assert.equal(out.claims.length, 0);
    assert.equal(drops[0]?.reason, "empty_evidence");
  });

  it("drops unknown pointers", () => {
    const { drops } = validatePortrait(
      portrait([{ claim_type: "location_region", statement: "nl", evidence: ["sig.nope"] }]),
    );
    assert.equal(drops[0]?.reason, "unknown_pointer");
  });

  it("drops pointers from unavailable tiers", () => {
    const { drops } = validatePortrait(
      portrait([{ claim_type: "location_region", statement: "nl", evidence: ["sig.tls.ja4"] }]),
    );
    assert.equal(drops[0]?.reason, "tier_not_available");
  });

  it("allows derived pointers regardless of tiers_available", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([
        {
          claim_type: "device_family",
          statement: "macbook class",
          evidence: ["sig.derived.device_family"],
        },
      ]),
    );
    assert.equal(drops.length, 0);
    assert.equal(out.claims.length, 1);
  });

  it("drops withheld evidence pointers", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([
        {
          claim_type: "os_browser_posture",
          statement: "reduced motion is on",
          evidence: ["sig.client.prefers_reduced_motion"],
        },
      ]),
    );
    assert.equal(out.claims.length, 0);
    assert.equal(drops[0]?.reason, "non_citable_evidence");
    assert.equal(drops[0]?.detail, "sig.client.prefers_reduced_motion");
  });

  it("drops prohibited attributes", () => {
    const { drops } = validatePortrait(
      portrait([
        {
          claim_type: "residency_status",
          statement: "likely an undocumented immigrant",
          evidence: ["sig.edge.geo.country"],
        },
      ]),
    );
    assert.equal(drops[0]?.reason, "prohibited_attribute");
  });

  it("keeps the higher-confidence duplicate", () => {
    const { portrait: out, drops } = validatePortrait(
      portrait([
        {
          claim_type: "location_region",
          statement: "guess",
          evidence: ["sig.edge.geo.country"],
          confidence: "HUNCH",
        },
        {
          claim_type: "location_region",
          statement: "netherlands",
          evidence: ["sig.edge.geo.country"],
          confidence: "LIKELY",
        },
      ]),
    );
    assert.equal(out.claims.length, 1);
    assert.equal(out.claims[0]?.confidence, "LIKELY");
    assert.equal(drops[0]?.reason, "duplicate_claim_type");
  });
});
