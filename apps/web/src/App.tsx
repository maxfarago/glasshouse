import { isWithheldSignalId, SIGNAL_REGISTRY, sourceOf, stripForInfer, type SignalId, type SignalSet } from "@glasshouse/schema";
import { derive } from "@glasshouse/signals";
import { detectTells } from "@glasshouse/tells";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectBrowserT2, collectT1Now } from "./collect.ts";
import { readSse } from "./sse.ts";

type Src = "EDGE" | "CLIENT" | "TLS" | "YOU" | "DERIVED";
type Row = { id: string; at: number; src: Src; key: string; value: string; withheld: boolean };

const START = performance.now();
const THINK_TAIL = 40;
const INFER = false;

function tailLines(text: string, n: number): string {
  const lines = text.split("\n");
  return lines.length <= n ? text : lines.slice(-n).join("\n");
}

function srcOf(id: string): Src {
  if (id.startsWith("sig.derived.")) return "DERIVED";
  if (!Object.prototype.hasOwnProperty.call(SIGNAL_REGISTRY, id)) return "CLIENT";
  const src = sourceOf(id as SignalId);
  if (src === "T0") return "EDGE";
  if (src === "T3") return "TLS";
  if (src === "T5") return "YOU";
  return "CLIENT";
}

function fmt(key: string, value: unknown, signals: SignalSet = {}): string {
  if (key === "sig.edge.tcp_rtt_ms" && value == null) return "not measured";
  if (key === "sig.client.device_memory" && value === 8 && signals["sig.client.device_memory_capped"] === true) {
    return "8+ GB (API capped)";
  }
  if (key === "sig.client.netinfo.effective_type" && typeof value === "string") {
    return `${value} (connection quality bucket, not a network type)`;
  }
  if (value == null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function rowsFrom(signals: SignalSet, firstAt: Map<string, number>): Row[] {
  const out: Row[] = [];
  for (const [key, value] of Object.entries(signals)) {
    if (!firstAt.has(key)) firstAt.set(key, Math.round(performance.now() - START));
    out.push({
      id: key,
      at: firstAt.get(key) ?? 0,
      src: srcOf(key),
      key,
      value: fmt(key, value, signals),
      withheld: isWithheldSignalId(key),
    });
  }
  return out;
}

export function App() {
  const [sid, setSid] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalSet>({});
  const [hl, setHl] = useState<string | null>(null);
  const [thinking, setThinking] = useState("");
  const [status, setStatus] = useState("bootstrapping");
  const firstAt = useRef(new Map<string, number>());
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  const thinkRef = useRef<HTMLDivElement>(null);

  const derived = useMemo(() => derive(signals, { now: new Date() }), [signals]);
  const tells = useMemo(() => detectTells(derived), [derived]);
  const rows = useMemo(() => rowsFrom(derived, firstAt.current), [derived]);

  const append = (next: SignalSet) => {
    setSignals((prev) => ({ ...prev, ...next }));
  };

  useEffect(() => {
    const ac = new AbortController();
    firstAt.current = new Map();
    setSignals({});
    setThinking("");
    (async () => {
      setStatus("edge");
      const boot = await fetch("/api/bootstrap", { signal: ac.signal });
      if (!boot.ok) {
        setStatus(`bootstrap ${boot.status}`);
        return;
      }
      const { sid: id, signals: t0 } = (await boot.json()) as { sid: string; signals: SignalSet };
      setSid(id);
      append(t0);
      append(collectT1Now());
      setStatus("client fingerprint");
      append(await collectBrowserT2());
      if (!INFER) {
        setStatus("tells");
        return;
      }
      setStatus("waiting for settle");
      await new Promise((r) => setTimeout(r, 800));
      const body = {
        session_id: id,
        pass_index: 1,
        prompt_version: "p3",
        tiers_available: ["T0", "T1", "T2"],
        behavior_sparse: false,
        signals: stripForInfer(derive(signalsRef.current, { now: new Date() })),
        sampling: "live",
      };
      setStatus("inferring");
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) {
        setStatus(`infer ${res.status}`);
        return;
      }
      for await (const ev of readSse(res)) {
        if (ev.event === "thinking" && ev.data && typeof ev.data === "object" && "text" in ev.data) {
          setThinking((t) => t + String((ev.data as { text: string }).text));
        }
        if (ev.event === "pass_complete" && ev.data && typeof ev.data === "object" && "portrait" in ev.data) {
          setStatus("pass 1");
        }
        if (ev.event === "error") {
          setStatus(`error ${JSON.stringify(ev.data)}`);
        }
      }
    })().catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") setStatus(String(err));
    });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const el = thinkRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinking]);

  useEffect(() => {
    if (!sid) return;
    const onHide = () => {
      navigator.sendBeacon("/api/session/delete", JSON.stringify({ sid }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [sid]);

  const clock = useMemo(() => new Date().toISOString().slice(11, 19), []);

  return (
    <div className="app">
      <section className="ledger" data-section="ledger">
        <div className="mast">
          <h1>glasshouse</h1>
          <div className="meta">
            {sid ? sid.slice(0, 8) : "—"} · {clock} · {status}
            {rows.length ? ` · ${tells.length} tells from ${rows.length} signals collected` : ""}
          </div>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className={`row ${row.src === "DERIVED" ? "derived" : ""} ${row.withheld ? "withheld" : ""} ${hl === row.id ? "hl" : ""}`}
          >
            <div className="t">+{row.at}ms</div>
            <div className={`src ${row.src}`}>{row.src}</div>
            <div className="body">
              <span className="k">{row.key}</span>
              {row.value}
              {row.withheld ? (
                <div className="withheld-why">
                  collected, shown to you, withheld from the model — accessibility-adjacent
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </section>
      <aside className="side">
        <div className="panel think-panel">
          <h2>deliberation</h2>
          <div className="think" ref={thinkRef}>
            {INFER
              ? thinking
                ? tailLines(thinking, THINK_TAIL)
                : "waiting for the model to start talking…"
              : "inference is off. tells are computed, not generated."}
          </div>
        </div>
        <div className="panel" data-section="tells">
          <h2>tells</h2>
          {tells.length === 0 ? <p className="status">ledger fills first. tells arrive as collectors finish.</p> : null}
          {tells.map((t) => (
            <article key={t.id} className="card">
              <div className={`tier cat-${t.category}`}>{t.category}</div>
              <p className="stmt">{t.headline}</p>
              <p className="why">{t.detail}</p>
              <div className="chips">
                {t.evidence.map((e) => (
                  <span
                    key={e}
                    className="chip"
                    onMouseEnter={() => setHl(e)}
                    onMouseLeave={() => setHl(null)}
                  >
                    {e}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
