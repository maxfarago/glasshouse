import {
  isWithheldSignalId,
  portraitSchema,
  SIGNAL_REGISTRY,
  sourceOf,
  stripForInfer,
  type Answer,
  type Confidence,
  type Portrait,
  type QuestionId,
  type SignalId,
  type SignalSet,
} from "@glasshouse/schema";
import { derive } from "@glasshouse/signals";
import { detectTells, tellsForInfer, type Tell } from "@glasshouse/tells";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectBrowserT2, collectT1Now } from "./collect.ts";
import { readSse } from "./sse.ts";

type Src = "EDGE" | "CLIENT" | "TLS" | "YOU" | "DERIVED";
type Row = { id: string; at: number; src: Src; key: string; value: string; withheld: boolean };
type Obs = { id: string; text: string; evidence: string[] };
type Floor = "collect" | "type" | "infer" | "type_answers" | "idle";
type Line = {
  question: QuestionId;
  text: string;
  evidence: string[];
  confidence?: Confidence;
};

const START = performance.now();
const CHAR_MS = 14;
const LINE_GAP_MS = 520;
const THINK_TAIL = 40;
const INFER = true;
const PROMPT = "p5";

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

function langsOf(signals: SignalSet): string[] {
  const v = signals["sig.client.langs"];
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

function observations(tells: Tell[], signals: SignalSet): Obs[] {
  const out: Obs[] = [];
  const hdr = typeof signals["sig.hdr.accept_language"] === "string" ? signals["sig.hdr.accept_language"] : null;
  const langs = langsOf(signals);
  if (!tells.some((t) => t.id === "header_vs_client_langs") && (hdr || langs.length)) {
    const evidence = [
      hdr ? "sig.hdr.accept_language" : null,
      langs.length ? "sig.client.langs" : null,
    ].filter((id): id is string => id != null);
    if (hdr && langs.length) {
      out.push({ id: "langs", text: `Accept-Language is ${hdr}. Client list is ${langs.join(", ")}.`, evidence });
    } else if (langs.length) {
      out.push({ id: "langs", text: `Client language list is ${langs.join(", ")}.`, evidence });
    } else if (hdr) {
      out.push({ id: "langs", text: `Accept-Language is ${hdr}.`, evidence });
    }
  }
  for (const t of tells) {
    out.push({ id: t.id, text: t.headline, evidence: t.evidence });
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

function tailLines(text: string, n: number): string {
  const lines = text.split("\n");
  return lines.length <= n ? text : lines.slice(-n).join("\n");
}

function declineLine(q: QuestionId): string {
  switch (q) {
    case "location":
      return "I will not guess where you are.";
    case "work_or_home":
      return "I will not guess whether this is home or work.";
    case "technical_expertise":
      return "I will not guess how technical you are.";
    case "visit_reason":
      return "I will not guess why you are here.";
    case "profession":
      return "I will not guess your profession.";
    case "age_cohort":
      return "I will not guess your age.";
  }
}

function answerLine(a: Answer): Line {
  const evidence = a.evidence;
  if (a.value == null) return { question: a.question, text: declineLine(a.question), evidence };
  const line = (text: string): Line =>
    a.confidence ? { question: a.question, text, evidence, confidence: a.confidence } : { question: a.question, text, evidence };
  switch (a.question) {
    case "location":
      if (a.value === "indeterminate") return line("I cannot tell where you are.");
      return line(a.place ? `I think you are in ${a.place}.` : `I think I can place you to a ${a.value}.`);
    case "work_or_home":
      if (a.value === "home") return line("I think you are at home.");
      if (a.value === "work") return line("I think you are at work.");
      if (a.value === "third_place") return line("I think you are in a third place.");
      if (a.value === "transit") return line("I think you are in transit.");
      return line("I cannot tell whether this is home or work.");
    case "technical_expertise":
      if (a.value === "expert") return line("I think you are technically expert.");
      if (a.value === "technical") return line("I think you are technical.");
      if (a.value === "non_technical") return line("I think you are not technical.");
      return line("I cannot tell how technical you are.");
    case "visit_reason":
      if (a.value === "recruiter") return line("I think you are here as a recruiter.");
      if (a.value === "potential_client") return line("I think you are here as a potential client.");
      if (a.value === "developer_peer") return line("I think you are here as a developer peer.");
      if (a.value === "press") return line("I think you are here as press.");
      if (a.value === "personal_contact") return line("I think you are here as a personal contact.");
      if (a.value === "curious_stranger") return line("I think you are a curious stranger.");
      if (a.value === "self_test") return line("I think you are testing this.");
      return line("I cannot tell why you are here.");
    case "profession":
      if (a.value === "student") return line("I think you are a student.");
      if (a.value === "indeterminate") return line("I cannot tell your profession.");
      return line(`I think you work in ${a.value.replaceAll("_", " ")}.`);
    case "age_cohort":
      if (a.value === "under_25") return line("I think you are under 25.");
      if (a.value === "25_34") return line("I think you are 25–34.");
      if (a.value === "35_49") return line("I think you are 35–49.");
      if (a.value === "50_plus") return line("I think you are 50 or older.");
      return line("I cannot tell your age.");
  }
}

export function App() {
  const [sid, setSid] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalSet>({});
  const [hl, setHl] = useState<string | null>(null);
  const [status, setStatus] = useState("collecting");
  const [floor, setFloor] = useState<Floor>("collect");
  const [inspect, setInspect] = useState(false);
  const [obs, setObs] = useState<Obs[]>([]);
  const [typed, setTyped] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(false);
  const [thinking, setThinking] = useState("");
  const [portrait, setPortrait] = useState<Portrait | null>(null);
  const [answers, setAnswers] = useState<Line[]>([]);
  const [typedAns, setTypedAns] = useState(0);
  const [verdicts, setVerdicts] = useState<Partial<Record<QuestionId, "up" | "down">>>({});
  const [fail, setFail] = useState<string | null>(null);
  const firstAt = useRef(new Map<string, number>());
  const typeLock = useRef(false);
  const ansLock = useRef(false);
  const typeAc = useRef<AbortController | null>(null);
  const ledgerRef = useRef<HTMLElement>(null);
  const thinkRef = useRef<HTMLDivElement>(null);

  const derived = useMemo(() => derive(signals, { now: new Date() }), [signals]);
  const tells = useMemo(() => detectTells(derived), [derived]);
  const tellsRef = useRef(tells);
  const derivedRef = useRef(derived);
  tellsRef.current = tells;
  derivedRef.current = derived;
  const rows = useMemo(() => rowsFrom(derived, firstAt.current), [derived]);
  const cited = useMemo(() => {
    const s = new Set(obs.flatMap((o) => o.evidence));
    for (const a of answers) for (const e of a.evidence) s.add(e);
    return s;
  }, [obs, answers]);
  const withheldN = rows.filter((r) => r.withheld).length;
  const counter = rows.length
    ? `${rows.length} signals collected. ${tells.length} tells. ${withheldN} withheld from the model.`
    : status;

  useEffect(() => {
    const ac = new AbortController();
    firstAt.current = new Map();
    typeLock.current = false;
    ansLock.current = false;
    typeAc.current?.abort();
    typeAc.current = null;
    setSignals({});
    setInspect(false);
    setFloor("collect");
    setObs([]);
    setTyped([]);
    setDraft("");
    setCaret(false);
    setThinking("");
    setPortrait(null);
    setAnswers([]);
    setTypedAns(0);
    setVerdicts({});
    setFail(null);
    (async () => {
      setStatus("collecting");
      const boot = await fetch("/api/bootstrap", { signal: ac.signal });
      if (!boot.ok) {
        setStatus(`bootstrap ${boot.status}`);
        return;
      }
      const { sid: id, signals: t0 } = (await boot.json()) as { sid: string; signals: SignalSet };
      if (ac.signal.aborted) return;
      setSid(id);
      const t1 = collectT1Now();
      setSignals({ ...t0, ...t1 });
      const t2 = await collectBrowserT2();
      if (ac.signal.aborted) return;
      setSignals({ ...t0, ...t1, ...t2 });
      setFloor("type");
    })().catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") setStatus(String(err));
    });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (floor !== "type" || typeLock.current) return;
    if (rows.length < 60) return;
    const handle = window.setTimeout(() => {
      if (typeLock.current) return;
      typeLock.current = true;
      const nextObs = observations(tellsRef.current, derivedRef.current);
      setObs(nextObs);
      const ac = new AbortController();
      typeAc.current = ac;
      setCaret(true);
      (async () => {
        for (const line of nextObs) {
          for (let i = 1; i <= line.text.length; i++) {
            if (ac.signal.aborted) return;
            setDraft(line.text.slice(0, i));
            await sleep(CHAR_MS, ac.signal);
          }
          setTyped((prev) => [...prev, line.text]);
          setDraft("");
          await sleep(LINE_GAP_MS, ac.signal);
        }
        if (ac.signal.aborted) return;
        if (INFER) setFloor("infer");
        else {
          setCaret(false);
          setFloor("idle");
          setStatus("idle");
        }
      })().catch((err: unknown) => {
        if ((err as { name?: string }).name !== "AbortError") setStatus(String(err));
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [floor, rows.length, tells, derived]);

  useEffect(() => {
    if (floor !== "infer" || !sid || !INFER) return;
    const ac = new AbortController();
    (async () => {
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          pass_index: 1,
          prompt_version: PROMPT,
          tiers_available: ["T0", "T1", "T2"],
          behavior_sparse: false,
          signals: stripForInfer(derivedRef.current),
          tells: tellsForInfer(tellsRef.current),
          sampling: "live",
        }),
        signal: ac.signal,
      });
      if (!res.ok) {
        setFail(`infer ${res.status}`);
        setCaret(false);
        setFloor("idle");
        return;
      }
      let got = false;
      for await (const ev of readSse(res)) {
        if (ac.signal.aborted) return;
        if (ev.event === "thinking" && ev.data && typeof ev.data === "object" && "text" in ev.data) {
          setThinking((t) => t + String((ev.data as { text: string }).text));
        }
        if (ev.event === "pass_complete" && ev.data && typeof ev.data === "object" && "portrait" in ev.data) {
          const parsed = portraitSchema.safeParse((ev.data as { portrait: unknown }).portrait);
          if (!parsed.success) {
            setFail("portrait failed validation");
            setCaret(false);
            setFloor("idle");
            return;
          }
          got = true;
          setPortrait(parsed.data);
          setAnswers(parsed.data.answers.map(answerLine));
          setFloor("type_answers");
        }
        if (ev.event === "error") {
          const msg =
            ev.data && typeof ev.data === "object" && "message" in ev.data
              ? String((ev.data as { message: unknown }).message)
              : JSON.stringify(ev.data);
          setFail(msg);
          setCaret(false);
          setFloor("idle");
          return;
        }
      }
      if (!got && !ac.signal.aborted) {
        setFail("inference ended without a portrait");
        setCaret(false);
        setFloor("idle");
      }
    })().catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") {
        setFail(String(err));
        setCaret(false);
        setFloor("idle");
      }
    });
    return () => ac.abort();
  }, [floor, sid]);

  useEffect(() => {
    if (floor !== "type_answers" || ansLock.current) return;
    if (answers.length === 0) return;
    ansLock.current = true;
    const ac = new AbortController();
    typeAc.current = ac;
    setCaret(true);
    (async () => {
      await sleep(LINE_GAP_MS, ac.signal);
      for (const line of answers) {
        for (let i = 1; i <= line.text.length; i++) {
          if (ac.signal.aborted) return;
          setDraft(line.text.slice(0, i));
          await sleep(CHAR_MS, ac.signal);
        }
        setTypedAns((n) => n + 1);
        setDraft("");
        await sleep(LINE_GAP_MS, ac.signal);
      }
      if (ac.signal.aborted) return;
      setCaret(false);
      setFloor("idle");
      setStatus("idle");
    })().catch((err: unknown) => {
      if ((err as { name?: string }).name !== "AbortError") setStatus(String(err));
    });
    return () => ac.abort();
  }, [floor, answers]);

  useEffect(() => {
    if (!hl || !inspect) return;
    const row = ledgerRef.current?.querySelector(`[data-sig="${CSS.escape(hl)}"]`);
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
  }, [hl, inspect]);

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

  const highlight = (id: string | null) => {
    setHl(id);
  };

  const ledgerId = (evidence: string[]): string | null => {
    return evidence.find((id) => id.startsWith("sig.")) ?? null;
  };

  const openEvidence = (evidence: string[]) => {
    setInspect(true);
    highlight(ledgerId(evidence));
  };

  const thumb = (question: QuestionId, verdict: "up" | "down") => {
    setVerdicts((v) => ({ ...v, [question]: verdict }));
    const a = portrait?.answers.find((x) => x.question === question);
    void fetch("/api/calibrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        verdict,
        prompt_version: portrait?.prompt_version ?? PROMPT,
        model_id: portrait?.model_id ?? "",
        ...(a?.confidence ? { confidence: a.confidence } : {}),
      }),
    }).catch(() => {});
  };

  const shown = obs.filter((_, i) => i < typed.length);
  const shownAns = answers.filter((_, i) => i < typedAns);
  const thinkCopy =
    thinking.length > 0
      ? tailLines(thinking, THINK_TAIL)
      : floor === "infer"
        ? "waiting for the model to start talking…"
        : "the model has not spoken yet.";

  return (
    <div className={`app ${inspect ? "inspect" : ""}`}>
      <main className="term">
        <div className="term-inner">
          <h1>glasshouse</h1>
          <p className="counter">{counter}</p>
          <div className="lines">
            {shown.map((o) => (
              <p
                key={o.id}
                className={`line${hl && o.evidence.includes(hl) ? " hl" : ""}`}
                onMouseEnter={() => {
                  if (inspect) highlight(ledgerId(o.evidence));
                }}
                onMouseLeave={() => {
                  if (inspect) highlight(null);
                }}
                onClick={() => openEvidence(o.evidence)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEvidence(o.evidence);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {o.text}
              </p>
            ))}
            {shownAns.map((a) => (
              <div key={a.question} className={`line answer${hl && a.evidence.includes(hl) ? " hl" : ""}`}>
                <span
                  className="said"
                  onMouseEnter={() => {
                    if (inspect) highlight(ledgerId(a.evidence));
                  }}
                  onMouseLeave={() => {
                    if (inspect) highlight(null);
                  }}
                  onClick={() => openEvidence(a.evidence)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEvidence(a.evidence);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {a.text}
                  {a.confidence ? <span className="suf">{a.confidence.toLowerCase()}</span> : null}
                </span>
                <span className="thumbs">
                  <button
                    type="button"
                    className={verdicts[a.question] === "up" ? "on" : ""}
                    onClick={() => thumb(a.question, "up")}
                  >
                    yes
                  </button>
                  <button
                    type="button"
                    className={verdicts[a.question] === "down" ? "on" : ""}
                    onClick={() => thumb(a.question, "down")}
                  >
                    no
                  </button>
                </span>
              </div>
            ))}
            {draft || caret ? (
              <p className="line typing">
                {draft}
                <span className="caret" />
              </p>
            ) : null}
          </div>
          {fail ? <p className="fail">{fail}</p> : null}
          <button type="button" className="inspect-toggle" onClick={() => setInspect((v) => !v)}>
            {inspect ? "hide what I am reading" : "show me what you are reading"}
          </button>
        </div>
      </main>
      {inspect ? (
        <aside className="inspect-panel">
          <section className="panel think-panel">
            <h2>deliberation</h2>
            <div className="think" ref={thinkRef}>
              {thinkCopy}
            </div>
          </section>
          <section className="ledger" data-section="ledger" ref={ledgerRef}>
            {rows.map((row) => (
              <div
                key={row.id}
                data-sig={row.key}
                className={[
                  "row",
                  row.src === "DERIVED" ? "derived" : "",
                  row.withheld ? "withheld" : "",
                  hl === row.id ? "hl" : "",
                  cited.has(row.key) ? "cited" : "",
                  !cited.has(row.key) && hl !== row.id ? "quiet" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
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
        </aside>
      ) : null}
    </div>
  );
}
