import { useMemo, useState } from "react";
import type { Setup, Tf } from "../engine/types";
import { fmt } from "../engine/analyze";
import { makeTip, TF_HOURS } from "../engine/layman";
import type { PaperPick } from "./PaperTicket";
import { CATALOG, MARKETS, save, store, type AutoPick, type Market, type PickSetup } from "../lib/api";

/** One market + timeframe + its best setup, from the background scan or a live scan. */
export type Opp = { symbol: string; label: string; name: string; market: string; tf: Tf; price: number; setup: PickSetup; newsWarn?: string | null; checkedAt?: number };

export const TFS: Tf[] = ["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"];
export const TF_LABEL: Record<Tf, string> = { "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "2h": "2h", "4h": "4h", "1d": "Daily", "1w": "Weekly", "1M": "Monthly" };
export const SCORES = [70, 75, 80, 85, 90, 95, 100];
const NAME = new Map(CATALOG.map((c) => [c.id, c.name]));
export const nameOf = (id: string, fallback = "") => NAME.get(id) ?? fallback;

const ahead = (o: Opp) => (o.setup.dir === "long" ? o.setup.target1 > o.price && o.setup.stop < o.price : o.setup.target1 < o.price && o.setup.stop > o.price);
/** Tradeable now: entry signal fired, no must-pass rule broken, price still between stop and target 1, and at least 1.5× reward to risk. */
export const ready = (o: Opp) => o.setup.triggered && !o.setup.hardFail && o.setup.verdict !== "NO TRADE" && o.setup.rr1 >= 1.5 && ahead(o);
export const pickOfOpp = (o: Opp): AutoPick => ({ symbol: o.symbol, label: o.label, market: o.market, tf: o.tf, dir: o.setup.dir, score: o.setup.score, name: `${o.setup.name} (${o.setup.degree})`, stop: o.setup.stop, target1: o.setup.target1, target2: o.setup.target2, expectBars: o.setup.expectBars ?? 3, price: o.price, entryLevel: o.setup.entry, triggered: o.setup.triggered });
/** Not ready yet, but a sound setup whose trigger hasn't fired: it can be placed as a waiting order. */
export const waitable = (o: Opp) => !o.setup.triggered && !o.setup.hardFail && o.setup.verdict !== "NO TRADE";
const move = (o: Opp, to: number) => ((o.setup.dir === "long" ? to - o.setup.entry : o.setup.entry - to) / o.setup.entry) * 100;
const pc = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}%`;
const hrs = (h: number) => (h < 1 ? `${Math.max(5, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : h < 24 * 60 ? `${Math.round(h / 24)} days` : `${Math.round(h / 730)} mo`);
const status = (o: Opp) => (o.setup.verdict === "APPROVED" && ready(o) ? ["Approved", "ok"] : ready(o) ? ["Ready", "watch"] : o.setup.hardFail ? ["Rule broken", "no"] : !o.setup.triggered ? ["Waiting for entry", "no"] : ahead(o) ? ["Reward too small", "no"] : ["Already moved", "no"]) as [string, string];

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
        <label className="check"><input type="checkbox" checked={f.readyOnly} onChange={(e) => set({ readyOnly: e.target.checked })} /> Only ones ready to trade now <small className="sub">(untick to also see setups you can place as waiting orders)</small></label>
        <label className="check"><input type="checkbox" checked={f.bestPerMarket} onChange={(e) => set({ bestPerMarket: e.target.checked })} /> One row per market (its best timeframe)</label>
      </div>
    </div>
  );
}

/** Ranked list with select, open, paper and real-money actions. */
export function OppList({ list, account, riskPct, onOpen, onReal, onPaper, empty }: { list: Opp[]; appKey: string; account: number; riskPct: number; onNeedKey: () => void; onOpen: (id: string, tf: Tf) => void; onReal: (p: AutoPick[]) => void; onPaper: (p: PaperPick[]) => void; empty: React.ReactNode }) {
  const [sel, setSel] = useState<Record<string, Opp>>({});
  const key = (o: Opp) => o.symbol + o.tf;
  const chosen = Object.values(sel);
  const toggle = (o: Opp) => setSel((m) => { const n = { ...m }; if (n[key(o)]) delete n[key(o)]; else n[key(o)] = o; return n; });

  const paperIt = (os: Opp[]) => onPaper(os.map((o) => {
    const tip = makeTip({ ...o.setup, checks: [], labels: [] } as unknown as Setup, o.label, o.tf, Math.floor(Date.now() / 1000), account, riskPct);
    return { ...pickOfOpp(o), entry: o.price, tip: [tip.headline, ...tip.steps].join("\n") };
  }));
  const allReady = useMemo(() => chosen.every((o) => ready(o) || waitable(o)), [chosen]);

  if (!list.length) return <div className="empty-pick">{empty}</div>;
  return (
    <>
      <ol className="opp-list">
        {list.map((o, i) => {
          const s = o.setup, [st, tone] = status(o), on = !!sel[key(o)], can = ready(o) || waitable(o), wait = !ready(o) && waitable(o);
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
                <button className="btn" disabled={!can} title={wait ? "Places a waiting order that opens when the entry comes" : can ? "" : "Not tradeable now: see the status under the score"} onClick={() => paperIt([o])}>{wait ? "Paper (wait)" : "Paper"}</button>
                <button className="btn primary" disabled={!can} title={wait ? "Places a waiting order that opens when the entry comes" : can ? "" : "Not tradeable now: see the status under the score"} onClick={() => onReal([pickOfOpp(o)])}>{wait ? "Real (wait)" : "Real money"}</button>
              </div>
            </li>
          );
        })}
      </ol>
      {chosen.length > 0 && (
        <div className="sel-bar" role="region" aria-label="Selected markets">
          <span><b>{chosen.length}</b> selected{allReady ? "" : " (some aren't tradeable now; untick them to continue)"}</span>
          <span className="pick-btns">
            <button className="btn" onClick={() => setSel({})}>Clear</button>
            <button className="btn" disabled={!allReady} onClick={() => paperIt(chosen)}>Paper trade all</button>
            <button className="btn primary" disabled={!allReady} onClick={() => onReal(chosen.map(pickOfOpp))}>Trade {chosen.length === 1 ? "it" : `all ${chosen.length}`} with real money</button>
          </span>
        </div>
      )}
    </>
  );
}
