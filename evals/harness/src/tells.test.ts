import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { asSignalSet, fixtureSchema } from "@glasshouse/schema";
import { derive } from "@glasshouse/signals";
import { detectTells, tellsForInfer } from "@glasshouse/tells";
import { clipToTiers } from "./load.ts";

const EXPECTED: Record<string, string[]> = {
  "ios-lockdown-empty": ["withheld"],
  "macbook-brave-hardened": ["install_vs_geo", "client_suppression", "withheld"],
  "macbook-chrome-home": ["install_vs_geo", "software_from_font", "withheld"],
  "vpn-datacenter-mullvad": ["evasion_incomplete", "software_from_font", "withheld"],
  "vpn-plus-hardened": ["client_suppression", "advertised_exit", "withheld"],
};

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}

describe("sanitized fixture tell sets", () => {
  it("matches locked goldens and strips withheld from infer payload", async () => {
    const dir = path.join(repoRoot(), "evals/fixtures");
    const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
    const seen = new Set<string>();
    for (const name of names) {
      const raw = JSON.parse(await readFile(path.join(dir, name), "utf8")) as unknown;
      const fixture = fixtureSchema.parse(raw);
      seen.add(fixture.id);
      const clipped = clipToTiers(asSignalSet(fixture.signals as Record<string, unknown>), fixture.tiers_available);
      const signals = derive(clipped, { now: new Date(fixture.eval_at) });
      const ids = detectTells(signals).map((t) => t.id);
      assert.deepEqual(ids, EXPECTED[fixture.id], fixture.id);
      assert.ok(!tellsForInfer(detectTells(signals)).some((t) => t.id === "tell.withheld"));
    }
    assert.deepEqual([...seen].sort(), Object.keys(EXPECTED).sort());
  });
});
