# Glasshouse — Tells refactor (locked spec)

Supersedes V0.3. Detection is deterministic. Narration is templated facts.
Synthesis is the model's — later, one Sonnet call, prompt `p4`.

This cut ships the no-LLM floor: a detector registry, fact templates, and tell
cards on top of the existing ledger. Collapse UI (R3) and inference (R4) wait
until that floor has been looked at.

---

## 0. Line

Unchanged from V0.3 §0:

**Detection is deterministic. Templates state facts. Synthesis is the model's.**

A detector that needs a judgment call to fire is a claim. Claims go through the
model, with a confidence tier, a falsifier, and a thumbs button.

Templates state the two observations. They do not complete the story.
`"Week starts on Sunday. Edge geo is NL, where weeks start on Monday."` is a
template. `"Your machine was set up somewhere else."` is abduction — it is not
a template. Same for `client_suppression`: fire on emptied fingerprint plus
intact Intl. Do not print "your hardening protects less than you think."
That slogan is the piece. If it is on a card, the model will only ever parrot it.

---

## 1. Naming

**Tell.** Poker sense. No corpus, no implied norm.

Not "anomaly." The site-wide counter is cut; there is no denominator.

---

## 2. Categories

| Category | Fire condition |
|---|---|
| `contradictory` | Two present signals disagree |
| `rare` | Closed-list mismatch. No surprisal table |
| `mapped` | Closed lookup hits a more specific entity |
| `withheld` | At least one non-citable signal was collected |

`revealing` is backlog. "More specific than the visitor expects" has no fire
condition. `postal_from_ip` on a residential ISP is a ledger row, not a tell.

`mapped` is the leftover that used to hide under revealing: a table hit, not a
judgment. `software_from_font` lives here. SF Mono → Xcode is not cut.

`bits` / `surprisal.json` / `bits_total` are not in this cut. Bits are a
stylesheet concern for R3, omitted from any infer payload. Closed-list `rare`
needs no priors table. Do not build one until a closed list fails in front of you.

---

## 3. Derived-layer fix (§4.1) — land first

Datacenter / relay geo is never a region. `asn_type === "datacenter"` → volatile
tier is `indeterminate`. Do not feed `geo.country` into the stickiness matrix
even when a city is present. Mullvad NY + `Europe/Amsterdam` is not a
person-region contradiction.

`net_vs_tz`: datacenter always `geo_absent`, never `contradict`. The old
`geo_absent` / `contradict` split on VPN exits is folded into tells
(`advertised_exit` / `evasion_incomplete`). Keep `netVsTz()` as detector input;
do not treat a datacenter city as a place.

Install set-intersection is already in `packages/signals`. Detectors read it.
They do not reimplement region sets.

---

## 4. Package

`packages/tells/` consumes `@glasshouse/signals` and `@glasshouse/schema`.
It does not fork stickiness, path-vs-body, suppression, or the font map.

```ts
export type TellCategory = "rare" | "contradictory" | "mapped" | "withheld";

export type Tell = {
  id: string;
  category: TellCategory;
  headline: string;
  detail: string;
  evidence: string[];
};

export type Detector = {
  id: string;
  category: TellCategory;
  requires: string[];
  detect: (s: SignalSet) => Tell | null;
};
```

Every detector is a pure function. Missing required keys → skip, return null.
Null values on required keys → skip, unless the detector's finding *is* a null
(fingerprint emptying). Absence is never `contradict`.

`requires` means the key is present on the set (including explicit `null`
where that is the observation).

---

## 5. Detectors in this cut

Only signals that already exist. Keyboard, voices, rDNS, DRM, CPU bench,
display scaling, fractional timezone, GPS, `APP_CATEGORIES` — out.

### 5.1 `contradictory`

- `install_vs_geo` — `agree.volatile_install === contradict`. Trusted geo only.
- `timezone_vs_geo` — `agree.volatile_fast === contradict`. Trusted geo only.
- `path_vs_body` — `path_vs_body === mixed`, and `asn_type` is not datacenter
  (datacenter is owned by evasion / advertised_exit).
- `client_suppression` — `client_suppression === suppressed`.
- `ua_vs_gpu` — UA platform vs WebGL vendor/renderer disagree (Windows UA +
  Apple GPU, etc.). SwiftShader is not a platform.
- `header_vs_client_langs` — primary language subtag of `Accept-Language` vs
  `navigator.languages[0]` differs.
- `intl_vs_ui_locale` — region of `langs[0]` (needs a subtag) is absent from a
  nonempty `install_regions`. Empty install set → skip.
- `evasion_incomplete` — datacenter/relay **and** suppression is `intact`.
- `advertised_exit` — datacenter/relay **and** a city **and** suppression is
  `suppressed`.

### 5.2 Fire-disjoint: tunnel × fingerprint

| Situation | Cards |
|---|---|
| Residential + Brave | `client_suppression` only |
| Mullvad + Chrome (fingerprint intact) | `evasion_incomplete` only — template facts include advertised city as exit. No second geo card. `path_vs_body` does not fire on datacenter. |
| Mullvad + Brave (fingerprint emptied) | `client_suppression` + `advertised_exit` |
| Relay, city null, collectors empty | `client_suppression` if Intl is present; else not. No `advertised_exit` without a city |

`evasion_incomplete` requires datacenter **and** not-suppressed (`intact` only).
`advertised_exit` requires datacenter **and** a city **and** `suppressed`.
They cannot co-fire. `client_suppression` never cares about ASN.

### 5.3 `rare` (closed lists)

- `calendar_non_gregorian` — present, not `gregory` / `iso8601`
- `direction_rtl` — `rtl`
- `numbering_non_latin` — present, not `latn`
- `weekend_non_standard` — present, not `[6,7]`
- `pwa_standalone` — `display_mode === standalone`

### 5.4 `mapped`

- `software_from_font` — `software_implied` nonempty. Closed font → vendor map
  already in signals. Inter / Arial / Menlo stay unmapped.
- `asn_names_org` — `asn_type` is `corporate` \| `education` \| `government`.
  Not residential, not mobile (that's `path_vs_body`), not datacenter (that's
  evasion / advertised_exit).

### 5.5 `withheld`

One tell, not one per signal. Fires when any id in `WITHHELD_SIGNAL_IDS` is
present on the set. Visitor-visible. **Stripped from any infer payload**
(`stripTellsForInfer`). Putting this tell in the model JSON undoes
`stripForInfer`.

---

## 6. Templates

No model call. Slots only. Plain, specific, no dramatics.

Headline is the two-fact collision in one line. Detail is the raw values.
Do not name tether, FWA, expat, American, or the piece's thesis.

---

## 7. UI this cut (floor, not R3)

Ledger still streams, all rows, source-badged.

After T2: tell cards in the side panel. Counter always visible:
`{n} tells from {m} signals collected.`

Evidence chips highlight ledger rows on hover, as today.

No collapse animation. No surprisal greying. Inference is **off** until R4 —
do not call Anthropic while looking at this floor.

R3 (later): collect → dwell → collapse into a strip, tell cards rise, ledger
one click away, rows cited by a tell brighter than the rest. Not bits.

---

## 8. R4 — later, not this cut

One Sonnet-4-6 call after tiers settle. Payload: tell list **minus withheld**,
raw signals via `stripForInfer`, `tiers_available`. No per-tell `bits`.

Prompt file is **`p4.md`**. Uncommitted `p3.md` is a draft and was never scored.
Do not edit scored `p1`/`p2` in place.

Keep raw signals in the payload. Detectors only find what they were written to
find.

Tell ids become citable evidence pointers (`tell.install_vs_geo`) in the schema
at R4, alongside raw ids. Claims cite tell **and** raw. Parroting metric:
fraction of claims whose evidence is only `tell.*` / `sig.derived.*`.

No JSON-pointer subpaths. Stickiness stays flat pairwise derived ids.

In-session cache only, keyed on full payload hash (tells + stripped signals +
prompt version). Tell-list hash is a fingerprint key. Forbidden.

`missed_tells`: harness only, `sampling === "deterministic"`. Not logged live.

Opus is an A/B on sparse fixtures only: N=1, lockdown + VPN. Not a corpus eval.
Sonnet is the default path. The spend win is one call over a short list.

Re-measure thinking budget after R4; do not cut it speculatively.

---

## 9. Eval

Detector unit tests: fire / no-fire on fixtures. No API. Every commit.

Tell-set stability: identical signal set → identical tell list.

`geo_absent` / indeterminate volatile on Mullvad (with city) and Private Relay:
unit tests, not an eval metric.

Barnum drop rate stays the primary regression signal when R4 exists.
Tell-only citation rate sits next to it.

N=3 corpus eval waits until N=1 on two sparse fixtures is green.

---

## 10. Order

1. §4.1 derived fix + unit tests.
2. R1 registry on existing signals + fire-disjoint tests.
3. R2 fact templates. Site with inference off. Look at it.
4. R3 collapse — likely the missing piece of the floor.
5. Recapture fixtures.
6. R4 `p4`, Sonnet, N=1 sparse, then decide on N=3 / Opus A/B.

Do not rewrite `packages/signals`. Tells consume it.
