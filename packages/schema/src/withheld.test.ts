import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripForInfer, stripWithheld } from "./withheld.ts";

describe("stripWithheld", () => {
  it("removes withheld ids and keeps the rest", () => {
    const out = stripWithheld({
      "sig.client.timezone": "Europe/Amsterdam",
      "sig.client.prefers_reduced_motion": true,
      "sig.client.css.forced_colors": "active",
    });
    assert.deepEqual(out, { "sig.client.timezone": "Europe/Amsterdam" });
  });

  it("is idempotent", () => {
    const once = stripWithheld({ "sig.client.prefers_reduced_motion": false });
    assert.deepEqual(stripWithheld(once), once);
  });
});

describe("stripForInfer", () => {
  it("drops withheld ids and effective_type", () => {
    const out = stripForInfer({
      "sig.client.timezone": "Europe/Amsterdam",
      "sig.client.prefers_reduced_motion": true,
      "sig.client.netinfo.effective_type": "4g",
      "sig.client.netinfo.rtt": 20,
    });
    assert.deepEqual(out, {
      "sig.client.timezone": "Europe/Amsterdam",
      "sig.client.netinfo.rtt": 20,
    });
  });
});
