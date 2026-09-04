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
  return [
    `# ${args.prompt_version}`,
    "",
    `model_id: ${args.model_id}`,
    `repeats: ${args.repeats}`,
    `fixtures: ${args.scores.length}`,
    "",
    "## summary",
    "",
    "| fixture | source | claims | drops | hit_rate | brier | drop_rate | jaccard |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    ...args.scores.map(renderFixture),
  ].join("\n");
}
