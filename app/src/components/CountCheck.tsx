import { useEffect, useState } from "react";
import { analyze, fmt } from "../engine/analyze";
import type { Candle, Tf } from "../engine/types";

/** Bars in about three months, per timeframe (capped so the check stays quick). */
const BARS_3M: Partial<Record<Tf, number>> = { "5m": 60, "15m": 60, "30m": 60, "1h": 60, "2h": 60, "4h": 60, "1d": 63, "1w": 13, "1M": 3 };

type Point = { t: number; key: string; name: string; dir: string; score: number };
const keyOf = (s: { dir: string; name: string; labels: { text: string; p: number }[] }) =>
  `${s.dir}|${s.name}|${s.labels.map((l) => `${l.text}@${fmt(l.p)}`).join(",")}`;

/**
 * Verifies the wave count by re-counting the chart as it stood on each of the last ~3 months of candles (only past data
 * each time, like a trader re-checking an old count). A count that has held for weeks is more trustworthy than one that
 * appeared today or keeps changing. Shown under the verdict; it never changes the verdict itself.
 */
export default function CountCheck({ candles, tf, symbol }: { candles: Candle[]; tf: Tf; symbol: string }) {
  const [res, setRes] = useState<{ points: Point[]; done: boolean } | null>(null);
  useEffect(() => {
    if (candles.length < 260) { setRes(null); return; }
    let stop = false;
    const n = Math.min(BARS_3M[tf] ?? 60, candles.length - 250);
    const step = Math.max(1, Math.round(n / 60));
    const ends: number[] = [];
    for (let k = n; k >= 0; k -= step) ends.push(candles.length - 1 - k);
    const points: Point[] = [];
    let i = 0;
    const work = () => {
      if (stop) return;
      const t0 = performance.now();
      while (i < ends.length && performance.now() - t0 < 25) { // small slices so the page stays responsive
        const end = ends[i++];
        const a = analyze(candles.slice(Math.max(0, end - 899), end + 1), tf, undefined, symbol);
        const s = a.best;
        points.push(s ? { t: candles[end].t, key: keyOf(s), name: s.name, dir: s.dir, score: s.score } : { t: candles[end].t, key: "none", name: "No clear count", dir: "", score: 0 });
      }
      setRes({ points: [...points], done: i >= ends.length });
      if (i < ends.length) setTimeout(work, 0);
    };
    setRes({ points: [], done: false });
    setTimeout(work, 50);
    return () => { stop = true; };
  }, [candles, tf, symbol]);

  if (!res) return null;
  const p = res.points;
  if (!res.done) return <p className="sub count-check">Verifying the wave count: re-counting the last 3 months ({p.length} checks so far)…</p>;
  if (p.length < 3) return null;
  const now = p[p.length - 1];
  let held = 0;
  for (let k = p.length - 1; k >= 0 && p[k].key === now.key; k--) held++;
  const changes = p.slice(1).filter((x, k) => x.key !== p[k].key).length;
  const span = (p[p.length - 1].t - p[0].t) / 86400;
  const heldDays = held > 1 ? (now.t - p[p.length - held].t) / 86400 : 0;
  const pct = Math.round((held / p.length) * 100);
  const verdict = now.key === "none" ? "Viko can't find a clear count right now."
    : held >= p.length * 0.5 ? `Stable: the same count has held for ${heldDays >= 1 ? `${Math.round(heldDays)} days` : `${held} checks`} (${pct}% of the period).`
    : held >= 3 ? `Fairly new: the current count has held for ${heldDays >= 1 ? `${Math.round(heldDays)} days` : `${held} checks`}.`
    : "Brand new: the count only appeared on the latest candles. That's normal right at a wave-3 entry, but check it again tomorrow.";
  // the distinct counts seen, newest first
  const seen: Point[] = [];
  for (let k = p.length - 1; k >= 0 && seen.length < 4; k--) if (!seen.some((x) => x.key === p[k].key)) seen.push(p[k]);
  return (
    <details className="card count-check">
      <summary><b>Count check (last {span >= 1 ? `${Math.round(span)} days` : `${p.length} candles`}):</b> {verdict} {changes > 0 && `The count changed ${changes} time${changes > 1 ? "s" : ""}.`}</summary>
      <p className="sub">Viko re-counted this chart {p.length} times, each time seeing only the candles up to that day, the way you'd re-check an old count. In testing, a brand-new count did as well as an old one, so this is a confidence check, not a filter.</p>
      <ul>{seen.map((x) => <li key={x.key}><b>{x.name}</b>{x.dir ? ` (${x.dir === "long" ? "buy" : "sell"}, rules ${x.score}%)` : ""}: last seen {new Date(x.t * 1000).toLocaleDateString()}{x.key === now.key ? " — current" : ""}</li>)}</ul>
    </details>
  );
}
