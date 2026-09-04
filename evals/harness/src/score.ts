import { CLAIM_TYPES, TIER_MIDPOINTS, type ClaimType, type Confidence, type Drop, type GroundTruth, type Portrait } from "@glasshouse/schema";

export type ClaimScore = {
  claim_type: ClaimType;
  confidence: Confidence;
  hit: boolean | null;
  statement: string;
};

export type FixtureScore = {
  fixture_id: string;
  source: "local" | "sanitized";
  claims: ClaimScore[];
  drops: Drop[];
  declined: Array<{ claim_type: string; reason: string }>;
  thin_signal_note: string | null;
  behavior_sparse: boolean;
  drop_rate: number;
  declined_rate: number;
  hit_rate: number | null;
  brier: number | null;
  jaccard: number;
  hits_by_tier: Record<Confidence, { n: number; hits: number }>;
};

function hit(statement: string, accept: string[]): boolean {
  const s = statement.toLowerCase();
  return accept.some((a) => s.includes(a.toLowerCase()));
}

function jaccard(sets: Array<Set<string>>): number {
  if (sets.length === 0) return 1;
  const first = sets[0];
  if (!first) return 1;
  let inter = new Set(first);
  let union = new Set(first);
  for (const s of sets.slice(1)) {
    inter = new Set([...inter].filter((x) => s.has(x)));
    for (const x of s) union.add(x);
  }
  if (union.size === 0) return 1;
  return inter.size / union.size;
}

export function scoreFixture(args: {
  fixture_id: string;
  source: "local" | "sanitized";
  ground_truth: GroundTruth;
  portraits: Portrait[];
  dropsPerRun: Drop[][];
}): FixtureScore {
  const last = args.portraits.at(-1);
  if (!last) throw new Error(`no portraits for ${args.fixture_id}`);
  const lastDrops = args.dropsPerRun.at(-1) ?? [];
  const claimTypes = args.portraits.map((p) => new Set(p.claims.map((c) => c.claim_type)));
  const scored: ClaimScore[] = last.claims.map((c) => {
    const gt = args.ground_truth[c.claim_type];
    return {
      claim_type: c.claim_type,
      confidence: c.confidence,
      hit: gt ? hit(c.statement, gt.accept) : null,
      statement: c.statement,
    };
  });
  const labeled = scored.filter((c) => c.hit !== null);
  const hits = labeled.filter((c) => c.hit).length;
  const produced = last.claims.length + lastDrops.length;
  const brierVals = labeled.map((c) => {
    const p = TIER_MIDPOINTS[c.confidence];
    const y = c.hit ? 1 : 0;
    return (p - y) ** 2;
  });
  const hits_by_tier: FixtureScore["hits_by_tier"] = {
    HUNCH: { n: 0, hits: 0 },
    PLAUSIBLE: { n: 0, hits: 0 },
    LIKELY: { n: 0, hits: 0 },
    CONFIDENT: { n: 0, hits: 0 },
  };
  for (const c of labeled) {
    const bucket = hits_by_tier[c.confidence];
    bucket.n += 1;
    if (c.hit) bucket.hits += 1;
  }
  return {
    fixture_id: args.fixture_id,
    source: args.source,
    claims: scored,
    drops: lastDrops,
    declined: last.declined,
    thin_signal_note: last.thin_signal_note,
    behavior_sparse: last.behavior_sparse,
    drop_rate: produced === 0 ? 0 : lastDrops.length / produced,
    declined_rate: last.declined.length / CLAIM_TYPES.length,
    hit_rate: labeled.length === 0 ? null : hits / labeled.length,
    brier: brierVals.length === 0 ? null : brierVals.reduce((a, b) => a + b, 0) / brierVals.length,
    jaccard: jaccard(claimTypes),
    hits_by_tier,
  };
}
