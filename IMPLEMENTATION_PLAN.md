# Glasshouse — V0 Implementation Plan

> Codename `glasshouse`. Served at `https://maxfarago.com` (replaces the blank apex).
> A single-visitor, ephemeral profiling instrument: deterministic signals render first as a
> visible ledger, then a thinking model reasons over that ledger in public and produces
> falsifiable, confidence-tiered claims the visitor can grade.

---

## 0. Thesis and invariants

The piece argues that a small number of cheap, ambient signals support surprisingly
specific abductive inference about a person, and that commercial systems ship those
inferences with a confidence they have not earned. It makes that argument by doing the
thing honestly: showing the raw material, showing the reasoning, tiering the confidence,
and grading itself.

Four invariants. Violating any of these breaks the argument, not just the code.

1. **Deterministic before speculative.** No claim may reference a signal the visitor has
   not already watched arrive in the ledger. The model input is that ledger minus a named
   **withheld** set (accessibility-adjacent signals: shown in the ledger, stripped from
   the infer payload, two hashes). A withheld ID in `evidence` is a validator drop,
   fail-closed — not a prompt instruction. See `GLASSHOUSE_V02_PLAN.md`.
2. **Every claim is falsifiable and attributed.** A claim carries an evidence pointer to
   specific signal IDs and a stated falsifier. Unattributable claims are dropped by a
   validator, not discouraged by the prompt. This is the anti-Barnum mechanism.
3. **Ephemeral by construction.** Per-visitor state exists only to join four async signal
   streams, and is explicitly deleted. The calibration log is architecturally incapable of
   being joined back to an individual.
4. **The system grades itself.** Claim identity, confidence tier, and prompt version are
   logged from the first commit. Ungraded early claims are unrecoverable.

**V0 scope.** Internal only, single visitor (you), frontier model via Anthropic API,
extended thinking streamed. No rarity counter, no public feed, no multi-model comparison,
no rate limiting. V1 swaps to a self-hosted model on RunPod and goes public.

---

## 1. Architecture

```
                      ┌──────────────────────────────────────┐
   visitor ──────────▶│  Cloudflare Worker  (orange cloud)   │
                      │  · serves SPA (Workers Assets)       │
                      │  · captures request.cf → T0 signals  │
                      │  · SigV4-signs & proxies /api/*      │
                      │    infer, calibrate, session delete  │
                      │  · Nominatim proxy (identifying UA)  │
                      │  · KV kill switch                    │
                      └──────┬────────────────────┬──────────┘
                             │ SigV4              │ SigV4
                             │ infer identity     │ calib identity
                             ▼                    ▼
                   ┌──────────────────┐  ┌──────────────────┐
                   │ inference Lambda │  │ calibration Λ    │
                   │ Function URL     │  │ Function URL     │
                   │ RESPONSE_STREAM  │  │ PutItem only     │
                   │ Anthropic        │  │ no reads         │
                   └────────┬─────────┘  └────────┬─────────┘
                            ▼                     ▼
                   ┌──────────────────┐  ┌──────────────────┐
                   │ ddb: sessions    │  │ ddb: calibration │
                   │ · signal join    │  │ · write-only     │
                   │ · explicit del   │  │ · no session id  │
                   └──────────────────┘  └──────────────────┘

   visitor ──────▶ tls.maxfarago.com  (DNS-ONLY — grey cloud, mandatory)
                      ┌──────────────────────────────────────┐
                      │  t4g.small + EIP                     │
                      │  · Go peeking listener → JA4         │
                      │  · certbot DNS-01 (Cloudflare)       │
                      │  · writes T3 to sessions via IAM role │
                      └──────────────────────────────────────┘
```

### 1.1 Non-obvious constraints

**The TLS subdomain must be DNS-only.** If `tls.maxfarago.com` is orange-clouded, Cloudflare
terminates TLS and you fingerprint Cloudflare's stack, not the visitor's. Grey cloud, EIP,
A record straight to the box.

**The Worker is the only browser-facing AWS path.** Function URLs are `AWS_IAM`; the
browser cannot SigV4. Calibration writes and the `pagehide` delete beacon both go
`SPA → Worker → Lambda`, using distinct IAM identities stored as Worker secrets. The
isolation invariant is the data model and IAM, not skipping the Worker.

**Nominatim is proxied for User-Agent, not CORS.** Nominatim sends `Access-Control-Allow-Origin: *`.
The usage policy requires a User-Agent identifying the application; browsers will not let
the SPA set that header. Proxy through the Worker, identify the app, cache aggressively
(Cache API / KV). Same for Overpass if used.

**Certs via DNS-01, not standalone.** The Go service owns :443, so certbot standalone would
need pre/post hooks to free the port. You already run Cloudflare DNS — use
`certbot-dns-cloudflare` with an API token scoped to `Zone:DNS:Edit` on that zone only. No
port 80, no service interruption, works on a grey-clouded record.

**`request.cf.botManagement` JA4 is not on this plan.** Phase 4 (t4g.small + Go probe) is
in V0. Re-check only if the Cloudflare plan changes; if JA4 appears on `request.cf`, delete
the EC2 component and read the field.

**JA4 licensing.** The JA4 fingerprint itself is BSD-3-Clause. Other members of the JA4+
suite are under the FoxIO License 1.1, which restricts commercial use. For an art project
this is almost certainly fine, but read it before vendoring anything beyond JA4 proper.

**Lambda Function URL streaming quirks.** `RESPONSE_STREAM` requires `awslambda.streamifyResponse`
and the response stream must be written to incrementally — buffering the whole body defeats
it. Set `responseStream = awslambda.HttpResponseStream.from(stream, { statusCode: 200,
headers: { "content-type": "text/event-stream" } })` before the first write.

**Worker passthrough is cheap.** Return the upstream `Response` with its `ReadableStream`
body directly. Do not `await` the body or pipe through a transform unless you need to
rewrite frames — Workers bill CPU time, not wall time, so passthrough streaming is near-free.

---

## 2. Repository layout

Monorepo, pnpm workspaces, TypeScript strict everywhere except the Go service.

```
glasshouse/
├── apps/
│   ├── web/                  Vite + React + TS. The SPA.
│   └── worker/               Cloudflare Worker. Assets + proxy + T0 capture.
├── services/
│   ├── inference/            Lambda. Node 22. SSE + Anthropic client.
│   ├── calibration/          Lambda. PutItem only. Separate IAM identity.
│   └── tls-probe/            Go. Peeking TCP listener → JA4 → DynamoDB.
├── packages/
│   ├── schema/               Zod schemas, claim enum, signal ID namespace. SHARED.
│   └── signals/              Client collectors + derived layer. Pure functions.
├── evals/
│   ├── fixtures/             Sanitized signal sets + ground truth. Committed.
│   ├── fixtures.local/       Real captures. Gitignored. Harness prefers these.
│   ├── harness/              Runner, scorer, report generator.
│   └── reports/              Committed output. Diffable across prompt versions.
└── infra/                    Makefile of AWS CLI calls. Not Terraform.
```

`packages/schema` is the spine. The Lambda validates against it, the SPA renders from it,
and the eval harness scores against it. One source of truth for claim types and signal IDs.

---

## 3. Signal model

### 3.1 Tiers, by arrival latency

Tiers exist to sequence the ledger dramatically and to decide when inference passes fire.

| Tier | Source | Latency | Contents |
|------|--------|---------|----------|
| **T0** | Worker | 0ms | `request.cf`: ASN, `asOrganization`, country/city/postal, colo, `clientTcpRtt`, TLS version + cipher, HTTP version. Headers: UA, `Accept-Language`, `Sec-CH-UA*`, referer. |
| **T1** | Client, sync | <5ms | `screen.*`, `devicePixelRatio`, `Intl.DateTimeFormat().resolvedOptions()`, `navigator.languages`, `hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`, `prefers-*` media queries. |
| **T2** | Client, async | 50–500ms | Canvas hash, WebGL vendor/renderer + param sweep, AudioContext hash, font enumeration, `speechSynthesis.getVoices()`, codec support. |
| **T3** | EC2 probe | 100–400ms | JA4, ALPN, cipher list, extension order, supported groups, signature algorithms. Parallel; failure is non-blocking. |
| **T4** | Client, accumulating | 8s activity / 40s wall | Pointer velocity/jitter, scroll cadence, dwell per section, click sequence, focus/blur, typing dynamics if any. Close: first of 8s cumulative activity or 40s wall. Wall-clock win sets `behavior_sparse`. |
| **T5** | Consent-gated | on grant | GPS + reverse geocode (Worker-proxied Nominatim), DeviceMotion, battery, Pwned Passwords (client k-anonymity range). Each a separate button and a separate grant. |

### 3.2 Signal ID namespace

Evidence pointers are dot-paths into a flat, stable namespace. The frontend maps a pointer
to a ledger row and highlights it on hover. Never rename these — append only.

```
sig.edge.asn                     sig.client.canvas_hash
sig.edge.as_org                  sig.client.webgl_renderer
sig.edge.geo.city                sig.client.fonts.count
sig.edge.conn_type               sig.client.fonts.notable
sig.edge.tcp_rtt_ms              sig.client.audio_hash
sig.edge.tls_cipher              sig.tls.ja4
sig.hdr.accept_language          sig.tls.alpn
sig.hdr.ua_ch_platform           sig.behav.pointer_jitter
sig.client.timezone              sig.behav.dwell_map
sig.client.screen                sig.user.gps
sig.client.langs                 sig.user.gps_building
sig.derived.device_family        sig.user.pwned_prefix
sig.derived.asn_type             sig.user.pwned_count
sig.derived.local_time           sig.derived.privacy_posture
```

### 3.3 Derived layer — thin, and visible

The model gets mostly-raw JSON plus a small derived block. Every derived value renders in
the ledger **next to its input**, so the preprocessing is on display rather than hidden.

Derivations, and nothing more:

- `device_family` — `(screen.w, screen.h, dpr, maxTouchPoints)` → lookup table → e.g.
  `"iPhone 14/15/16 Pro class"`. **Never claim a specific model.** iOS Safari reports a
  generic UA and `"Apple GPU"`; the resolution bucket gives a generational cohort at best.
- `asn_type` — `residential | mobile | datacenter | corporate | education | government`,
  from ASN + `as_org` string matching + a hosting-provider list.
- `local_time` — wall-clock time and weekday in the visitor's own timezone. Cheap, and it
  powers the home-vs-work inference.
- `privacy_posture` — count of signals that returned null, randomized, or generic values.
  This is what makes the empty state productive.

Do not compute an "expat score" or any other composite in code. Composition is the model's
job, and hardcoding it would smuggle your priors in as determinism.

---

## 4. Inference contract

### 4.1 Confidence ladder

Four ordinal tiers. Free-floating percentages are excluded — verbalized model probabilities
cluster on round numbers and skew high, and an ordinal ladder is both easier to calibrate
and more honest about the resolution actually available.

| Tier | Band (for scoring only) | UI label |
|------|------------------------|----------|
| `HUNCH` | ~0.20 | "a guess" |
| `PLAUSIBLE` | ~0.45 | "plausible" |
| `LIKELY` | ~0.70 | "likely" |
| `CONFIDENT` | ~0.90 | "confident" |

Bands are midpoints for Brier scoring. Never show them to the visitor — the point of the
ladder is that it does not pretend to two decimal places.

### 4.2 Claim types (enum, `packages/schema`)

Stable identity is what makes the eval loop possible. Free text is the *rendering* of a
claim, not its identity.

```ts
export const CLAIM_TYPES = [
  "location_region",        // where they are, coarse
  "location_precision",     // how precisely we can place them, and by what
  "residency_status",       // local / recent arrival / visiting / transient
  "connection_context",     // home / office / mobile / VPN / datacenter
  "time_context",           // home-hours vs work-hours; what that implies
  "device_tier",            // relative device cost cohort
  "device_family",          // hardware class
  "os_browser_posture",     // platform + how locked down
  "privacy_posture",        // deliberate hardening vs defaults
  "technical_sophistication",
  "language_profile",       // languages, likely native vs acquired
  "age_cohort",
  "employment_sector",
  "employer_or_org",        // only when ASN/rDNS supports it
  "visit_intent",
] as const;
```

**Prohibited inference — enforced by validator, not prompt.** Any claim implicating
race/ethnicity, religion, health or disability, sexual orientation, political affiliation,
or immigration/legal status is rejected at the schema layer. Note the trap: `prefers-reduced-motion`
and `forced-colors` are direct disability signals, and `residency_status` sits adjacent to
immigration status — frame it as mobility and tenure, never legal standing.

When the model declines a claim type, that decline **renders as content**. "The model was
asked and refused" is a legitimate and interesting result, not an error state.

### 4.3 Portrait schema

```ts
{
  portrait_id: string,          // uuid, per pass
  session_id: string,           // ephemeral join key only
  pass_index: number,           // 1-based; which signal tiers were available
  prompt_version: string,       // "p3" — bump on every prompt edit
  model_id: string,
  sampling: "deterministic" | "live",
  signal_set_hash: string,      // sha256 of canonicalized input
  tiers_available: ("T0"|"T1"|"T2"|"T3"|"T4"|"T5")[],
  claims: Array<{
    claim_id: string,
    claim_type: ClaimType,
    confidence: "HUNCH"|"PLAUSIBLE"|"LIKELY"|"CONFIDENT",
    statement: string,          // one sentence, specific, no hedging language
    evidence: string[],         // ≥1 sig.* pointer. EMPTY = DROPPED.
    reasoning: string,          // 1–2 sentences, the actual chain
    falsifier: string,          // what observation would kill this claim
  }>,
  declined: Array<{ claim_type: ClaimType, reason: string }>,
  thin_signal_note: string | null,   // populated on sparse input
  behavior_sparse: boolean,          // pass 2 fired on 40s wall, not 8s activity
}
```

### 4.4 Validator (runs before anything renders)

Reject or drop, in order:

1. `evidence.length === 0` → **drop the claim.** No exceptions. This is the Barnum filter.
2. Evidence pointer not in the signal ID namespace → drop.
3. Evidence pointer references a tier not in `tiers_available` → drop. Catches the model
   hallucinating signals it wasn't given.
4. `claim_type` not in enum → drop.
5. Prohibited-attribute regex/classifier hit on `statement` or `reasoning` → drop, log.
6. Duplicate `claim_type` in one portrait → keep highest confidence, drop rest.

Log every drop with its reason. Drop rate per prompt version is a first-class eval metric —
a prompt edit that raises the Barnum-filter drop rate is a regression even if the surviving
claims look better.

### 4.5 Passes — stateless

Each pass is a pure function from signal set to portrait. No prior portrait in context.
This is what makes portraits replayable, diffable, and independently attributable to their
inputs. Path dependence goes in V1 at the earliest.

- **Pass 1** fires when T0–T3 have settled or timed out (hard cap 800ms after T2 resolves).
- **Pass 2** fires at T4 close: first of 8s cumulative pointer/scroll activity or 40s
  wall, or on first escalation grant, whichever first. If the wall-clock path wins,
  set `behavior_sparse: true` on that portrait. Evals use the same rule so fixture
  reports stay comparable; fixtures that represent a bounce-then-idle tab should
  ship with the flag already set.
- **Pass N** fires on each T5 grant.

The frontend animates the delta between passes: a claim whose confidence rose, a claim that
disappeared, a new claim type appearing. Because passes are stateless, that delta is
computed client-side by `claim_type` join — which is exactly why the enum matters.

---

## 5. Prompt design

Location: `services/inference/prompts/pN.md`, version in filename, referenced by
`prompt_version`. Never edit in place — new file, new version, so eval reports stay
comparable.

Structure:

1. **Role and stakes.** This is a consented, transparent art piece; the visitor sees this
   reasoning and can mark every claim wrong. Speculation is wanted, *stated as speculation*.
2. **The anti-Barnum rule, stated as the core constraint.** A claim that would apply to more
   than half of visitors is worthless here. Prefer a specific claim at `HUNCH` over a
   universal claim at `CONFIDENT`.
3. **The signal set**, raw JSON + derived block, with the ID namespace inline so the model
   can cite accurately.
4. **The claim type enum** with one line each on what it means.
5. **The prohibition list**, with the reasoning (these are special-category attributes under
   GDPR Art. 9 and inferring them is the harm the piece critiques).
6. **Output schema**, strict JSON, with the falsifier field explained as load-bearing.
7. **Two worked examples** — one dense signal set, one near-empty. The empty example is the
   important one: it teaches the model that "you have hardened this browser, which is itself
   a strong signal about who you are" is the right move, not a shrug.

Enable extended thinking via `thinking: { type: "enabled", budget_tokens: N }`. Stream
`thinking_delta` events to the client separately from the final JSON — the deliberation is
the show, and watching the model talk itself from "Frankfurt datacenter" to "no, Dutch user
on a VPN, because the language header and font stack are consistent and a scraper wouldn't
have those" is more affecting than any conclusion.

---

## 6. Data layer

### 6.1 `gh_sessions`

| | |
|---|---|
| PK | `sid` (random UUIDv4, unrelated to any fingerprint) |
| Attrs | `signals` (map, tier-keyed), `created_at`, `ttl` |
| TTL | `created_at + 3600` |

TTL is a **backstop only**. DynamoDB TTL is a background sweep and deletion can lag up to
48 hours; if you claim ephemerality, you must delete explicitly. The SPA fires a
`pagehide` beacon to the Worker (`POST /api/session/delete`); the Worker SigV4-proxies
`DeleteItem`. The inference Lambda also deletes after the final pass.

### 6.2 `gh_calibration`

| | |
|---|---|
| PK | `claim_type` |
| SK | `<iso_ts>#<random6>` |
| Attrs | `confidence`, `verdict` (`up`\|`down`), `prompt_version`, `model_id` |

**Nothing else.** No `sid`, no `signal_set_hash`, no `statement`. The hash is effectively a
fingerprint and the statement can carry personal detail; either would turn this table into a
labeled corpus of verified personal data, which is worse than what you started with.

Enforced structurally: separate Lambda, separate IAM role with `dynamodb:PutItem` on this
table only and **no read permission anywhere in the account**. The SPA POSTs thumbs to the
Worker (`POST /api/calibrate`) with no session ID in the payload; the Worker SigV4-proxies
using the calibration identity, never the inference identity. There is then no code path
that can join corrections back to an individual, and that is verifiable rather than promised.

### 6.3 IAM

- `gh-inference-role` — RW `gh_sessions`, read Secrets Manager (Anthropic key), no
  calibration access at all. Worker secret A signs `/api/infer` and `/api/session/delete`.
- `gh-calibration-role` — `PutItem` on `gh_calibration`. Nothing else. Worker secret B
  signs `/api/calibrate` only.
- `gh-tlsprobe-role` (EC2 instance profile) — `UpdateItem` on `gh_sessions`, key-conditioned.
  No `GetItem`.
- Worker holds both identities as secrets and must not mix them. No DDB access from the
  Worker itself.

---

## 7. TLS probe (`services/tls-probe`)

Go. Peek the ClientHello, then complete the handshake.

```
net.Listen(:443)
  → read first N bytes without consuming (bufio.Reader.Peek)
  → parse ClientHello → JA4 string
  → hand the still-intact conn to tls.Server with the certbot cert
  → HTTP: GET /probe?sid=<uuid> → UpdateItem sessions[sid].signals.T3 → 204
```

`crypto/tls`'s `ClientHelloInfo` is **not sufficient** — it omits raw extension ordering,
which JA4 requires. Hence the peeking listener and manual parse. Use FoxIO's JA4 reference
implementation or `dreadl0ck/tlsx` for the parse.

CORS: the SPA is on `https://maxfarago.com`, the probe on `tls.maxfarago.com` — set
`Access-Control-Allow-Origin: https://maxfarago.com` explicitly.

Caveats to build around: connection reuse means a repeat visit within the keep-alive window
produces no new ClientHello (acceptable for V0); and this whole component is isolated by
design — if the box is down, T3 is absent, `tiers_available` reflects that, and the pass
proceeds.

`t4g.small`, EIP, Amazon Linux 2023, systemd unit, certbot DNS-01 on a systemd timer.

---

## 8. Frontend (`apps/web`)

Not a results page. **A ledger with a timeline.**

Three regions:

- **Ledger (left, dominant).** Rows append as signals resolve, each stamped with arrival
  time and source badge (`EDGE` / `CLIENT` / `TLS` / `YOU GAVE ME THIS`). Derived values
  render indented beneath their inputs so the preprocessing is visible. This region is
  complete and interesting before the model has produced a single token.
- **Deliberation (right, upper).** Streamed `thinking_delta`, monospace, auto-scrolling.
  Visibly a machine reasoning about the person reading it.
- **Portrait (right, lower).** Claims as cards: statement, confidence tier, falsifier,
  evidence chips. Hovering a chip highlights the ledger row. Thumbs up/down per card.

**Escalation ladder** as a row of consent buttons, each labeled with what it grants and what
it would enable. On grant: the signal enters the ledger, a new pass fires, cards animate.

For GPS specifically — reverse-geocode to a building via Nominatim/Overpass, because naming
the actual building is the moment that lands. Proxy both through the Worker: Nominatim
requires an identifying User-Agent (browsers will not let the SPA set it); CORS is not the
blocker. Cache responses aggressively. Then show the counterfactual rather than
overclaiming: one timestamped sample supports a weak home-vs-work prior; state plainly that
fourteen retained samples would give an address and an employer, and that this system
retains none.

**Pwned Passwords, not breached-account email.** The HIBP k-anonymity range endpoint is
Pwned Passwords — it is for passwords, not emails. The breached-account lookup takes a full
email, requires a paid API key, and is server-side only; there is no prefix-only mode for
emails. T5 instead asks the visitor to type a password they have used. Client SHA-1s it,
sends only the 5-character prefix (to `api.pwnedpasswords.com`, directly from the browser
if CORS allows, otherwise Worker-proxied), matches the suffix locally. The ledger shows
exactly what left the machine: the prefix, hit/miss, prevalence count. The password and
the full hash never enter sessions, the Worker, or the model. This is a better demo than
an email lookup, and it is actually k-anonymous.

**Empty state is a designed screen, not an error.** Hardened browser, VPN, Lockdown Mode,
denied permissions — the copy is "you gave me almost nothing, and here is what *that* tells
me," followed by real claims drawn from `privacy_posture`. Given the thesis, this is
arguably the best screen in the piece: the visitor who took every precaution is often the
most distinctive.

Transport: `fetch` + `ReadableStream` POST to `/api/infer`. EventSource is GET-only and
cannot carry the client signal set. Frames: `signal`, `thinking`, `claim`,
`pass_complete`, `error`. Calibrate and session-delete are ordinary POSTs to the Worker.

---

## 9. Eval harness (`evals/`) — built before the UI

Two loops. Only one can exist at V0, and it is the one that matters now.

**Offline (available immediately).** Signal sets are just JSON, so every capture is a
replayable test case. Build the fixtures corpus from your own devices deliberately.

`evals/fixtures/` is committed to a public repo — so committed files are sanitized:
IPs, hashes, coordinates, and any other identifying values replaced by
structurally-equivalent synthetics (same shape, same contradictions, not your
machines). Real captures live in `evals/fixtures.local/`, gitignored. The harness
prefers local when present, falls back to sanitized.

```
evals/fixtures/                 sanitized, committed
evals/fixtures.local/           real, gitignored; harness prefers these
  macbook-chrome-home.json      desktop, residential NL
  iphone-safari-mobile.json     locked down, carrier NAT
  macbook-brave-hardened.json   randomized canvas/audio
  linux-firefox-rfp.json        resistFingerprinting on
  vpn-datacenter-mullvad.json   geo/timezone contradiction
  ios-lockdown-empty.json       near-total signal denial
  corporate-vpn-split.json      corporate ASN, home behavior
```

Each carries a `ground_truth` block, because at V0 you are the subject and you know the
answers. That is what makes scoring possible before you have traffic.

Runner: for each fixture × prompt_version, `temperature: 0`, **N=3 repeats**. Repeats measure
non-determinism — identical inputs producing divergent portraits is a real number you will
want, and thinking models are not fully deterministic even at temp 0.

Scorer, per claim type:

- hit rate by confidence tier → reliability curve
- Brier score using tier midpoints
- Barnum-filter drop rate
- declined rate
- inter-repeat claim stability (Jaccard over `claim_type` sets)

Output: `evals/reports/<prompt_version>.md`, committed. Prompt edits become reviewable diffs
of behavior, which is the thing most LLM projects never build and then cannot iterate safely
without.

**Temperature is a config flag, not a hardcode.** Temp 0 for evals so fixture diffs are
meaningful; higher for the live piece so portraits do not read as canned. Log which was used
in `sampling`.

**Online loop.** Cannot produce a calibration curve at V0 — you are the only visitor. What
matters now is that the schema is right and the writes are happening, so the curve exists
the day traffic does.

---

## 10. Build phases

**Phase 0 — Spine.** Monorepo, `packages/schema` with claim enum + signal namespace + zod,
`packages/signals` collectors, three hand-authored fixtures, eval harness running against a
**stub inference function**. Prove the loop end-to-end before any model or UI exists.
*Done when:* `pnpm eval` emits a scored report from stub output.

**Phase 1 — Inference, headless.** Lambda with `streamifyResponse`, Anthropic client with
thinking enabled, prompt `p1`, validator. Driven from CLI against fixtures only. No browser.
*Done when:* `pnpm eval --prompt p1` produces real scored portraits and a reliability table.

**Phase 2 — Ledger.** Worker (assets, `request.cf` → T0, SigV4 proxy, KV kill switch), SPA
with ledger + deliberation + portrait, SSE wiring, sessions table with explicit delete.
*Done when:* loading the site produces a live ledger and a streamed portrait of you.

**Phase 3 — Escalation.** T5 buttons, GPS + Worker-proxied reverse geocode, motion,
Pwned Passwords. Multi-pass firing and claim-delta animation.

**Phase 4 — TLS plane.** Confirmed: `request.cf.botManagement.ja4` is not on this plan.
EC2, Go probe, DNS-01 certs, grey-clouded `tls.maxfarago.com`, T3 join. Isolated by
design — Phases 0–3 produce a live ledger and portrait with T3 absent.

**Phase 5 — Calibration + empty state.** Isolated calibration Lambda and role, thumbs
wired through the Worker with the calibration identity, empty-state screen and copy.
`p2` (sparse-fixture / scarcity-as-finding) is specified in `GLASSHOUSE_V02_PLAN.md` and
can land before calibration UI.

Phases 0–1 before any UI is the load-bearing ordering decision. It is also the ordering that
lets you throw away prompt `p1` cheaply.

---

## 11. Deferred (explicitly not V0)

Rarity counter and entropy budget (needs a corpus; consider seeding from published
Panopticlick / "Hiding in the Crowd" per-attribute entropy tables and labeling it as a
reference distribution rather than your own). Cumulative/path-dependent passes. Multi-model
side-by-side. Public feed with employee-count gating. Rate limiting, budget alarms, bot
tiering. Self-hosted model on RunPod — V1, and the reason the inference client is an
interface with one implementation from day one.

---

## 12. Locked decisions

1. **Name and domain.** Codename `glasshouse`. Apex `maxfarago.com` (replaces the current
   blank page). TLS probe `tls.maxfarago.com`, grey-clouded.
2. **JA4.** `request.cf.botManagement` is not on this plan. Phase 4 is in V0.
3. **Region.** Lambda + DynamoDB in `us-east-1`. V1 public EU traffic is a later problem;
   do not treat region as a noop at that point.
4. **Infra.** Makefile of AWS CLI calls, not Terraform. Before any provisioning, run
   `aws-ha` to select the correct local profile and confirm the account (it prints S3
   buckets). Never use the default AWS profile for this project.
5. **T4 close.** First of 8s cumulative pointer/scroll activity or 40s wall (or first T5
   grant). Wall-clock win sets `behavior_sparse: true` on that portrait.
6. **Git.** Default branch is `master` (never `main`). Never push to `master`. Only the
   operator pushes.
7. **Fixtures.** Sanitized structurally-equivalent synthetics in `evals/fixtures/`
   (committed). Real captures in gitignored `evals/fixtures.local/`. Harness prefers local.

