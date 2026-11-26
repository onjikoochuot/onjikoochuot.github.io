import { useEffect, useState } from "react";
import { fmt } from "../engine/analyze";
import { auto, paper } from "../lib/api";

type Open = { kind: "Paper" | "Real money" | "Demo"; dir: string; tf: string; entry: number; stop: number; target1: number; t1: boolean; opened: string; setup: string };

/**
 * On the chart page: if you already hold a trade in this market, show it above the verdict and explain that the
 * verdict is only about opening a NEW trade now. Your open trade keeps its own plan (stop, trailing, targets), so an
 * approval that has expired since you entered is not a reason to panic or close.
 */
export default function OpenTradeNote({ appKey, symbol }: { appKey: string; symbol: string }) {
  const [open, setOpen] = useState<Open[]>([]);
  useEffect(() => {
    if (!appKey) return;
    let gone = false;
    Promise.all([
      paper.state(appKey).then((s) => s.open.filter((t) => t.symbol === symbol).map((t): Open => ({ kind: "Paper", dir: t.dir, tf: t.tf, entry: t.entry, stop: t.stop, target1: t.target1, t1: t.t1_hit, opened: t.opened_at, setup: t.setup }))).catch(() => [] as Open[]),
      auto.state(appKey).then((s) => s.positions.filter((p) => p.symbol === symbol && p.status === "open").map((p): Open => ({ kind: p.mode === "live" ? "Real money" : "Demo", dir: p.dir, tf: p.tf, entry: p.entry, stop: p.stop, target1: p.target1, t1: p.t1_hit, opened: p.opened_at, setup: p.setup }))).catch(() => [] as Open[]),
    ]).then(([a, b]) => { if (!gone) setOpen([...a, ...b]); });
    return () => { gone = true; };
  }, [appKey, symbol]);
  if (!open.length) return null;
  return (
    <section className="card open-note" role="status">
      {open.map((t, i) => (
        <p key={i}>
          <b>You have an open {t.kind.toLowerCase()} {t.dir === "long" ? "buy" : "sell"} here</b> ({t.tf}, opened {new Date(t.opened).toLocaleDateString()} at {fmt(t.entry)}).
          {" "}It follows its own plan: stop-loss now {fmt(t.stop)}{t.t1 ? ", target 1 already reached and half taken as profit" : `, target 1 ${fmt(t.target1)}`}, trailing stop on. Manage it under {t.kind === "Paper" ? "Paper" : "My trades"}.
        </p>
      ))}
      <p className="sub">The verdict below only answers "should I open a <i>new</i> trade right now?". A setup is approved on the day its entry signal fires; after that day it shows as "don't enter now" even when the trade you already took is fine. That isn't a reason to close your trade: only its stop-loss, targets or time limit should do that.</p>
    </section>
  );
}
