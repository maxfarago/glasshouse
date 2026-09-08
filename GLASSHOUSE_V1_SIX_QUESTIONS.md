# Glasshouse — V1: Six Questions

> Locked. Incorporates the review pass: observation lines stay two-fact templates;
> order inverted so the terminal is the gate; next prompt is `p5`.
>
> A bold refactor, not a strangler fig. Three changes — **not** landed together:
>
> 1. **The UI becomes a terminal.** Observation lines from existing R2 templates,
>    centre screen, typeface of address, voice of facts. Ledger and deliberation
>    behind a toggle. This is the gate.
> 2. **The claim enum is replaced** by six fixed questions with closed answer sets.
>    Only after the terminal reads.
> 3. **New probes**, later, and T4 probes do not feed pass 1.
>
> This invalidates every eval report scored against the old enum — including the
> `p4` N=1. Do not run N=3 on the old enum.

---

## 0. What survives

**Survives untouched:** all collectors (T0–T5), the derived layer, the stickiness
matrix, the detector registry from R1, templates from R2 (fact voice), the
withheld-signal firewall, the calibration table, the ephemerality invariants.

**Replaced:** the claim type enum (at step 2), the portrait schema (at step 2),
the ledger-and-cards UI (at step 1), prompt `p4` (at step 2 — new file `p5`).

**Reframed:** tells stop being cards and become observation lines. R1 and R2
work is not wasted — it is the no-LLM floor.

---

## 1. The six questions

Six, in rough order of tractability. Closed answer sets. Locked after the
terminal has been looked at; written here so the schema pass does not reopen them.

### 1.1 `location`

The one hybrid. Granularity is closed; the place name is not.

```ts
granularity: "country" | "region" | "city" | "indeterminate"
place: string        // scored by thumbs, not by class
```

No `district` / `building` until T5 exists.

VPN does **not** make this indeterminate. A datacenter ASN drops granularity, it
does not zero the question. Install-time config, timezone, language list still
carry it. Do not mention voices or RTT in the prompt until those collectors
exist.

### 1.2 `work_or_home`

```
home | work | third_place | transit | indeterminate
```

Pass 1 answers from `asn_type`, local time, and display setup only. T4
(`pointer_device`, RTT / transport class) does **not** feed pass 1. Datacenter
ASN → usually `indeterminate`. Corporate or education is the only near-definite
`work`.

### 1.3 `technical_expertise`

```
non_technical | technical | expert | indeterminate
```

Three rungs, not five. Privacy sophistication is not developer-ness. Brave plus
Mullvad is a different axis from Xcode installed; do not conflate them. Opening
the inspect toggle is curiosity, not expertise.

### 1.4 `visit_reason`

```
recruiter | potential_client | developer_peer | press | personal_contact
| curious_stranger | self_test | indeterminate
```

Referrer-derived cases may answer. Everything else declines. LinkedIn →
recruiter (or professional contact) is a real inference; no-referrer → "someone
told them" is not. High decline rate is fine if the decline line reads.

`network_posture` is the better sixth if this question's live decline rate makes
it dead. Until then it is not a seventh question — the punchline stays in tell
lines (`evasion_incomplete`, `advertised_exit`, `client_suppression`).

### 1.5 `profession`

```
software_engineering | design | data_analytics | product | marketing | finance
| legal | academia | creative_media | operations | student | indeterminate
```

Default is decline. Answer only from mapped tells (fonts, extension categories
once gated, non-residential ASN org). Display gamut is not a profession signal.
There is no `other` guess.

### 1.6 `age_cohort`

```
under_25 | 25_34 | 35_49 | 50_plus | indeterminate
```

**Permanently capped at HUNCH.** Accessibility-adjacent signals are withheld.
What remains is generational software preference, coarse by construction.

### 1.7 Gender — omitted

Not in the enum, not collected for, not asked.

---

## 2. Schema refactor

Step 2. Not this cut.

```ts
export type Answer = {
  question: QuestionId;
  value: string | null;              // closed set, or null if declined
  confidence?: "HUNCH" | "PLAUSIBLE" | "LIKELY" | "CONFIDENT"; // omit when declined
  evidence: string[];                // sig.* and tell.* pointers. EMPTY = DECLINED.
  reasoning: string;
  falsifier: string;
  declined_reason?: string;
};

export type Portrait = {
  portrait_id: string;
  session_id: string;
  pass_index: number;
  prompt_version: string;
  model_id: string;
  sampling: "deterministic" | "live";
  payload_hash: string;
  tiers_available: string[];
  answers: Answer[];                 // ALWAYS length 6, in fixed order
  missed_tells?: Array<{ id: string; why: string }>; // harness only
};
```

**Validator:**

- `value` in that question's closed set, or `null`. Anything else → force decline.
- `value != null` XOR `declined_reason` present. Both or neither → force decline.
- Declined answers must not carry `confidence`.
- Empty `evidence` → force decline.
- Non-citable evidence pointer → force decline, log `non_citable_evidence`.
- `age_cohort` confidence > HUNCH → downgrade to HUNCH, log.
- Withheld tells stripped from the infer payload upstream.

`thin_signal_note` is not a portrait field. The VPN sentence is a tell line
(`evasion_incomplete` / `advertised_exit`). `language_profile` is not a
question; it is a standing observation line from header + client langs.

---

## 3. UI — the terminal

The visitor should feel addressed, not shown a dashboard. Monospace, dark, a
single centred column of text that accumulates. No cards, no chrome.

### 3.1 Two kinds of line

**Observation lines** — templated from tells. Two facts. No abduction. Terminal
*typeface*, not terminal *voice*. Address ("you are…", "I think…") belongs on
answer lines, which do not exist until step 3.

```
Week starts on Sunday. Edge geo NL starts on Monday.
Fingerprint collectors came back empty. Intl did not.
Mullvad VPN exit in New York. Fingerprint collectors returned values.
Accept-Language is nl-NL,nl;q=0.9. Client list is nl-NL, nl, en.
```

Not: "You are on a Dutch residential connection."

**Answer lines** — later. Six questions, streamed after inference.

```
I think you are in central Amsterdam.        [likely]
I think you are at home.                     [plausible]
```

Declines render as lines too. Declined answers have no confidence suffix.

### 3.2 Pacing

T0/T1/T2 arrive in a burst. Do not pretend collector timing is the rhythm.
After T2 settles: type observation lines with deliberate gaps. Fake it on
purpose. Counter may tick during collection — that part is real.

### 3.3 Inspect toggle

Honesty invariant: nothing in an answer line may cite a signal not present in
the inspect panel. The panel is the model's entire input.

Default-closed *raw ledger* is allowed. Default-hidden *tells* is not.

On the page: counter line + observation (tell) lines.

Behind one affordance — *"show me what you are reading"* — the raw ledger and,
later, deliberation. Hover/focus on an observation line highlights its evidence
rows in the ledger (opens inspect if closed).

### 3.4 Counter line

```
63 signals collected. 7 tells. 5 withheld from the model.
```

Not "unusual." No site-wide surprisal. Withheld count is withheld *signals*,
not the withheld tell.

---

## 4. New probes

Later. Not this cut.

T4 probes (scroll quantisation, RTT) do not feed pass 1. Refresh rate and
blocker (`present: boolean` first) are pass-1-eligible when we get there.
Extension detection and cache-timing gated like T2c.

---

## 5. Prompt `p5`

New file. `p4` is scored against the old enum; do not reuse the name.

Carry forward from `p4`: tells are evidence not conclusions, VPN does not zero
location, `geo_absent` is not contradict, `first_day: 7` is a set not American,
`age_cohort` HUNCH cap, reason-once, no bits.

Sonnet. Opus A/B only if sparse `p5` fails under contradiction.

---

## 6. Eval

Re-annotate fixtures with all six answers. N=1 on two sparse fixtures until
green before any N=3. Per-question accuracy, confusion matrix, calibration,
decline rate, tell-only citation rate, decline-vs-guess ratio.

---

## 7. Order

1. **Terminal floor** from existing R2 templates. Inference off. Look at it.
   Tune pacing. This is the gate.
2. **Schema** — `QUESTIONS`, `Answer`, `Portrait`, validator. `p5`. Fixture
   ground-truth re-annotation. N=1 sparse.
3. **Wire inference** — six answer lines, thumbs, inspect panel gains
   deliberation.
4. **Cheap probes**, then gated expensive ones. Re-capture, full eval.

If step 1 does not read, stop.
