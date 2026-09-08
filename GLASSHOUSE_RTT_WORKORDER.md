# Glasshouse — Work Order: Network Timing Collector

> Adds one T4 collector that measures RTT *structure* over a WebSocket, and derives a
> transport class from it. Small scope: one new endpoint, one new collector, one new detector,
> one new input to an existing detector.
>
> **Not** a bandwidth test. Throughput measures the path to the Cloudflare edge under current
> conditions — cafe wifi, a busy household, a backgrounded tab, or your own page assets all
> corrupt it. The signal is in the latency distribution, not the number of megabits.

---

## 1. What this buys

`navigator.connection.effectiveType` is a quality bucket, not a transport type — fast wifi,
ethernet, and real LTE all report `"4g"`. This collector produces the thing that field
pretended to be.

RTT distribution separates transports by *shape*:

| Transport | Median | Std dev | Tail |
|---|---|---|---|
| Wired | low | very tight | short |
| Wifi | low–moderate | moderate | periodic spikes (scanning, retransmit) |
| Cellular | moderate–high | high | long |
| Satellite | ~25–60ms | high | periodic bumps from handoff |

Two things fall out of that, and they are the point:

- **VPN detection from physics.** Minimum RTT bounds the maximum possible distance. A visitor
  claiming Amsterdam with 140ms minimum to the Amsterdam colo is not in Amsterdam, regardless
  of whether their exit IP is on any list.
- **Disambiguating `path_vs_body`.** A mobile ASN with wired-looking timing is tethering. A
  residential ASN with cellular-looking jitter is fixed wireless. That detector currently
  reports `mixed` and leaves the case open; transport class closes it.

---

## 2. Server: WebSocket echo

`apps/worker` — new route `/api/rtt`.

A plain Worker handles this with `WebSocketPair`; no Durable Object is needed since there is
no cross-connection state.

```ts
if (request.headers.get("Upgrade") === "websocket") {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.addEventListener("message", e => server.send(e.data));  // echo, immediately
  return new Response(null, { status: 101, webSocket: client });
}
```

Echo the payload unchanged and do nothing else — any server-side work becomes measurement
noise. All timing happens client-side, so no clock synchronisation is needed.

---

## 3. Client collector (`src/signals/rtt.ts`)

**Tier T4.** Runs alongside behavioral collection. Must not gate any earlier tier or block a
ledger row.

**Protocol.** 30 pings at 100ms intervals — about 3 seconds total. Payload is a sequence
number and a `performance.now()` timestamp, roughly 20 bytes. RTT is measured on echo receipt.

**Abort conditions.** Timing is garbage if the tab is not foregrounded. Abort and emit
`indeterminate` on `visibilitychange` to hidden, on blur, or if the socket fails to open
within 2s. Do not emit partial statistics from fewer than 20 samples.

**Emit:**

```
sig.client.rtt.min          // least contaminated by queueing — the distance signal
sig.client.rtt.median
sig.client.rtt.p95
sig.client.rtt.stddev
sig.client.rtt.samples      // count actually collected
sig.edge.colo               // from request.cf.colo, captured at T0
```

`min` matters most and deserves its own ledger row. Queueing only ever adds latency, so the
minimum is the closest you get to the true path.

---

## 4. Derived: transport class

`src/signals/derived/transport.ts` → `sig.derived.transport_class`

Classify on `(median, stddev, p95/median)`:

```
wired         median < 25ms,  stddev < 4ms,   p95/median < 1.5
wifi          median < 40ms,  stddev 4–15ms,  p95/median < 3
cellular      stddev > 15ms   or p95/median > 3
indeterminate anything else, or samples < 20
```

Treat these thresholds as a starting point and tune against your own machine on ethernet,
wifi, and a phone hotspot before trusting them. Note that the colo distance shifts the medians
— a visitor far from any Cloudflare edge looks slower on every transport — so **compare stddev
and the p95 ratio ahead of median.** Those are shape, not distance.

Satellite has a real signature (periodic bumps at roughly 15-second intervals) but detecting
periodicity reliably needs a longer sample window than 3 seconds. **Defer.** Do not add a
`satellite` class you cannot detect.

---

## 5. Detector changes

### 5.1 New: `rtt_vs_claimed_geo` (contradictory)

Fires when the minimum RTT is physically inconsistent with the claimed location.

Simple V1 rule, no distance table needed: if `asn_type` is residential (so geo is trusted)
and the claimed city is served by the colo that handled the request, then `rtt.min > 80ms` is
a contradiction.

The refinement, if you want it later: light in fiber travels ~200 km/ms, so a round trip
bounds maximum distance at roughly `rtt.min × 100` km. Comparing that against the real
distance from the claimed city to the colo gives a hard physical bound rather than a
threshold. Needs a colo → coordinates table; not worth it for V1.

Template states facts only, per the templates rule: the measured minimum, the colo that
served the request, and the claimed city. Not "you are not where you say you are."

**Caveat to encode in the template:** a VPN adds its own latency, so this gets muddier exactly
where you most want it. It bounds minimum distance; it does not locate anyone.

### 5.2 Modify: `path_vs_body`

Add `transport_class` as a **fourth input**, alongside `asn_type`, `device_family`, and
`css.pointer`.

Do **not** create a separate `transport_vs_asn_type` detector. It would fire on the same
visitors as `path_vs_body` and produce two cards for one situation — the same overlap bug
already flagged for `evasion_incomplete` and `client_suppression`. One detector, one card,
richer inputs.

---

## 6. Explicitly not building

- **Bandwidth / throughput test.** Competes with page assets, generates real load, measures
  conditions rather than the visitor.
- **Buffer bloat** (latency under load). Genuinely interesting as an equipment-quality signal,
  but it requires a sustained download and a longer window. V2 at the earliest.
- **WebRTC data channels.** Better numbers, infrastructure you do not have.
- **Satellite class.** See §4.

---

## 7. Order and acceptance

1. Worker `/api/rtt` echo route. Verify a round trip in the browser console.
2. Collector, with abort conditions. Verify it emits nothing usable when the tab is
   backgrounded — that is the correct behavior, not a bug.
3. Calibrate thresholds on your own machine: ethernet, wifi, phone hotspot. Record the three
   distributions in the fixture corpus.
4. `transport_class` derived value + ledger row.
5. `rtt_vs_claimed_geo` detector + unit test.
6. Feed `transport_class` into `path_vs_body`; assert only one card fires for a tethered
   visitor.
7. Re-capture fixtures — payload shape changed.

**Acceptance:** on your own connection, `transport_class` reads `wired` or `wifi` correctly
and `rtt_vs_claimed_geo` does not fire. Through a distant VPN exit, `rtt_vs_claimed_geo` fires.
