import { useMemo, useState } from "react";
import type { Setup, Tf } from "../engine/types";
import { fmt } from "../engine/analyze";
import { makeTip, TF_HOURS } from "../engine/layman";
import { CATALOG, MARKETS, paper, save, store, type AutoPick, type Market, type PickSetup } from "../lib/api";

/** One market + timeframe + its best setup, from the background scan or a live scan. */
export type Opp = { symbol: string; label: string; name: string; market: string; tf: Tf; price: number; setup: PickSetup; newsWarn?: string | null; checkedAt?: number };

export const TFS: Tf[] = ["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"];
export const TF_LABEL: Record<Tf, string> = { "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "2h": "2h", "4h": "4h", "1d": "Daily", "1w": "Weekly", "1M": "Monthly" };
export const SCORES = [70, 75, 80, 85, 90, 95, 100];
const NAME = new Map(CATALOG.map((c) => [c.id, c.name]));
export const nameOf = (id: string, fallback = "") => NAME.get(id) ?? fallback;

export const ready = (o: Opp) => o.setup.triggered && !o.setup.hardFail;
export const pickOfOpp = (o: Opp): AutoPick => ({ symbol: o.symbol, label: o.label, market: o.market, tf: o.tf, dir: o.setup.dir, score: o.setup.score, name: `${o.setup.name} (${o.setup.degree})`, stop: o.setup.stop, target1: o.setup.target1, target2: o.setup.target2, expectBars: o.setup.expectBars ?? 3 });
const move = (o: Opp, to: number) => ((o.setup.dir === "long" ? to - o.setup.entry : o.setup.entry - to) / o.setup.entry) * 100;
const pc = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}%`;
const hrs = (h: number) => (h < 1 ? `${Math.max(5, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : h < 24 * 60 ? `${Math.round(h / 24)} days` : `${Math.round(h / 730)} mo`);
const status = (o: Opp) => (o.setup.verdict === "APPROVED" ? ["Approved", "ok"] : ready(o) ? ["Ready", "watch"] : o.setup.hardFail ? ["Rule broken", "no"] : ["Waiting for entry", "no"]) as [string, string];

/** Filters shared by High performers and Scan, remembered per page. */
export type Filters = { market: Market | "All"; tf: Tf | "Any"; min: number; dir: "both" | "long" | "short"; readyOnly: boolean; bestPerMarket: boolean };
export const DEFAULT_FILTERS: Filters = { market: "All", tf: "Any", min: 80, dir: "both", readyOnly: true, bestPerMarket: true };
export function useFilters(key: string, init: Partial<Filters> = {}) {
  const [f, setF] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, ...init, ...store<Partial<Filters>>(key, {}) }));
  return [f, (p: Partial<Filters>) => setF((c) => { const n = { ...c, ...p }; save(key, n); return n; })] as const;
}
export function applyFilters(list: Opp[], f: Filters) {
  const out = list.filter((o) => (f.market === "All" || o.market === f.market) && (f.tf === "Any" || o.tf === f.tf) && o.setup.score >= f.min && (f.dir === "both" || o.setup.dir === f.dir) && (!f.readyOnly || ready(o)) && !o.setup.hardFail)
    .sort((a, b) => (b.setup.score - a.setup.score) || (Number(ready(b)) - Number(ready(a))) || (b.setup.rr1 - a.setup.rr1));
  if (!f.bestPerMarket) return out;
  const seen = new Set<string>();
  return out.filter((o) => (seen.has(o.symbol) ? false : (seen.add(o.symbol), true)));
}

export function FilterBar({ f, set, showTf = true, counts }: { f: Filters; set: (p: Partial<Filters>) => void; showTf?: boolean; counts?: Record<string, number> }) {
  const [open, setOpen] = useState(() => typeof matchMedia === "undefined" || !matchMedia("(max-width: 760px)").matches);
  const summary = [f.market === "All" ? "All categories" : f.market, f.tf === "Any" ? "all timeframes" : TF_LABEL[f.tf], `${f.min}%+`, f.dir === "both" ? "buy and sell" : f.dir === "long" ? "buy only" : "sell only", f.readyOnly ? "ready now" : ""].filter(Boolean).join(", ");
  if (!open) return <button className="card opp-filters-closed" onClick={() => setOpen(true)} aria-expanded={false}><span>Filters: {summary}</span><b>Change</b></button>;
  return (
    <div className="card opp-filters">
      <button className="link opp-hide" onClick={() => setOpen(false)}>Hide filters</button>
      <div className="auto-field"><span className="auto-label">Category</span>
        <div className="seg wrap" role="radiogroup" aria-label="Category">{(["All", ...MARKETS] as const).map((m) => <button key={m} role="radio" aria-checked={f.market === m} className={f.market === m ? "on" : ""} onClick={() => set({ market: m })}>{m}{counts?.[m] != null ? <small> {counts[m]}</small> : null}</button>)}</div>
      </div>
      {showTf && <div className="auto-field"><span className="auto-label">Timeframe</span>
        <div className="seg wrap" role="radiogroup" aria-label="Timeframe">{(["Any", ...TFS] as const).map((t) => <button key={t} role="radio" aria-checked={f.tf === t} className={f.tf === t ? "on" : ""} onClick={() => set({ tf: t })}>{t === "Any" ? "All" : TF_LABEL[t]}</button>)}</div>
      </div>}
      <div className="auto-field"><span className="auto-label">Minimum score</span>
        <div className="seg wrap" role="radiogroup" aria-label="Minimum score">{SCORES.map((s) => <button key={s} role="radio" aria-checked={f.min === s} className={f.min === s ? "on" : ""} onClick={() => set({ min: s })}>{s === 100 ? "100%" : `${s}%+`}</button>)}</div>
      </div>
      <div className="auto-field"><span className="auto-label">Direction</span>
        <div className="seg" role="radiogroup" aria-label="Direction">{([["both", "Buy and sell"], ["long", "Buy only"], ["short", "Sell only"]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={f.dir === v} className={f.dir === v ? "on" : ""} onClick={() => set({ dir: v })}>{l}</button>)}</div>
      </div>
      <div className="opp-checks">
        <label className="check"><input type="checkbox" checked={f.readyOnly} onChange={(e) => set({ readyOnly: e.target.checked })} /> Only ones ready to trade now (entry signal fired)</label>
        <label className="check"><input type="checkbox" checked={f.bestPerMarket} onChange={(e) => set({ bestPerMarket: e.target.checked })} /> One row per market (its best timeframe)</label>
      </div>
    </div>
  );
}

/** Ranked list with select, open, paper and real-money actions. */
export function OppList({ list, appKey, account, riskPct, onNeedKey, onOpen, onReal, empty }: { list: Opp[]; appKey: string; account: number; riskPct: number; onNeedKey: () => void; onOpen: (id: string, tf: Tf) => void; onReal: (p: AutoPick[]) => void; empty: React.ReactNode }) {
  const [sel, setSel] = useState<Record<string, Opp>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const key = (o: Opp) => o.symbol + o.tf;
  const chosen = Object.values(sel);
  const toggle = (o: Opp) => setSel((m) => { const n = { ...m }; if (n[key(o)]) delete n[key(o)]; else n[key(o)] = o; return n; });

  const paperIt = async (os: Opp[]) => {
    if (!appKey) { onNeedKey(); return; }
    setBusy("paper"); setMsg("");
    let ok = 0; const errs: string[] = [];
    for (const o of os) {
      const s = { ...o.setup, checks: [], labels: [] } as unknown as Setup;
      const tip = makeTip(s, o.label, o.tf, Math.floor(Date.now() / 1000), account, riskPct);
      try { await paper.open(appKey, { symbol: o.symbol, label: o.label, tf: o.tf, dir: o.setup.dir, stop: o.setup.stop, target1: o.setup.target1, target2: o.setup.target2, setup: `${o.setup.name} (${o.setup.degree}), ${o.tf}`, score: o.setup.score, tip: [tip.headline, ...tip.steps].join("\n"), source: "manual" }); ok++; }
      catch (e) { errs.push(`${o.label}: ${(e as Error).message}`); }
    }
    setMsg(`${ok ? `${ok} paper trade${ok > 1 ? "s" : ""} opened. See them under Paper trading.` : ""} ${errs.join(" ")}`.trim());
    setBusy("");
  };
  const allReady = useMemo(() => chosen.every(ready), [chosen]);

  if (!list.length) return <div className="empty-pick">{empty}</div>;
  return (
    <>
      {msg && <p className="ok-msg">{msg}</p>}
      <ol className="opp-list">
        {list.map((o, i) => {
          const s = o.setup, [st, tone] = status(o), on = !!sel[key(o)], can = ready(o);
          const h = (s.expectBars ?? 3) * TF_HOURS[o.tf];
          return (
            <li key={key(o)} className={`opp ${on ? "picked" : ""}`}>
              <label className="opp-sel" title="Select"><input type="checkbox" checked={on} onChange={() => toggle(o)} aria-label={`Select ${o.label} ${o.tf}`} /></label>
              <span className="opp-rank mono">{i + 1}</span>
              <div className="opp-name">
                <b>{o.label}</b> <span className={`tag ${s.dir === "long" ? "ok" : "sell"}`}>{s.dir === "long" ? "Buy" : "Sell"}</span>
                <span className="sub">{o.name || o.market} · {TF_LABEL[o.tf]} · {s.name}</span>
              </div>
              <div className="opp-score"><span className="mono">{s.score}%</span><span className="opp-bar" aria-hidden><i style={{ width: `${s.score}%` }} /></span><span className={`tag ${tone}`}>{st}</span></div>
              <dl className="opp-lv mono">
                <div><dt>Entry</dt><dd>{fmt(s.entry)}</dd></div>
                <div><dt>Stop</dt><dd className="neg">{pc(move(o, s.stop))}</dd></div>
                <div><dt>Target 1 / 2</dt><dd className="pos-c">{pc(move(o, s.target1))} / {pc(move(o, s.target2))}</dd></div>
                <div><dt>Reward:risk</dt><dd>{s.rr1.toFixed(1)}</dd></div>
                <div><dt>Target 1 in</dt><dd>~{hrs(h * 0.6)}–{hrs(h * 1.6)}</dd></div>
              </dl>
              {o.newsWarn && <p className="pick-warn opp-warn">Big news soon: {o.newsWarn.replace(/ is due .*/, "")}.</p>}
              <div className="opp-act">
                <button className="btn" onClick={() => onOpen(o.symbol, o.tf)}>Chart</button>
                <button className="btn" disabled={!can || !!busy} title={can ? "" : "The entry signal hasn't fired yet"} onClick={() => paperIt([o])}>Paper</button>
                <button className="btn primary" disabled={!can} title={can ? "" : "The entry signal hasn't fired yet"} onClick={() => onReal([pickOfOpp(o)])}>Real money</button>
              </div>
            </li>
          );
        })}
      </ol>
      {chosen.length > 0 && (
        <div className="sel-bar" role="region" aria-label="Selected markets">
          <span><b>{chosen.length}</b> selected{allReady ? "" : " (some aren't ready: their entry signal hasn't fired)"}</span>
          <span className="pick-btns">
            <button className="btn" onClick={() => setSel({})}>Clear</button>
            <button className="btn" disabled={!allReady || !!busy} onClick={() => paperIt(chosen)}>{busy ? "Placing…" : "Paper trade all"}</button>
            <button className="btn primary" disabled={!allReady} onClick={() => onReal(chosen.map(pickOfOpp))}>Trade {chosen.length === 1 ? "it" : `all ${chosen.length}`} with real money</button>
          </span>
        </div>
      )}
    </>
  );
}
