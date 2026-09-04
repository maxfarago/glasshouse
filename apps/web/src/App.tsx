import { SIGNAL_REGISTRY, sourceOf, type Portrait, type SignalId, type SignalSet } from "@glasshouse/schema";
import { derive } from "@glasshouse/signals";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectBrowserT2, collectT1Now } from "./collect.ts";
import { readSse } from "./sse.ts";

type Src = "EDGE" | "CLIENT" | "TLS" | "YOU" | "DERIVED";
type Row = { id: string; at: number; src: Src; key: string; value: string };

const START = performance.now();

function srcOf(id: string): Src {
  if (id.startsWith("sig.derived.")) return "DERIVED";
  if (!Object.prototype.hasOwnProperty.call(SIGNAL_REGISTRY, id)) return "CLIENT";
  const src = sourceOf(id as SignalId);
  if (src === "T0") return "EDGE";
  if (src === "T3") return "TLS";
  if (src === "T5") return "YOU";
  return "CLIENT";
}

function fmt(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function rowsFrom(signals: SignalSet, seen: Set<string>): Row[] {
  const out: Row[] = [];
  for (const [key, value] of Object.entries(signals)) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      at: Math.round(performance.now() - START),
      src: srcOf(key),
      key,
      value: fmt(value),
    });
  }
  return out;
}

export function App() {
  const [sid, setSid] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [hl, setHl] = useState<string | null>(null);
  const [thinking, setThinking] = useState("");
  const [portrait, setPortrait] = useState<Portrait | null>(null);
  const [status, setStatus] = useState("bootstrapping");
  const seen = useRef(new Set<string>());
  const signalsRef = useRef<SignalSet>({});

  const append = (next: SignalSet) => {
    signalsRef.current = { ...signalsRef.current, ...next };
    const derived = derive(signalsRef.current, { now: new Date() });
    signalsRef.current = derived;
    const extra = rowsFrom(derived, seen.current);
    if (extra.length) setRows((r) => [...r, ...extra]);
  };

  useEffect(() => {
    const ac = new AbortController();
    seen.current = new Set();
    signalsRef.current = {};
    setRows([]);
    setThinking("");
    setPortrait(null);
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
      setStatus("waiting for settle");
      await new Promise((r) => setTimeout(r, 800));
      const body = {
        session_id: id,
        pass_index: 1,
        prompt_version: "p1",
        tiers_available: ["T0", "T1", "T2"],
        behavior_sparse: false,
        signals: signalsRef.current,
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
          setPortrait((ev.data as { portrait: Portrait }).portrait);
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
          </div>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className={`row ${row.src === "DERIVED" ? "derived" : ""} ${hl === row.id ? "hl" : ""}`}
          >
            <div className="t">+{row.at}ms</div>
            <div className={`src ${row.src}`}>{row.src}</div>
            <div className="body">
              <span className="k">{row.key}</span>
              {row.value}
            </div>
          </div>
        ))}
      </section>
      <aside className="side">
        <div className="panel">
          <h2>deliberation</h2>
          <div className="think">{thinking || "waiting for the model to start talking…"}</div>
        </div>
        <div className="panel" data-section="portrait">
          <h2>portrait</h2>
          {portrait?.thin_signal_note ? <p className="note">{portrait.thin_signal_note}</p> : null}
          {!portrait ? <p className="status">ledger fills first. claims arrive after.</p> : null}
          {portrait?.claims.map((c) => (
            <article key={c.claim_id} className="card">
              <div className="tier">{c.confidence}</div>
              <p className="stmt">{c.statement}</p>
              <p className="why">{c.reasoning}</p>
              <p className="kill">falsifier: {c.falsifier}</p>
              <div className="chips">
                {c.evidence.map((e) => (
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
