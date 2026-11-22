import { useState } from "react";
import type { Analysis, Check, Setup } from "../engine/types";
import { fmt } from "../engine/analyze";

export function Dial({ score, verdict }: { score: number; verdict: Setup["verdict"] }) {
  const R = 74, cx = 90, cy = 90, sweep = 260, start = 140;
  const ang = (v: number) => ((start + (sweep * v) / 100) * Math.PI) / 180;
  const pt = (v: number, r = R) => [cx + r * Math.cos(ang(v)), cy + r * Math.sin(ang(v))];
  const arc = (from: number, to: number, r = R) => {
    const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${(sweep * (to - from)) / 100 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const tone = verdict === "APPROVED" ? "var(--kelp)" : score >= 55 ? "var(--brass)" : "var(--anemone)";
  const [nx1, ny1] = pt(80, R - 13), [nx2, ny2] = pt(80, R + 11);
  return (
    <svg className="dial" viewBox="0 0 180 160" role="img" aria-label={`Rule confluence ${score} percent; approval needs 80`}>
      <path d={arc(0, 100)} stroke="var(--rule)" strokeWidth="10" fill="none" strokeLinecap="round" />
      {Array.from({ length: 11 }, (_, i) => { const [a1, b1] = pt(i * 10, R - 9), [a2, b2] = pt(i * 10, R - 15); return <line key={i} x1={a1} y1={b1} x2={a2} y2={b2} stroke="var(--mist)" strokeWidth="1" opacity=".5" />; })}
      {score > 0 && <path d={arc(0, Math.max(1, score))} stroke={tone} strokeWidth="10" fill="none" strokeLinecap="round" />}
      <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} stroke="var(--brass)" strokeWidth="3" />
      <text x={pt(80, R - 26)[0]} y={pt(80, R - 26)[1] + 4} className="dial-notch" textAnchor="middle">80</text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="dial-score">{score}</text>
      <text x={cx} y={cy + 30} textAnchor="middle" className="dial-label">rule confluence</text>
    </svg>
  );
}

const VERDICT_WORD: Record<Setup["verdict"], (s: Setup) => string> = {
  APPROVED: (s) => (s.dir === "long" ? "Approved to buy" : "Approved to sell short"),
  WATCH: () => "Watch, don't enter",
  "NO TRADE": () => "No trade",
};

export function VerdictPanel({ symbol, tfLabel, analysis, setup, onPick, account, riskPct, onSave, saving }: {
  symbol: string; tfLabel: string; analysis: Analysis; setup: Setup | null; onPick: (id: string) => void;
  account: number; riskPct: number; onSave: () => void; saving: string;
}) {
  const last = analysis.last.c;
  if (!setup) {
    return (
      <section className="verdict">
        <header className="v-head"><h2>{symbol}</h2><span className="mono">{fmt(last)}</span></header>
        <Dial score={0} verdict="NO TRADE" />
        <p className="v-word v-no">No wave setup</p>
        <p className="v-plain">The swings on this timeframe don't form a countable Elliott pattern yet. Try another timeframe, or wait for the next swing to complete.</p>
      </section>
    );
  }
  const risk = Math.abs(setup.entry - setup.stop);
  const units = risk > 0 ? (account * riskPct / 100) / risk : 0;
  return (
    <section className={`verdict v-${setup.verdict === "APPROVED" ? "ok" : setup.verdict === "WATCH" ? "watch" : "no"}`}>
      <header className="v-head"><h2>{symbol} <small>{tfLabel}</small></h2><span className="mono">{fmt(last)}</span></header>
      <Dial score={setup.score} verdict={setup.verdict} />
      <p className={`v-word v-${setup.verdict === "APPROVED" ? "ok" : setup.verdict === "WATCH" ? "watch" : "no"}`}>{VERDICT_WORD[setup.verdict](setup)}</p>
      <p className="v-setup">{setup.name}: {setup.pattern.toLowerCase()}, {setup.degree.toLowerCase()}.</p>
      <p className="v-plain">{setup.plain}</p>
      <dl className="levels">
        <div><dt>{setup.triggered ? "Entry" : "Trigger"}</dt><dd className="mono">{fmt(setup.entry)}</dd></div>
        <div><dt>Stop</dt><dd className="mono bear">{fmt(setup.stop)}</dd></div>
        <div><dt>Target 1</dt><dd className="mono bull">{fmt(setup.target1)} <i>{setup.rr1.toFixed(1)}R</i></dd></div>
        <div><dt>Target 2</dt><dd className="mono bull">{fmt(setup.target2)} <i>{setup.rr2.toFixed(1)}R</i></dd></div>
        <div><dt>Count invalid at</dt><dd className="mono">{fmt(setup.invalidation)}</dd></div>
        <div><dt>Size at {riskPct}% risk</dt><dd className="mono">{units >= 100 ? units.toFixed(0) : units.toPrecision(3)} units</dd></div>
      </dl>
      {setup.reasons.length > 0 && setup.verdict !== "APPROVED" && (
        <ul className="why">{setup.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      <div className="v-actions">
        <button className="btn" onClick={onSave} disabled={!!saving && saving !== "Saved"}>{saving || "Save to journal"}</button>
      </div>
      {analysis.setups.length > 1 && (
        <details className="alts">
          <summary>Other counts on this chart ({analysis.setups.length - 1})</summary>
          <ul>
            {analysis.setups.filter((s) => s.id !== setup.id).map((s) => (
              <li key={s.id}><button className="link" onClick={() => onPick(s.id)}>
                <span>{s.dir === "long" ? "Long" : "Short"}: {s.name}, {s.degree.replace(" degree", "").toLowerCase()}</span>
                <span className="mono">{s.hardFail ? "rule broken" : `${s.score}%`}</span>
              </button></li>
            ))}
          </ul>
        </details>
      )}
      <p className="fine">Confluence is the share of the two books' rules this setup satisfies. It is not a probability of profit; the Backtest tab shows how approved setups actually did on this market. Informational analysis, not financial advice.</p>
    </section>
  );
}

const GROUPS: Check["group"][] = ["Neely: essential", "Neely: conditional", "Neely: confirmation", "Wyckoff", "Risk"];
const GROUP_NOTE: Record<Check["group"], string> = {
  "Neely: essential": "Rules the wave count must obey. A broken hard rule voids the setup.",
  "Neely: conditional": "Guidelines that raise or lower confidence in the count.",
  "Neely: confirmation": "Evidence after the fact that the pattern really finished.",
  Wyckoff: "Is there a cause behind the move, and is volume telling the same story?",
  Risk: "Is there an entry now, and is the trade worth its risk?",
};

export function Ledger({ setup }: { setup: Setup }) {
  return (
    <section className="ledger" aria-label="Rule-by-rule checklist">
      {GROUPS.map((g) => {
        const rows = setup.checks.filter((c) => c.group === g);
        if (!rows.length) return null;
        return (
          <div className="lg-group" key={g}>
            <h3>{g}</h3>
            <p className="lg-note">{GROUP_NOTE[g]}</p>
            <ul>
              {rows.map((c) => (
                <li key={c.id} className={c.pass === null ? "na" : c.pass ? "pass" : c.hard ? "fail hard" : "fail"}>
                  <span className="mark" aria-label={c.pass === null ? "not applicable" : c.pass ? "passes" : "fails"}>{c.pass === null ? "–" : c.pass ? "✓" : "✗"}</span>
                  <div>
                    <p className="lg-label">{c.label}{c.hard && <em className="hard-tag">must pass</em>}</p>
                    <p className="lg-detail">{c.detail}</p>
                    <p className="lg-src">{c.source}</p>
                  </div>
                  <span className="wt mono" title="Weight in the confluence score">{c.weight}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

export function ContextCards({ analysis }: { analysis: Analysis }) {
  const wy = analysis.wyckoff;
  const [open, setOpen] = useState(false);
  return (
    <div className="context">
      <section className="card">
        <h3>Wyckoff read</h3>
        {wy.kind ? (
          <>
            <p className="ctx-big">{wy.kind === "accumulation" ? "Accumulation" : "Distribution"}, phase {wy.phase}</p>
            <p className="ctx-note">{wy.note}</p>
            <ul className="events">{wy.events.map((e) => <li key={e.code + e.i}><b className="mono">{e.code}</b> {e.name} <span className="mono">{fmt(e.p)}</span></li>)}</ul>
          </>
        ) : <p className="ctx-note">{wy.note}</p>}
      </section>
      <section className="card">
        <h3>Larger structure</h3>
        <p className="ctx-big">{analysis.htfTrend === "long" ? "Up-trending" : analysis.htfTrend === "short" ? "Down-trending" : "Ranging"}</p>
        <p className="ctx-note">{analysis.htfNote}</p>
      </section>
      <section className="card">
        <h3><button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>Supplementary indicators {open ? "▾" : "▸"}</button></h3>
        <p className="ctx-note">From your toolkit brief. Shown for reference only; they don't count toward the verdict.</p>
        {open && <dl className="sup">{analysis.supplementary.map((s) => <div key={s.label}><dt>{s.label}</dt><dd className={`mono ${s.tone}`}>{s.value}</dd></div>)}</dl>}
      </section>
    </div>
  );
}
