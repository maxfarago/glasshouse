import {
  QUESTIONS,
  TIER_MIDPOINTS,
  type Answer,
  type Confidence,
  type Drop,
  type GroundTruth,
  type Portrait,
  type QuestionId,
  type QuestionTruth,
} from "@glasshouse/schema";

export type AnswerScore = {
  question: QuestionId;
  value: string | null;
  place?: string;
  confidence?: Confidence;
  hit: boolean;
  declined: boolean;
};

export type FixtureScore = {
  fixture_id: string;
  source: "local" | "sanitized";
  answers: AnswerScore[];
  drops: Drop[];
  drop_rate: number;
  declined_rate: number;
  hit_rate: number;
  brier: number | null;
  jaccard: number;
  derived_share: number;
  derived_only_rate: number;
  tell_only_rate: number;
  raw_per_answer: number;
  decline_vs_guess: number | null;
  hits_by_tier: Record<Confidence, { n: number; hits: number }>;
  confusion: Record<QuestionId, Record<string, Record<string, number>>>;
  missed_tells: Array<{ id: string; why: string }>;
};

function placeHit(place: string | undefined, accept?: string[]): boolean {
  if (!accept || accept.length === 0) return true;
  const s = (place ?? "").toLowerCase();
  return accept.some((a) => s.includes(a.toLowerCase()));
}

export function answerMatches(answer: Answer, gt: QuestionTruth): boolean {
  if (gt.value == null) return answer.value == null;
  if (answer.value !== gt.value) return false;
  if (answer.question === "location" && answer.value && answer.value !== "indeterminate") {
    return placeHit(answer.place, gt.place_accept);
  }
  return true;
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

function label(value: string | null): string {
  return value == null ? "decline" : value;
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
  const valueSets = args.portraits.map((p) => new Set(p.answers.map((a) => `${a.question}:${label(a.value)}`)));

  const scored: AnswerScore[] = last.answers.map((a) => {
    const gt = args.ground_truth[a.question];
    return {
      question: a.question,
      value: a.value,
      ...(a.place ? { place: a.place } : {}),
      ...(a.confidence ? { confidence: a.confidence } : {}),
      hit: answerMatches(a, gt),
      declined: a.value == null,
    };
  });

  const hits = scored.filter((s) => s.hit).length;
  const produced = last.answers.filter((a) => a.value != null).length + lastDrops.length;
  const brierVals = scored.flatMap((s) => {
    if (s.declined || s.confidence == null) return [];
    const p = TIER_MIDPOINTS[s.confidence];
    const y = s.hit ? 1 : 0;
    return [(p - y) ** 2];
  });
  const hits_by_tier: FixtureScore["hits_by_tier"] = {
    HUNCH: { n: 0, hits: 0 },
    PLAUSIBLE: { n: 0, hits: 0 },
    LIKELY: { n: 0, hits: 0 },
    CONFIDENT: { n: 0, hits: 0 },
  };
  for (const s of scored) {
    if (!s.confidence) continue;
    const bucket = hits_by_tier[s.confidence];
    bucket.n += 1;
    if (s.hit) bucket.hits += 1;
  }

  const ptrs = last.answers.filter((a) => a.value != null).map((a) => a.evidence);
  let derived = 0;
  let raw = 0;
  let tellPtrs = 0;
  let derivedOnly = 0;
  let tellOnly = 0;
  for (const ev of ptrs) {
    const d = ev.filter((id) => id.startsWith("sig.derived.")).length;
    const t = ev.filter((id) => id.startsWith("tell.")).length;
    const r = ev.filter((id) => !id.startsWith("sig.derived.") && !id.startsWith("tell.")).length;
    derived += d;
    raw += r;
    tellPtrs += t;
    if (ev.length > 0 && r === 0) derivedOnly += 1;
    if (ev.length > 0 && t === ev.length) tellOnly += 1;
  }
  const totalPtr = derived + raw + tellPtrs;
  const answeredN = ptrs.length;

  let shouldDecline = 0;
  let declinedOk = 0;
  let guessed = 0;
  const confusion = {} as FixtureScore["confusion"];
  for (const q of QUESTIONS) {
    confusion[q] = {};
    const gt = args.ground_truth[q];
    const a = last.answers.find((x) => x.question === q);
    const actual = label(gt.value);
    const pred = label(a?.value ?? null);
    confusion[q][actual] = { [pred]: 1 };
    if (gt.value == null) {
      shouldDecline += 1;
      if (a?.value == null) declinedOk += 1;
      else guessed += 1;
    }
  }

  return {
    fixture_id: args.fixture_id,
    source: args.source,
    answers: scored,
    drops: lastDrops,
    drop_rate: produced === 0 ? 0 : lastDrops.length / Math.max(produced, 1),
    declined_rate: scored.filter((s) => s.declined).length / QUESTIONS.length,
    hit_rate: hits / QUESTIONS.length,
    brier: brierVals.length === 0 ? null : brierVals.reduce((a, b) => a + b, 0) / brierVals.length,
    jaccard: jaccard(valueSets),
    derived_share: totalPtr === 0 ? 0 : derived / totalPtr,
    derived_only_rate: answeredN === 0 ? 0 : derivedOnly / answeredN,
    tell_only_rate: answeredN === 0 ? 0 : tellOnly / answeredN,
    raw_per_answer: answeredN === 0 ? 0 : raw / answeredN,
    decline_vs_guess: shouldDecline === 0 ? null : declinedOk / (declinedOk + guessed),
    hits_by_tier,
    confusion,
    missed_tells: last.missed_tells ?? [],
  };
}
