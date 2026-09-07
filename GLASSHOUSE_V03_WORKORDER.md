# Glasshouse — V0.3 Work Order: Deterministic Quasi-Identifier Layer

> Adds a derived layer that computes **structural relations** between signals — stickiness
> disagreement, estimated surprisal, category presence/absence — and hands those to the model
> as findings. The model still does the narrative abduction.
>
> Depends on V0.2 Groups A and B (the `Intl` and voices collectors). Land those first.

---

## 0. The line: structural vs interpretive

The base plan's rule stands: **do not compute composites that are claims about a person.**
Composition is the model's job, and hardcoding "expat" or "corporate laptop" as a detector
smuggles your priors in as determinism — the model will then restate them with confidence it
did not earn, which is precisely the failure this project exists to critique.

The line:

| Compute deterministically | Leave to the model |
|---|---|
| These two signals disagree | What the disagreement means |
| This value is rare in this region | Why the person has a rare value |
| These app categories are present, these absent | What kind of person that is |
| This font ships with this software | What the person does for work |
| The language list contains a non-English entry | Whether they're a heritage speaker |

Every derived value must be a **fact about the signal set** that a reasonable person would
verify the same way. If it needs a judgment call, it's a claim, and claims go through the LLM
where they get a confidence tier, a falsifier, and a thumbs button.

All derived values render in the ledger next to their inputs, per the existing rule. The
preprocessing stays visible.

---

## E1. Stickiness tier registry

`packages/schema/stickiness.ts`

The generative idea: signals change at radically different rates, and a disagreement between
tiers timestamps a transition rather than merely narrowing a population.

```ts
export const STICKINESS = {
  VOLATILE:  ["sig.edge.geo.country", "sig.edge.geo.city", "sig.edge.asn",
              "sig.derived.asn_type"],                    // instant — VPN, travel
  FAST:      ["sig.client.timezone"],                     // hours — auto-updates on travel
  SLOW:      ["sig.client.langs", "sig.client.intl.currency"],  // occasional, user-set
  INSTALL:   ["sig.client.intl.first_day", "sig.client.intl.hour_cycle",
              "sig.client.intl.measurement", "sig.client.intl.calendar",
              "sig.client.intl.numbering", "sig.client.intl.weekend",
              "sig.client.intl.direction"],               // OS setup — essentially never
  HARDWARE:  ["sig.client.keyboard.layout"],              // hardware purchase
  DELIBERATE:["sig.client.voices.langs"],                 // years, deliberate action
} as const;
```

Each tier gets a **region inference** where one is derivable: geo → region directly; timezone
→ region; `first_day`/`hour_cycle`/`measurement`/`weekend` → a region *set* (not a single
region — see E2).

---

## E2. Agreement matrix

`src/signals/derived/agreement.ts`

Replaces `sig.derived.net_vs_tz_conflict`, which was the first instance of this pattern
hardcoded as a one-off.

For each stickiness tier that yields a region signal, emit the inferred region set, then emit
a pairwise agreement matrix:

```jsonc
"sig.derived.stickiness": {
  "tiers": {
    "volatile": { "region": "NL", "source": "sig.edge.geo.country" },
    "fast":     { "region": "NL", "source": "sig.client.timezone" },
    "install":  { "regions": ["US","CA","JP","IL","MX","BR","..."],
                  "sources": ["first_day","hour_cycle","measurement"] },
    "deliberate": { "regions": [], "source": "sig.client.voices.langs" }
  },
  "matrix": [
    { "a": "volatile", "b": "fast",    "verdict": "agree" },
    { "a": "volatile", "b": "install", "verdict": "contradict" },
    { "a": "fast",     "b": "install", "verdict": "contradict" }
  ],
  "pattern": "volatile=fast≠install"
}
```

Three verdicts only: `agree` | `contradict` | `indeterminate`. `indeterminate` when either
side is absent or the region sets overlap. **Never collapse a missing value into
`contradict`** — datacenter ASN with no city is a different finding from Amsterdam IP with a
New York timezone, and the earlier boolean flag lost that distinction.

`pattern` is a compact string the model can pattern-match on. Emit it; do not interpret it.

**Critically: do not label the pattern.** No `"relocated"`, no `"vpn"`, no `"traveling"`.
Those are the four stories the model should derive from the pattern in `p2` (see E6). The
moment code names them, the model stops reasoning and starts reading.

`first_day: 7` is **not** an American signal on its own — Sunday-first covers the US, Canada,
Japan, Israel, much of Latin America and East Asia. Emit the full region set. Narrowing to a
country comes from intersecting with the locale tag and other tiers, and that intersection is
the model's work.

---

## E3. Estimated surprisal

`data/reference/surprisal.json` + `src/signals/derived/surprisal.ts`

Per-*value* rarity, not per-feature. `first_day: 1` in Europe is worthless; `first_day: 7` in
Europe is decisive. Same field.

This reintroduces a bounded version of the rarity counter cut from V0, but from **hardcoded
reference priors rather than a live corpus**. That distinction must be visible: label every
surprisal value in the ledger as *estimated from published reference distributions, not
measured from this site's visitors*. Claiming otherwise would be the exact dishonesty the
piece is about.

Table shape — keep it small, roughly 8–10 attributes:

```jsonc
{
  "sig.client.intl.first_day": {
    "conditional_on": "sig.edge.geo.country",
    "values": { "EU/*": { "1": 0.3, "7": 6.5 }, "US": { "7": 0.2, "1": 5.8 } }
  },
  "sig.client.intl.numbering":  { "values": { "*": { "latn": 0.1, "arab": 9.2, "deva": 10.1 } } },
  "sig.client.hardware_concurrency": { "values": { "*": { "8": 1.2, "11": 6.8, "14": 7.1 } } },
  "sig.client.timezone_offset_fractional": { "values": { "*": { "false": 0.05, "true": 7.4 } } }
}
```

Values are bits of surprisal. Source them from published entropy tables and regional
statistics where available; where estimated, mark the entry `"estimated": true`.

Emit `sig.derived.surprisal`: a sorted list of `{signal_id, value, bits}` for every signal
with a table entry, highest first. Also emit `bits_total` — with an explicit note that naive
summing assumes independence and therefore **overstates** identifying power, because real
attributes are heavily correlated. Panopticlick made exactly this error; do not repeat it
silently.

Add a derived boolean `sig.derived.timezone_offset_fractional` — whole-hour offsets are the
global norm, so a `:30` or `:45` offset is high-surprisal on its own.

**Ledger use:** weight rows visually by surprisal. Modal values quiet and grey, off-mode
values bright. This makes the project's core concept legible at a glance and is probably the
highest-value UI change available.

---

## E4. Category presence/absence

`src/signals/derived/categories.ts`

Absence is as informative as presence, and neither is currently structured.

**Apps** — categorize the T2c probe list by function, emit set membership:

```ts
const APP_CATEGORIES = {
  work_comms:    ["slack", "msteams", "zoommtg"],
  dev:           ["vscode", "postman", "figma"],
  entertainment: ["spotify", "netflix"],
  gaming:        ["steam", "discord"],
  personal_comms:["whatsapp", "tg"],
  productivity:  ["notion", "obsidian"],
};
```

Emit `categories_present` and `categories_absent`. Do **not** emit
`"corporate_laptop_pattern"` — that's the interpretation, and it's the model's.

**Fonts** — map probe hits to the software that ships them. This is factual and citable:

```jsonc
{ "Minion Pro": "Adobe Creative Cloud", "Calibri": "Microsoft Office", ... }
```

Emit `sig.derived.software_implied` as a list. A font that ships only with one company's
brand kit is the highest-precision employer signal available and bypasses ASN entirely —
worth seeding the table with a handful of well-known corporate brand fonts.

**Languages** — emit structural facts about the stack, not conclusions:

```
sig.derived.lang.ui_primary
sig.derived.lang.secondary_entries        // beyond the first
sig.derived.lang.voices_not_in_ui_list    // installed voices for languages not in navigator.languages
sig.derived.lang.local_language_present   // does the list include the geo region's language
```

That last one plus the agreement matrix is what lets the model distinguish a local from a
visitor from a heritage speaker — without any of those words appearing in the code.

---

## E5. Schema and validator

1. Append all new IDs to the namespace in `packages/schema`. **Append only.**
2. All E1–E4 outputs are **citable evidence** — they're structural facts, not accessibility
   signals. They do not go on the non-citable list.
3. Ledger rendering: derived values indent under their inputs, per the existing rule. The
   agreement matrix and surprisal list each get their own ledger row with an explicit
   "computed from the above" label.

---

## E6. Prompt `p2` additions

**The four stories.** Give the model the agreement patterns and what distinguishes them — as
reasoning material, not as a lookup:

```
volatile = fast = install        → configured where they are
volatile = fast ≠ install        → the person moved; the OS did not
volatile ≠ fast = install        → the device never moved; the network claims otherwise
volatile = install ≠ fast        → travelling; timezone auto-updated, nothing else did
```

Note that `deliberate` (installed voices) and `hardware` (keyboard layout) cut across all
four and often settle which story is right.

**Surprisal weighting.** Instruct: prefer high-surprisal signals as evidence. A claim resting
on a 6-bit value is worth more than one resting on three 0.2-bit values. Cite the surprisal
figure when it's doing the work.

**The independence caveat.** Tell the model `bits_total` overstates identifying power because
attributes correlate, and that it must not present the total as a uniqueness claim.

**Absence as evidence.** `categories_absent` is a finding. A machine with work comms and no
entertainment or gaming software is informative *because* of what's missing.

**Anti-parroting rule.** The derived layer supplies facts, not conclusions. The model must not
restate a derived value as a claim — `"pattern: volatile=fast≠install"` is evidence for a
claim about relocation, not the claim itself. Every claim still needs its own reasoning and
falsifier.

**Age inference guard.** The obvious age signals — browser zoom, default font size,
`prefers-contrast` — run through the non-citable accessibility list. Age claims must rest on
software-era and device-generation evidence instead, or they infer from disability by proxy.

---

## E7. Explicitly do not build

- Named pattern detectors (`is_expat`, `is_corporate_laptop`, `is_designer`). Interpretive.
- A composite "identifiability score" presented as measured. The surprisal total is estimated
  from reference priors and must be labeled as such everywhere it appears.
- Live corpus counting. Still deferred; nothing per-visitor persists.
- Any derived value that requires a judgment call to compute.

---

## Order and acceptance

1. **E1 + E2** — stickiness registry and agreement matrix. Verify on your own machine (expect
   `volatile=fast≠install`) and on a VPN (expect `volatile≠fast=install`).
2. **E3** — surprisal tables and lookup. Verify `first_day: 7` scores high in NL and near-zero
   in US.
3. **E4** — category and font mapping. Fonts first; apps depend on T2c, still gated off.
4. **E5** — schema and ledger rendering, including surprisal-weighted row styling.
5. Re-capture fixtures. Again — E1–E4 change the payload shape.
6. **E6** — `p2` additions, N=3 eval, sparse fixtures first.
7. Compare to the prior `p2` run on **Barnum drop rate** and on whether claims now cite
   derived signals. If the model cites `sig.derived.*` for everything and stops reasoning
   about raw signals, the anti-parroting rule needs strengthening — that's the main failure
   mode to watch for here.
