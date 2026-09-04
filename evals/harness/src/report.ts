import type { FixtureScore } from "./score.ts";

function pct(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(2);
}

function renderFixture(s: FixtureScore): string {
  const lines: string[] = [
    `## ${s.fixture_id}`,
    "",
    `source: ${s.source}`,
    `hit_rate: ${pct(s.hit_rate)}  brier: ${pct(s.brier)}  drop_rate: ${pct(s.drop_rate)}  declined_rate: ${pct(s.declined_rate)}  jaccard: ${pct(s.jaccard)}`,
    `behavior_sparse: ${s.behavior_sparse}`,
    "",
    "### claims",
  ];
  for (const c of s.claims) {
    const mark = c.hit == null ? "unlabeled" : c.hit ? "hit" : "miss";
    lines.push(`- \`${c.claim_type}\` ${c.confidence} [${mark}] ${c.statement}`);
  }
  lines.push("", "### drops");
  if (s.drops.length === 0) lines.push("- none");
  for (const d of s.drops) {
    lines.push(`- \`${d.claim_type}\` ${d.reason}${d.detail ? ` (${d.detail})` : ""}`);
  }
  lines.push("", "### declined");
  for (const d of s.declined) {
    lines.push(`- \`${d.claim_type}\` ${d.reason}`);
  }
  if (s.thin_signal_note) {
    lines.push("", `thin_signal_note: ${s.thin_signal_note}`);
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
    return `| ${s.fixture_id} | ${s.source} | ${s.claims.length} | ${s.drops.length} | ${pct(s.hit_rate)} | ${pct(s.brier)} | ${pct(s.drop_rate)} | ${pct(s.jaccard)} |`;
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
  return [
    `# ${args.prompt_version}`,
    "",
    `model_id: ${args.model_id}`,
    `repeats: ${args.repeats}`,
    `fixtures: ${args.scores.length}`,
    `mean_brier: ${meanBrier}`,
    "",
    "## summary",
    "",
    "| fixture | source | claims | drops | hit_rate | brier | drop_rate | jaccard |",
    "|---|---|---|---|---|---|---|---|",
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
