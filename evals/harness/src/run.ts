import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stubInference } from "@glasshouse/inference";
import { validatePortrait, type Drop, type Portrait } from "@glasshouse/schema";
import { derive } from "@glasshouse/signals";
import { clipToTiers, loadFixtures } from "./load.ts";
import { renderReport } from "./report.ts";
import { scoreFixture } from "./score.ts";

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v ? v : fallback;
}

export async function run(): Promise<string> {
  const promptVersion = arg("--prompt", "stub");
  const repeats = Number.parseInt(arg("--repeats", "3"), 10);
  const root = repoRoot();
  const fixtures = await loadFixtures(root);
  if (fixtures.length === 0) throw new Error("no fixtures found in evals/fixtures");

  const scores = [];
  for (const fixture of fixtures) {
    const portraits: Portrait[] = [];
    const dropsPerRun: Drop[][] = [];
    const clipped = clipToTiers(fixture.signals, fixture.tiers_available);
    const signals = derive(clipped, { now: new Date(fixture.eval_at) });
    for (let i = 0; i < repeats; i++) {
      const raw = await stubInference.infer({
        session_id: fixture.session_id,
        pass_index: fixture.pass_index,
        prompt_version: promptVersion,
        tiers_available: fixture.tiers_available,
        behavior_sparse: fixture.behavior_sparse,
        signals,
        sampling: "deterministic",
      });
      const { portrait, drops } = validatePortrait(raw);
      portraits.push(portrait);
      dropsPerRun.push(drops);
    }
    scores.push(
      scoreFixture({
        fixture_id: fixture.id,
        source: fixture.source,
        ground_truth: fixture.ground_truth,
        portraits,
        dropsPerRun,
      }),
    );
  }

  const report = renderReport({
    prompt_version: promptVersion,
    model_id: stubInference.model_id,
    repeats,
    scores,
  });
  const outDir = path.join(root, "evals/reports");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${promptVersion}.md`);
  await writeFile(outPath, report);
  return outPath;
}
