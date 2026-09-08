import { QUESTIONS, type QuestionId } from "@glasshouse/schema";
import type { FixtureScore } from "./score.ts";

function pct(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(2);
}

function renderConfusion(s: FixtureScore): string[] {
  const lines = ["", "### confusion"];
  for (const q of QUESTIONS) {
    const table = s.confusion[q as QuestionId];
    const cells: string[] = [];
    for (const [actual, preds] of Object.entries(table ?? {})) {
      for (const [pred, n] of Object.entries(preds)) {
        cells.push(`${actual}→${pred}:${n}`);
      }
    }
    lines.push(`- \`${q}\` ${cells.join(" ")}`);
  }
  return lines;
}

function renderFixture(s: FixtureScore): string {
  const lines: string[] = [
    `## ${s.fixture_id}`,
    "",
    `source: ${s.source}`,
    `hit_rate: ${pct(s.hit_rate)}  brier: ${pct(s.brier)}  drop_rate: ${pct(s.drop_rate)}  declined_rate: ${pct(s.declined_rate)}  jaccard: ${pct(s.jaccard)}`,
    `derived_share: ${pct(s.derived_share)}  derived_only_rate: ${pct(s.derived_only_rate)}  tell_only_rate: ${pct(s.tell_only_rate)}  raw_per_answer: ${s.raw_per_answer.toFixed(2)}`,
    `decline_vs_guess: ${pct(s.decline_vs_guess)}`,
    "",
    "### answers",
  ];
  for (const a of s.answers) {
    const mark = a.hit ? "hit" : "miss";
    const conf = a.confidence ?? "declined";
    const val = a.value == null ? "null" : a.place ? `${a.value} ${a.place}` : a.value;
    lines.push(`- \`${a.question}\` ${conf} [${mark}] ${val}`);
  }
  lines.push("", "### drops");
  if (s.drops.length === 0) lines.push("- none");
  for (const d of s.drops) {
    lines.push(`- \`${d.question}\` ${d.reason}${d.detail ? ` (${d.detail})` : ""}`);
  }
  lines.push(...renderConfusion(s));
  if (s.missed_tells.length > 0) {
    lines.push("", "### missed_tells");
    for (const m of s.missed_tells) {
      lines.push(`- \`${m.id}\` ${m.why}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderReport(args: {
  prompt_version: string;
  model_id: string;
  repeats: number;
  scores: FixtureScore[];
}): string {
  const rows = args.scores.map((s) => {
    return `| ${s.fixture_id} | ${s.source} | ${s.answers.filter((a) => !a.declined).length} | ${s.drops.length} | ${pct(s.hit_rate)} | ${pct(s.brier)} | ${pct(s.drop_rate)} | ${pct(s.decline_vs_guess)} | ${pct(s.jaccard)} |`;
  });
  const reliability = {
    HUNCH: { n: 0, hits: 0 },
    PLAUSIBLE: { n: 0, hits: 0 },
    LIKELY: { n: 0, hits: 0 },
    CONFIDENT: { n: 0, hits: 0 },
  };
  for (const s of args.scores) {
    for (const tier of ["HUNCH", "PLAUSIBLE", "LIKELY", "CONFIDENT"] as const) {
      reliability[tier].n += s.hits_by_tier[tier].n;
      reliability[tier].hits += s.hits_by_tier[tier].hits;
    }
  }
  const relRows = (Object.keys(reliability) as Array<keyof typeof reliability>).map((tier) => {
    const { n, hits } = reliability[tier];
    return `| ${tier} | ${n} | ${hits} | ${n === 0 ? "—" : (hits / n).toFixed(2)} |`;
  });
  const labeledBrier = args.scores.map((s) => s.brier).filter((n): n is number => n != null);
  const meanBrier =
    labeledBrier.length === 0
      ? "—"
      : (labeledBrier.reduce((a, b) => a + b, 0) / labeledBrier.length).toFixed(2);
  const meanDrop =
    args.scores.length === 0
      ? "—"
      : (args.scores.reduce((a, s) => a + s.drop_rate, 0) / args.scores.length).toFixed(2);
  const meanHit =
    args.scores.length === 0
      ? "—"
      : (args.scores.reduce((a, s) => a + s.hit_rate, 0) / args.scores.length).toFixed(2);
  const meanDerivedOnly =
    args.scores.length === 0
      ? "—"
      : (args.scores.reduce((a, s) => a + s.derived_only_rate, 0) / args.scores.length).toFixed(2);
  const meanTellOnly =
    args.scores.length === 0
      ? "—"
      : (args.scores.reduce((a, s) => a + s.tell_only_rate, 0) / args.scores.length).toFixed(2);
  const dvg = args.scores.map((s) => s.decline_vs_guess).filter((n): n is number => n != null);
  const meanDvg = dvg.length === 0 ? "—" : (dvg.reduce((a, b) => a + b, 0) / dvg.length).toFixed(2);
  return [
    `# ${args.prompt_version}`,
    "",
    `model_id: ${args.model_id}`,
    `repeats: ${args.repeats}`,
    `fixtures: ${args.scores.length}`,
    `mean_hit_rate: ${meanHit}`,
    `mean_brier: ${meanBrier}`,
    `mean_drop_rate: ${meanDrop}`,
    `mean_derived_only_rate: ${meanDerivedOnly}`,
    `mean_tell_only_rate: ${meanTellOnly}`,
    `mean_decline_vs_guess: ${meanDvg}`,
    "",
    "## summary",
    "",
    "| fixture | source | answered | drops | hit_rate | brier | drop_rate | decline_vs_guess | jaccard |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## reliability",
    "",
    "| tier | n | hits | hit_rate |",
    "|---|---|---|---|",
    ...relRows,
    "",
    ...args.scores.map(renderFixture),
  ].join("\n");
}
