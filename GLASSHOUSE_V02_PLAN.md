# Glasshouse — V0.2: Scarcity as Finding

> Addendum to `IMPLEMENTATION_PLAN.md`. Assumes V0 is producing portraits.
> The load-bearing change is the prompt. Probe expansion is inventory, not the body.
> This document *is* the base plan's `p2` (Phase 5 sparse-fixture prompt), plus a
> named exception to invariant 1. Do not mint `p3` for this.
>
> Still internal. Not public.

---

## 1. Motivation

The VPN test exposed the real weakness — not that signal was lost, but that the prompt
*narrated* the loss as a gap. A visitor on Mullvad through a Frankfurt exit still leaks
timezone, language, canvas, WebGL, fonts, codec support, hardware class, and behavior. None
of that touches the network layer. The correct portrait is not "I know less about you," it is
**"your VPN protects less than you think, and here specifically is what walks straight past
it."** That is a stronger demonstration than a portrait of an unprotected visitor.

`p2` is the product change. Collectors come after it scores.

---

## 2. Invariant 1 — withheld signals

A deliberate exception, not a validator footnote.

**Shown to the visitor, withheld from the model.** Accessibility-adjacent media queries
correlate with visual impairment and vestibular disorders. They render in the ledger,
marked *"collected, shown to you, withheld from the model, and here is why."* They are
stripped from the infer payload. The model never sees them. If a withheld ID appears in
`evidence`, the claim is dropped with reason `non_citable_evidence` — fail-closed.

Semantics:

- two signal sets (ledger vs infer)
- two hashes (`signal_set_hash` is the infer set; ledger may show a second hash or a
  withheld-count, but the model is scored against what it was given)
- enforcement is strip-from-payload, not "please don't cite these"

This is a **fix to shipped behavior**, not a guard for new IDs. V0 already sends
`sig.client.prefers_reduced_motion` to the model as T1. First commit of V0.2, before any
prompt work, and not entangled with a prompt experiment you might revert.

```
sig.client.prefers_reduced_motion          (already T1 — withhold now)
sig.client.css.forced_colors
sig.client.css.inverted_colors
sig.client.css.prefers_contrast
sig.client.css.prefers_reduced_transparency
```

`prefers-reduced-data` is not in this set. `prefers-color-scheme` stays citable.

---

## 3. Claim types

Add two. The rest are `p2` reasoning rules, not enum slots. More slots = more empty-slot
pressure, which is what Barnum drop rate is watching.

```
network_evasion       // what they're doing at the network layer, and what it does/doesn't hide
installed_software    // protocol handlers + font probe hits — later; unused until those exist
```

Do **not** add `hardware_class` or `regional_config`. Those are instructions over
`device_tier` / `device_family` and `location_region` / `language_profile`.

---

## 4. Prompt `p2`

Replace any language implying that missing signals are a limitation. Absence is evidence
about the person, not a gap in the evidence. A visitor who denied signals made choices,
and those choices are informative.

Reasoning rules (not new types):

- Datacenter or VPN ASN → a deliberate step. Who does that, and what do the local signals
  say regardless?
- Timezone contradicting IP geo → local timezone is far more likely true. State that and
  prefer it.
- `Intl` regional configuration (first day of week, numbering, calendar) is set at OS
  install and survives every network-layer defense. Weight it when the network is obscured.
- Network Information describes the connection *inside* the tunnel.
- Hardened browsers are rarer than default ones. The privacy-conscious visitor is often
  more distinctive, not less. Say so.

**Sparse fixtures are the primary corpus**, not a tail check: `ios-lockdown-empty`,
`macbook-brave-hardened` (does not exist yet — author it), `vpn-datacenter-mullvad`, and
`vpn-plus-hardened` (both defenses stacked). `macbook-chrome-home` stays in the set so
dense portraits don't regress.

**Deliberation.** Verbosity is a UI/budget concern; `p2` is a content concern. Do not
change both and then be unable to attribute the result. Ship the fixed-height auto-scroll
pane (last N lines) whenever. Hold `budget_tokens` until `p2` is scored. Haiku remains
the fallback if terse thinking on Sonnet still floods the pane.

---

## 5. Collector schedule (not `SIGNAL_TIERS`)

Do not add T2a/T2b/T2c to `packages/schema`. T2 stays T2. Latency buckets are how
collection is scheduled and when pass 1 fires, not a schema change — that would ripple
through `tiers_available` and the validator for no inferential gain.

| Bucket | Latency | Contents | Pass |
|--------|---------|----------|------|
| T2 sync | <50ms | CSS (non-withheld), Intl deep, WebGL sweep, device kinds, netinfo, font probe list | included in pass 1 |
| T2 async | 200–800ms | Codec/DRM, CPU bench in a Worker | wait for settle, still pass 1 |
| T2 protocol | 1–3s | Scheme scan | **deferred** — see §7 |

Pass 1 fires once T2 sync+async have settled. No second pass in V0.2. Multi-pass is
Phase 3 (claim-delta UI, rule for superseded pass-1 claims). Do not sneak it in through
a protocol scanner.

---

## 6. Probes (after `p2` scores)

Highest value per byte first. Verify DRM and CPU class in a real Chrome window, not the
Cursor/Electron webview.

**CSS media battery** — free, sync. `pointer` / `any-pointer` / `hover` is the touch-vs-mouse
discriminator that survives network anonymization. `dynamic-range: high` and `color-gamut: p3`
proxy newer displays. Marked queries go to the ledger and the withheld set (§2), never
the model.

**`Intl` deep probe** — `weekInfo.firstDay` / weekend, numbering, calendar, `supportedValuesOf('timeZone').length`.
Null on older Safari/Firefox is a signal; do not read missing as "not regional."

**WebGL sweep** — both GL1 and GL2. Primary output is the sorted-extension hash; maxima are
supporting evidence. WebGL2 availability is a generation bit.

**Device kinds** — `enumerateDevices()` without permission: presence of camera / mic / speaker,
not counts. Chromium is tightening toward one entry per kind.

**Network Information** — Chromium only. Measures the connection *inside* the tunnel.
`effectiveType` + `rtt` as a class (cellular / wifi / ethernet), not a measurement.

**Codec / DRM** — T2 async. Widevine L1 vs L3, HEVC/AV1 hw decode, FairPlay as an Apple tell.
Safari is FairPlay; Firefox is messy.

**CPU bench** — Web Worker, 100–200ms workload, median of several runs, report `low` / `mid` /
`high`. Cross-check against `hardwareConcurrency`. Never display the ms.

**Font probe list** — ~30 names chosen for software inference (Adobe, Office, Xcode, coding
fonts). Width vs fallback. Every hit is an install. **Do not `@font-face` those names** —
that silently turns the probe into a webfont hit.

**Derived `net_vs_tz`** — three-way, not a boolean:

```
agree        // IP geo and timezone cohere
geo_absent   // datacenter/VPN, no useful city — not a contradiction
contradict   // Amsterdam IP + America/New_York (the interesting one)
```

Collapsing `geo_absent` and `contradict` loses the finding `p2` is for.

### New signal IDs (append only)

```
sig.client.css.*                  (media queries; withheld subset in §2)
sig.client.intl.calendar          sig.client.webgl.ext_hash
sig.client.intl.numbering         sig.client.webgl.max_texture
sig.client.intl.first_day         sig.client.webgl.precision
sig.client.intl.weekend           sig.client.webgl2_available
sig.client.intl.tz_count          sig.client.devices.kinds
sig.client.netinfo.effective_type sig.client.drm.widevine_level
sig.client.netinfo.rtt            sig.client.codec.hevc_hw
sig.client.netinfo.downlink       sig.client.codec.av1_hw
sig.client.netinfo.save_data      sig.client.bench.class
sig.client.fonts.probe_hits       sig.apps.detected
sig.derived.net_vs_tz             // agree | geo_absent | contradict
sig.derived.hw_tier
```

---

## 7. Protocol scan — deferred

On-thesis, commercially real, least reliable. Scheme flooding is mitigated; what remains
is timing side channels. Cap any future positive at `PLAUSIBLE`. Serialized probes, ledger
pre-announcement, T4 gated off for the duration.

**Do not run it in V0.2.** Not because dialogs are annoying — because dialogs steal focus
and corrupt T4, and T4 does not exist yet. The scan is unmeasurable *and* disruptive.
Defer until T4 exists, gated off by default, folded into pass 1 (or a real Phase 3
multi-pass), never as its own pass through the side door. V1 consent-gate is still a
config flag on a separate collector, not a schema tier.

---

## 8. Build order

**Commit 0 — withhold.** Strip `prefers_reduced_motion` (and the withheld CSS IDs, even
if not yet collected) from the infer payload. Validator drop `non_citable_evidence`.
Ledger copy for the withheld row. Own commit. Do not mix with `p2`.

**Step 1 — `p2`.** Four claim-enum additions are two: `network_evasion`, `installed_software`.
Author `macbook-brave-hardened` and `vpn-plus-hardened`. Eval N=3 against the sparse set.
Afternoon, including the reliability table. This is the VPN portrait fix.

**Step 2 — T2 sync.** CSS (non-withheld), Intl, WebGL ext hash, netinfo, font probe list,
`net_vs_tz`. All cheap, no permissions.

**Step 3 — T2 async, only if device-class portraits still feel thin.** Codec/DRM, CPU bench.
Ledger must still paint sync rows first.

**Step 4 — protocol scan.** Not this version. See §7.

**Then** re-run the full corpus against `p2` vs `p1`. Watch Barnum drop rate — a wider
surface is more material to over-reach with.

Auto-scroll deliberation pane can land in any of these; it is not a variable in the `p2`
eval.

---

## 9. Still deferred

Everything in §11 of the base plan, plus T2c / public-protocol-scan judgment (V1, after
T4 exists and you have seen the dialogs). Consent gate for the scan. `budget_tokens` cut
until `p2` scores. Haiku. Apex NS cutover is orthogonal and not this document.
