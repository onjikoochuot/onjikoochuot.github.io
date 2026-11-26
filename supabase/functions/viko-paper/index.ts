// Viko paper trading. All routes need header x-viko-key (your app key, or the cron key).
// GET  /viko-paper/state
// POST /viko-paper/open      {symbol,label,tf,dir,stop,target1,target2,setup,score,tip,source}
// POST /viko-paper/close     {id}
// POST /viko-paper/settings  {autopilot?,auto_level?,risk_pct?,auto_tfs?,watchlist?,reset?:{starting_balance}}
// POST /viko-paper/tick      manage open trades against live prices, then run the autopilot scan
// Waiting orders ("open when…", for paper and real money):
// POST /viko-paper/pending-add    {kind:"paper"|"real", pick, waitFor:"price"|"confirm", level?, minScore?, hours, amount?, closeAfterHours?, cfg?}
// GET  /viko-paper/pending-list
// POST /viko-paper/pending-cancel {id}
// POST /viko-paper/pending-check  (cron, every 5 minutes) open the ones whose condition is met (or ask you first)
// POST /viko-paper/pending-approve {id, amount?}   POST /viko-paper/pending-skip {id}   POST /viko-paper/pending-edit {id, amount?, level?, askFirst?}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { nextPeak, trailStop } from "./trail.ts";
import { costsFor, marketFill } from "./costs.ts";
import { candles, quotes, sha256, type Candle, type Tf } from "./market.ts";
// @ts-ignore engine bundle (scripts/build-functions.sh), pinned to a commit
import { analyze, makeTip } from "https://cdn.jsdelivr.net/gh/onjikoochuot/onjikoochuot.github.io@c0d8ca6a6e6a6833ccb85ed2485b08366ab05e63/supabase/functions/viko-paper/engine.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
type DB = ReturnType<typeof createClient>;
const MAX_OPEN = 25;
const TF_HOURS: Record<string, number> = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };
const ALL_TFS = Object.keys(TF_HOURS);

// Economic calendar (ForexFactory weekly feed), used to keep the autopilot out of trades right before big news.
type CalEvent = { title: string; currency: string; impact: string; at: number };
let calCache: { at: number; events: CalEvent[] } | null = null;
async function calendar(): Promise<CalEvent[]> {
  if (calCache && Date.now() - calCache.at < 30 * 60 * 1000) return calCache.events;
  const all: CalEvent[] = [];
  for (const f of ["ff_calendar_thisweek.json", "ff_calendar_nextweek.json"]) {
    try {
      const r = await fetch(`https://nfs.faireconomy.media/${f}`);
      if (!r.ok) continue;
      for (const e of await r.json()) all.push({ title: String(e.title), currency: String(e.country), impact: String(e.impact), at: Date.parse(e.date) });
    } catch { /* calendar optional */ }
  }
  calCache = { at: Date.now(), events: all };
  return all;
}
function currenciesFor(symbol: string): string[] {
  const s = symbol.split(":")[1] ?? "";
  if (s.endsWith("=X")) { const p = s.replace("=X", ""); return [p.slice(0, 3), p.slice(3, 6)]; }
  if (s === "^FTSE") return ["GBP"];
  if (s === "^GDAXI") return ["EUR"];
  if (s === "^N225") return ["JPY"];
  if (s === "^HSI") return ["CNY", "USD"];
  return ["USD"];
}
const inTime = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

async function authed(req: Request, db: DB) {
  const given = req.headers.get("x-viko-key");
  if (!given) return false;
  const h = await sha256(given);
  const { data } = await db.from("viko_config").select("k,v").in("k", ["journal_key", "cron_key"]);
  return (data ?? []).some((r: any) => r.v === h);
}

async function account(db: DB) {
  let { data } = await db.from("viko_paper_account").select("*").eq("id", "main").maybeSingle();
  if (!data) ({ data } = await db.from("viko_paper_account").insert({ id: "main" }).select().single());
  return data as any;
}
async function log(db: DB, trade_id: string | null, kind: string, message: string) {
  await db.from("viko_paper_events").insert({ trade_id, kind, message });
}
/** Queue a phone/Telegram/WhatsApp/email alert; viko-notify decides whether paper alerts are wanted. */
async function alert(db: DB, kind: string, title: string, body: string, pnl: number | null = null, mode = "paper") {
  await db.from("viko_alerts").insert({ kind, mode, title, body, pnl }).then(() => {}, () => {});
}
const fmt = (x: number) => (Math.abs(x) >= 1000 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(4) : x.toFixed(6));

async function openTrade(db: DB, acc: any, b: any, livePrice: number) {
  const long = b.dir === "long";
  // A market entry fills a little worse than the quote (slippage), and the fee is paid on the way in.
  const cost = costsFor(String(b.symbol));
  const entry = marketFill(livePrice, long ? "buy" : "sell", cost);
  const stop = Number(b.stop), t1 = Number(b.target1), t2 = Number(b.target2 ?? b.target1);
  if (!(long ? stop < entry && t1 > entry : stop > entry && t1 < entry)) throw new Error(`Price has moved: at ${fmt(entry)} the stop or target is on the wrong side. Re-analyse first.`);
  // Size: the amount you chose (paper dollars put into the trade), or by default 1% risk of the balance.
  const amount = Number(b.amount);
  if (b.amount != null && !(amount > 0)) throw new Error("Enter how much paper money to put into this trade.");
  if (amount > Number(acc.balance)) throw new Error(`That's more than your paper balance (${Number(acc.balance).toFixed(2)}).`);
  const riskMoney = Number(acc.balance) * Number(acc.risk_pct) / 100;
  const qty = amount > 0 ? amount / entry : riskMoney / Math.abs(entry - stop);
  const entryFee = qty * entry * cost.fee;
  const row = {
    symbol: String(b.symbol).slice(0, 40), label: String(b.label ?? b.symbol).slice(0, 40), tf: String(b.tf).slice(0, 3), dir: long ? "long" : "short",
    setup: String(b.setup ?? "").slice(0, 120), score: Number(b.score ?? 0), source: b.source === "auto" ? "auto" : "manual",
    entry, stop, initial_stop: stop, target1: t1, fees: entryFee, realized: -entryFee, target2: long ? Math.max(t1, t2) : Math.min(t1, t2), qty, qty_open: qty,
    last_price: entry, last_checked: Math.floor(Date.now() / 1000), tip: String(b.tip ?? "").slice(0, 1500), payload: b.payload ?? null,
    close_by: Number(b.closeAfterHours) > 0 ? new Date(Date.now() + Math.min(24 * 60, Number(b.closeAfterHours)) * 3600000).toISOString() : null,
  };
  const { data, error } = await db.from("viko_paper_trades").insert(row).select().single();
  if (error) throw error;
  await db.from("viko_paper_account").update({ balance: Number(acc.balance) - entryFee }).eq("id", "main");
  await log(db, data.id, "open", `${row.source === "auto" ? "Autopilot opened" : "Opened"} ${row.dir} ${row.label} at ${fmt(entry)} (quote ${fmt(livePrice)}, fee ${entryFee.toFixed(2)}), stop ${fmt(stop)}, target ${fmt(t1)}.`);
  await alert(db, "open", `Paper ${long ? "buy" : "sell"}: ${row.label}`, `Opened at ${fmt(entry)} (${row.tf}). Stop ${fmt(stop)}, target ${fmt(t1)}.`);
  return data;
}

async function closePart(db: DB, t: any, level: number, part: number, reason: string) {
  const long = t.dir === "long";
  // Targets are limit orders and fill at the target. Stops, time limits and manual closes are market orders and slip.
  const cost = costsFor(String(t.symbol));
  const price = reason === "target1" || reason === "target2" ? level : marketFill(level, long ? "sell" : "buy", cost);
  const fee = part * price * cost.fee;
  const pnl = (long ? price - t.entry : t.entry - price) * part - fee;
  const qtyOpen = Math.max(0, t.qty_open - part);
  const done = qtyOpen <= t.qty * 1e-9;
  const patch: any = { qty_open: done ? 0 : qtyOpen, realized: Number(t.realized) + pnl, last_price: price, fees: Number(t.fees ?? 0) + fee };
  if (done) Object.assign(patch, { status: "closed", exit_price: price, closed_at: new Date().toISOString(), close_reason: reason });
  await db.from("viko_paper_trades").update(patch).eq("id", t.id);
  const { data: acc } = await db.from("viko_paper_account").select("balance").eq("id", "main").single();
  await db.from("viko_paper_account").update({ balance: Number(acc!.balance) + pnl }).eq("id", "main");
  Object.assign(t, patch);
  if (reason === "target1") await alert(db, "t1", `Paper ${t.label}: target 1 hit`, `Half closed at ${fmt(price)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}). Stop moved to entry.`, pnl);
  if (done) await alert(db, "close", `Paper ${t.label} closed: ${Number(patch.realized) >= 0 ? "+" : ""}${Number(patch.realized).toFixed(2)}`, `Closed at ${fmt(price)} (${reason === "manual" ? "by you" : reason === "time" ? "time limit" : reason}). Total result ${Number(patch.realized) >= 0 ? "+" : ""}${Number(patch.realized).toFixed(2)} paper dollars.`, Number(patch.realized));
  await log(db, t.id, reason, `${t.label}: ${reason === "target1" ? "first target hit, half closed, stop moved to entry" : reason === "target2" ? "second target hit, trade closed" : reason === "trailing" ? "trailing stop hit, profit locked in" : reason === "stop" ? (t.t1_hit ? "stopped out at entry (no loss on the rest)" : "stop-loss hit, trade closed") : reason === "time" ? "time limit reached, closed at the market price" : "closed by you"} at ${fmt(price)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}).`);
}

/** Walk the 15-minute bars since the last check and apply stop / targets in a conservative order. */
async function manage(db: DB, open: any[]) {
  const bySym = new Map<string, Candle[]>();
  for (const t of open) {
    try {
      // 15-minute candles, from the first one that starts after the trade opened (the paper tick runs every 15 minutes).
      if (!bySym.has(t.symbol)) bySym.set(t.symbol, await candles(t.symbol, "15m"));
      const BAR = 900, openedSec = Math.floor(new Date(t.opened_at).getTime() / 1000);
      const bars = bySym.get(t.symbol)!.filter((k) => k.t + BAR > t.last_checked && k.t >= Math.ceil(openedSec / BAR) * BAR && k.t + BAR <= Math.floor(Date.now() / 1000) + 60);
      const long = t.dir === "long";
      for (const k of bars) {
        if (t.status !== "open") break;
        const hitStop = long ? k.l <= t.stop : k.h >= t.stop;
        if (hitStop) { const locked = long ? t.stop > t.entry : t.stop < t.entry; await closePart(db, t, t.stop, t.qty_open, locked ? "trailing" : "stop"); break; }
        if (!t.t1_hit && (long ? k.h >= t.target1 : k.l <= t.target1)) {
          await closePart(db, t, t.target1, t.qty / 2, "target1");
          t.t1_hit = true; t.stop = long ? Math.max(t.stop, t.entry) : Math.min(t.stop, t.entry);
          await db.from("viko_paper_trades").update({ t1_hit: true, stop: t.stop }).eq("id", t.id);
        }
        if (t.t1_hit && t.status === "open" && (long ? k.h >= t.target2 : k.l <= t.target2)) { await closePart(db, t, t.target2, t.qty_open, "target2"); break; }
        // Trail the stop with this candle's best price, exactly like the real-money managers.
        t.peak = nextPeak(t.dir, t.peak ?? t.entry, long ? k.h : k.l);
        const tr = trailStop({ dir: t.dir, entry: t.entry, initialStop: t.initial_stop ?? t.stop, stop: t.stop, target1: t.target1, target2: t.target2, peak: t.peak, price: k.c, t1Hit: !!t.t1_hit });
        if (tr) { t.stop = tr.stop; await log(db, t.id, "trail", `${t.label}: stop-loss moved to ${fmt(tr.stop)}: ${tr.why}.`); }
        await db.from("viko_paper_trades").update({ stop: t.stop, peak: t.peak }).eq("id", t.id);
      }
      const series = bySym.get(t.symbol)!;
      if (t.status === "open" && series.length) await db.from("viko_paper_trades").update({ last_price: series[series.length - 1].c, last_checked: series[series.length - 1].t }).eq("id", t.id);
      // Time limit you chose when opening: close at the latest price.
      if (t.status === "open" && t.close_by && Date.now() >= Date.parse(t.close_by)) {
        const q = await quotes([t.symbol]).catch(() => ({} as Record<string, { price: number }>));
        await closePart(db, t, q[t.symbol]?.price ?? (series.length ? series[series.length - 1].c : t.last_price ?? t.entry), t.qty_open, "time");
      }
    } catch (e) { await log(db, t.id, "error", `${t.label}: could not check prices (${(e as Error).message}).`); }
  }
}

async function autopilot(db: DB, acc: any) {
  const { data: open } = await db.from("viko_paper_trades").select("symbol").eq("status", "open");
  const busy = new Set((open ?? []).map((r: any) => r.symbol));
  let slots = MAX_OPEN - busy.size;
  const opened: string[] = [];
  // Approved level: take Viko-approved setups from the background scanner across ALL markets (it re-reads every daily
  // chart each hour). The old way only looked at a small watchlist on the timeframes you ticked, which could never
  // produce an approval once approval required the daily-chart tested edge.
  if (acc.auto_level !== "practice") {
    const { data: rows } = await db.from("viko_picks").select("symbol,label,tf,price,setup,score,scanned_at")
      .eq("verdict", "APPROVED").gt("scanned_at", new Date(Date.now() - 3 * 3600000).toISOString()).order("score", { ascending: false }).limit(40);
    const fresh = (rows ?? []).filter((r: any) => r.setup && !busy.has(r.symbol));
    const live = fresh.length ? await quotes([...new Set<string>(fresh.map((r: any) => String(r.symbol)))]).catch(() => ({} as Record<string, { price: number }>)) : {};
    for (const r of fresh as any[]) {
      if (slots <= 0 || busy.has(r.symbol)) continue;
      const st = r.setup, px = live[r.symbol]?.price ?? Number(r.price);
      try {
        await openTrade(db, acc, { symbol: r.symbol, label: r.label, tf: r.tf, dir: st.dir, stop: st.stop, target1: st.target1, target2: st.target2, setup: `${st.name} (${st.degree}), tested edge`, score: r.score, tip: st.edge?.why ?? "", source: "auto", closeAfterHours: r.tf === "1d" ? 1440 : undefined }, px);
        busy.add(r.symbol); slots--; opened.push(`${r.label} ${r.tf}`);
      } catch { /* price moved past the stop or target: skip */ }
    }
    return opened;
  }
  const watch: { id: string; label: string }[] = acc.watchlist ?? [];
  const cal = await calendar();
  const skipped = new Set<string>();
  for (const tf of (acc.auto_tfs ?? ["4h", "1d"]) as Tf[]) {
    for (const w of watch) {
      if (slots <= 0) return opened;
      if (busy.has(w.id)) continue;
      try {
        const c = await candles(w.id, tf);
        if (c.length < 150) continue;
        const a = analyze(c, tf, undefined, w.id);
        // Strict: only approved setups. Practice: also triggered, rule-clean setups at 65%+ with 2R or more.
        const s = a.setups.find((x: any) => x.verdict === "APPROVED")
          ?? (acc.auto_level === "practice" ? a.setups.find((x: any) => x.verdict === "WATCH" && !x.hardFail && x.triggered && x.rr1 >= 2 && x.score >= 65) : undefined);
        if (!s) continue;
        // Stand aside when a high-impact release for this market's currency lands within 2 hours (or 2 candles, if longer).
        const windowMs = Math.max(2, 2 * (TF_HOURS[tf] ?? 1)) * 3600000;
        const cur = currenciesFor(w.id);
        const now = Date.now();
        const big = cal.find((e) => e.impact === "High" && cur.includes(e.currency) && e.at > now && e.at - now <= windowMs);
        if (big) {
          if (!skipped.has(w.id)) { skipped.add(w.id); await log(db, null, "skip", `Skipped ${w.label} (${tf}): ${big.title} (${big.currency}) is due in ${inTime(big.at - now)}. Waiting until it's out.`); }
          continue;
        }
        const tip = makeTip(s, w.label, tf, Math.floor(Date.now() / 1000), Number(acc.balance), Number(acc.risk_pct));
        await openTrade(db, acc, { symbol: w.id, label: w.label, tf, dir: s.dir, stop: s.stop, target1: s.target1, target2: s.target2, setup: `${s.name} (${s.degree})${s.verdict === "APPROVED" ? "" : `, practice at ${s.score}%`}`, score: s.score, tip: [tip.headline, ...tip.steps].join("\n"), source: "auto" }, c[c.length - 1].c);
        busy.add(w.id); slots--; opened.push(`${w.label} ${tf}`);
      } catch { /* skip market this round */ }
    }
  }
  return opened;
}

// ======================= Waiting orders =======================
const MAX_WAITING = 30;
const AUTO = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-auto";
const num = (v: unknown) => Number(v);

async function addPending(db: DB, b: any) {
  const p = b.pick ?? {};
  const symbol = String(p.symbol ?? "");
  if (!/^(crypto|yahoo):[A-Za-z0-9.=^\-]{1,24}$/.test(symbol) || !(String(p.tf) in TF_HOURS)) throw new UserErr("That market or timeframe isn't recognised.");
  const kind = b.kind === "real" ? "real" : "paper";
  const dir = p.dir === "short" ? "short" : "long", long = dir === "long";
  const stop = num(p.stop), t1 = num(p.target1), t2 = num(p.target2 ?? p.target1);
  if (![stop, t1, t2].every((v) => v > 0)) throw new UserErr("This setup is missing its stop-loss or targets.");
  const waitFor = b.waitFor === "confirm" ? "confirm" : "price";
  const q = await quotes([symbol]);
  const price = q[symbol]?.price;
  if (!price) throw new UserErr("Couldn't get a live price for this market. Try again in a minute.");
  let level: number | null = null;
  if (waitFor === "price") {
    level = num(b.level);
    if (!(level > 0)) throw new UserErr("Enter the price to wait for.");
    if (long ? level <= stop : level >= stop) throw new UserErr(`That price is ${long ? "at or below" : "at or above"} the stop-loss (${fmt(stop)}). Choose a price between the stop-loss and target 1.`);
    if (long ? level >= t1 : level <= t1) throw new UserErr(`That price is already past target 1 (${fmt(t1)}). Choose a price between the stop-loss and target 1.`);
  }
  if (kind === "paper") { if (!(num(b.amount) > 0)) throw new UserErr("Enter how much paper money to put into this trade."); }
  else if (!b.cfg || typeof b.cfg !== "object") throw new UserErr("Choose the broker, account and amount first.");
  const { count } = await db.from("viko_pending").select("id", { count: "exact", head: true }).in("status", ["waiting", "asking"]);
  if ((count ?? 0) >= MAX_WAITING) throw new UserErr(`You already have ${MAX_WAITING} waiting orders. Cancel one first.`);
  const hours = Math.min(24 * 14, Math.max(1, num(b.hours) || 72));
  const row = {
    kind, symbol, label: String(p.label ?? symbol).slice(0, 40), market: String(p.market ?? "").slice(0, 20), tf: String(p.tf), dir,
    score: Math.round(num(p.score) || 0), name: String(p.name ?? "").slice(0, 80), stop, target1: t1, target2: long ? Math.max(t1, t2) : Math.min(t1, t2), expect_bars: Math.max(1, num(p.expectBars) || 3),
    wait_for: waitFor, level, start_price: price, min_score: Math.min(100, Math.max(65, Math.round(num(b.minScore) || 80))),
    amount: kind === "paper" ? num(b.amount) : null, close_after_hours: num(b.closeAfterHours) > 0 ? num(b.closeAfterHours) : null,
    cfg: kind === "real" ? { ...b.cfg, picks: undefined } : null, tip: String(p.tip ?? "").slice(0, 1500),
    expires_at: new Date(Date.now() + hours * 3600000).toISOString(), last_price: price,
    ask_first: b.askFirst === true, ask_minutes: Math.min(24 * 60, Math.max(5, Math.round(num(b.askMinutes) || 60))), no_answer: b.noAnswer === "cancel" ? "cancel" : "wait",
  };
  const { data, error } = await db.from("viko_pending").insert(row).select().single();
  if (error) throw error;
  if (kind === "paper") await log(db, null, "wait", `Waiting to ${long ? "buy" : "sell"} ${row.label} (${row.tf}): ${waitFor === "price" ? `opens when the price reaches ${fmt(level!)} (now ${fmt(price)})` : `opens when Viko confirms the setup at ${row.min_score}%+`}. ${row.ask_first ? " Viko asks you before opening it." : ""} Gives up after ${hours} hours.`);
  return data;
}

class UserErr extends Error {}

type Lv = { stop: number; target1: number; target2: number; score: number; name: string };
const APP = "https://onjikoochuot.github.io/";
const amountOf = (r: any) => (r.kind === "paper" ? Number(r.amount) : Number(r.cfg?.amount ?? 0));
const modeOf = (r: any) => (r.kind === "real" ? String(r.cfg?.mode ?? "live") : "paper");

/** Is the trade still worth taking at this price? "" = yes; otherwise why not. */
function stillGood(r: any, price: number, lv: Lv): string {
  const long = r.dir === "long";
  if (long ? price <= lv.stop : price >= lv.stop) return `The price is at or through the stop-loss (${fmt(lv.stop)}).`;
  const risk = Math.abs(price - lv.stop), reward = long ? lv.target1 - price : price - lv.target1;
  if (reward <= 0) return `The price has already passed target 1 (${fmt(lv.target1)}).`;
  if (reward < risk) return `At ${fmt(price)} target 1 would pay less than the risk.`;
  return "";
}

/** Open it: a paper trade, or a real-money order through Auto-trade. */
async function fire(db: DB, r: any, price: number, lv: Lv, key: string, amount = amountOf(r)): Promise<{ ok: boolean; note: string }> {
  const how = r.wait_for === "confirm" ? ` after Viko confirmed the setup at ${lv.score}%` : "";
  if (r.kind === "paper") {
    const { count } = await db.from("viko_paper_trades").select("id", { count: "exact", head: true }).eq("status", "open");
    if ((count ?? 0) >= MAX_OPEN) return { ok: false, note: `You already have ${MAX_OPEN} open paper trades.` };
    const acc = await account(db);
    const t = await openTrade(db, acc, { symbol: r.symbol, label: r.label, tf: r.tf, dir: r.dir, stop: lv.stop, target1: lv.target1, target2: lv.target2, setup: `${lv.name}, ${r.tf} (waited for entry)`.slice(0, 120), score: lv.score, tip: r.tip, source: "manual", amount, closeAfterHours: r.close_after_hours ?? undefined }, price);
    return { ok: true, note: `Entry reached: opened at ${fmt(Number(t.entry))} with $${amount.toFixed(2)}${how}.` };
  }
  const pick = { symbol: r.symbol, label: r.label, market: r.market, tf: r.tf, dir: r.dir, score: lv.score, name: lv.name, stop: lv.stop, target1: lv.target1, target2: lv.target2, expectBars: Number(r.expect_bars) };
  const res = await fetch(`${AUTO}/start-pending?forceFunctionRegion=ap-south-1`, { method: "POST", headers: { "content-type": "application/json", "x-viko-key": key }, body: JSON.stringify({ ...r.cfg, amount, count: 1, picks: [pick] }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.placed) return { ok: false, note: `The broker order didn't go through: ${j.error ?? (j.skipped?.[0] ?? "unknown reason")}` };
  return { ok: true, note: `Entry reached: placed ${amount.toFixed(2)} at about ${fmt(price)}${how}.` };
}

/** Check every waiting order once: cancel, expire, keep waiting, ask you, or open it. */
async function checkPending(db: DB, key: string) {
  const { data: rows } = await db.from("viko_pending").select("*").in("status", ["waiting", "asking"]).order("created_at").limit(MAX_WAITING);
  const out: string[] = [];
  if (!rows?.length) return out;
  const q = await quotes([...new Set<string>(rows.map((r: any) => String(r.symbol)))]).catch(() => ({} as Record<string, { price: number }>));
  const done = async (r: any, status: string, note: string) => {
    await db.from("viko_pending").update({ status, note, done_at: new Date().toISOString(), checked_at: new Date().toISOString() }).eq("id", r.id);
    if (r.kind === "paper") await log(db, null, status === "opened" ? "wait-open" : "wait-end", `${r.label}: ${note}`);
    if (status !== "opened") await alert(db, "close", `Waiting order ${status}: ${r.label}`, note, null, modeOf(r));
    out.push(`${r.label}: ${status}`);
  };
  for (const r of rows as any[]) {
    try {
      const long = r.dir === "long";
      const price = q[r.symbol]?.price;
      if (Date.now() >= Date.parse(r.expires_at)) { await done(r, "expired", `The entry didn't come in time, so Viko gave up without trading.${price ? ` Last price ${fmt(price)}.` : ""}`); continue; }
      if (!price) continue;
      await db.from("viko_pending").update({ last_price: price, checked_at: new Date().toISOString() }).eq("id", r.id);
      // The idea failed before it started: price went through the stop-loss.
      const stop = r.status === "asking" && r.ask_levels ? Number(r.ask_levels.stop) : Number(r.stop);
      if (long ? price <= stop : price >= stop) { await done(r, "cancelled", `The price reached the stop-loss level (${fmt(stop)}) before the trade opened, so the setup failed and nothing was traded.`); continue; }
      if (r.status === "asking") {
        // Waiting for your answer. Out of time: back to waiting, or cancel, as you chose.
        if (r.ask_until && Date.now() >= Date.parse(r.ask_until)) {
          if (r.no_answer === "cancel") await done(r, "cancelled", "You didn't approve it in time, so nothing was traded.");
          else {
            await db.from("viko_pending").update({ status: "waiting", asked_at: null, ask_until: null, ask_price: null, ask_levels: null, note: "You didn't answer in time, so Viko is waiting for the entry again." }).eq("id", r.id);
            out.push(`${r.label}: back to waiting`);
          }
        }
        continue;
      }
      let lv: Lv = { stop: Number(r.stop), target1: Number(r.target1), target2: Number(r.target2), score: Number(r.score), name: String(r.name) };
      if (r.wait_for === "price") {
        const lvl = Number(r.level), from = Number(r.start_price);
        const reached = from <= lvl ? price >= lvl : price <= lvl;
        if (!reached) continue;
      } else {
        const c: Candle[] = await candles(r.symbol, r.tf);
        const a = analyze(c, r.tf, undefined, r.symbol);
        // "Confirmed" = Viko approves it now (tested edge, trigger fired, rules clean), whatever the rule score.
        const s = a.setups.find((x: any) => x.dir === r.dir && x.verdict === "APPROVED");
        if (!s) continue;
        lv = { stop: s.stop, target1: s.target1, target2: s.target2, score: s.score, name: `${s.name} (${s.degree})` };
      }
      const why = stillGood(r, price, lv);
      if (why) {
        // A confirmed setup can recover on a later check; a fixed price that no longer pays is cancelled.
        if (r.wait_for === "price" || why.includes("passed target 1")) await done(r, "cancelled", `${why} Viko didn't enter.`);
        continue;
      }
      if (r.ask_first) {
        const mins = Math.max(5, Number(r.ask_minutes) || 60);
        await db.from("viko_pending").update({ status: "asking", asked_at: new Date().toISOString(), ask_until: new Date(Date.now() + mins * 60000).toISOString(), ask_price: price, ask_levels: lv, note: null }).eq("id", r.id);
        const page = r.kind === "paper" ? "#paper" : "#trades";
        await alert(db, "open", `Approve? ${r.label} reached your entry`, `${long ? "Buy" : "Sell"} ${r.label} (${r.tf}) at about ${fmt(price)}${r.wait_for === "confirm" ? `, setup confirmed at ${lv.score}%` : ""}. Stop-loss ${fmt(lv.stop)}, target 1 ${fmt(lv.target1)}. Amount ${amountOf(r).toFixed(2)}${r.kind === "paper" ? " paper dollars" : ` (${modeOf(r) === "live" ? "real money" : "demo"})`}. Approve, change the amount or skip in Viko within ${mins} minutes: ${APP}${page}`, null, modeOf(r));
        if (r.kind === "paper") await log(db, null, "wait-ask", `${r.label}: entry reached at ${fmt(price)}. Waiting for your approval (${mins} min).`);
        out.push(`${r.label}: asking`);
        continue;
      }
      const res = await fire(db, r, price, lv, key);
      await done(r, res.ok ? "opened" : "failed", res.ok ? res.note : `The entry came at ${fmt(price)}, but ${res.note}`);
    } catch (e) { await db.from("viko_pending").update({ note: `Last check failed: ${(e as Error).message}`.slice(0, 300), checked_at: new Date().toISOString() }).eq("id", r.id); }
  }
  return out;
}

/** You approved an order that reached its entry: re-check the price, then open it with the amount you chose. */
async function approvePending(db: DB, id: string, key: string, amountIn: unknown) {
  const { data: r } = await db.from("viko_pending").select("*").eq("id", id).maybeSingle();
  if (!r || r.status !== "asking") throw new UserErr("This order isn't waiting for your approval any more.");
  const amount = amountIn != null && amountIn !== "" ? num(amountIn) : amountOf(r);
  if (!(amount > 0)) throw new UserErr("Enter an amount above zero.");
  const q = await quotes([r.symbol]);
  const price = q[r.symbol]?.price;
  if (!price) throw new UserErr("Couldn't get a live price. Try again in a moment.");
  const lv = r.ask_levels as Lv;
  const why = stillGood(r, price, lv);
  if (why) throw new UserErr(`${why} It's safer not to enter now. Skip it, or leave it and Viko keeps watching until the approval time runs out.`);
  const res = await fire(db, r, price, lv, key, amount);
  if (!res.ok) throw new UserErr(res.note);
  const patch: any = { status: "opened", note: `Approved by you. ${res.note}`, done_at: new Date().toISOString() };
  if (r.kind === "paper") patch.amount = amount; else patch.cfg = { ...r.cfg, amount };
  await db.from("viko_pending").update(patch).eq("id", id);
  if (r.kind === "paper") await log(db, null, "wait-open", `${r.label}: approved by you. ${res.note}`);
  return res.note;
}

/** Change a waiting order before it opens: amount, entry price or how long it waits. */
async function editPending(db: DB, b: any) {
  const { data: r } = await db.from("viko_pending").select("*").eq("id", String(b.id)).maybeSingle();
  if (!r || !["waiting", "asking"].includes(r.status)) throw new UserErr("This order can't be changed any more.");
  const patch: any = {};
  if (b.amount !== undefined) {
    const a = num(b.amount);
    if (!(a > 0)) throw new UserErr("Enter an amount above zero.");
    if (r.kind === "paper") { const acc = await account(db); if (a > Number(acc.balance)) throw new UserErr(`That's more than your paper balance (${Number(acc.balance).toFixed(2)}).`); patch.amount = a; }
    else patch.cfg = { ...r.cfg, amount: a };
  }
  if (b.level !== undefined && r.wait_for === "price" && r.status === "waiting") {
    const lvl = num(b.level), long = r.dir === "long";
    if (!(lvl > 0) || (long ? lvl <= r.stop || lvl >= r.target1 : lvl >= r.stop || lvl <= r.target1)) throw new UserErr(`Choose an entry between the stop-loss (${fmt(Number(r.stop))}) and target 1 (${fmt(Number(r.target1))}).`);
    const q = await quotes([r.symbol]);
    Object.assign(patch, { level: lvl, start_price: q[r.symbol]?.price ?? r.start_price });
  }
  if (typeof b.askFirst === "boolean") patch.ask_first = b.askFirst;
  if (!Object.keys(patch).length) throw new UserErr("Nothing to change.");
  const { data } = await db.from("viko_pending").update(patch).eq("id", r.id).select().single();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await authed(req, db))) return json({ error: "Your app key is missing or wrong. Add it in Settings." }, 401);
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  try {
    let acc = await account(db);
    if (route === "state") {
      const [{ data: open }, { data: closed }, { data: events }] = await Promise.all([
        db.from("viko_paper_trades").select("*").eq("status", "open").order("opened_at", { ascending: false }),
        db.from("viko_paper_trades").select("*").eq("status", "closed").eq("hidden", false).order("closed_at", { ascending: false }).limit(100),
        db.from("viko_paper_events").select("*").order("at", { ascending: false }).limit(40),
      ]);
      const syms: string[] = ((open ?? []) as any[]).map((t) => String(t.symbol));
      const q = await quotes([...new Set(syms)]);
      for (const t of open ?? []) if (q[t.symbol]) t.last_price = q[t.symbol].price;
      return json({ account: acc, open, closed, events, now: Date.now() });
    }
    if (route === "report") {
      // Every finished paper trade, including ones hidden from the history list, for the track record.
      const { data, error } = await db.from("viko_paper_trades")
        .select("id,symbol,label,tf,dir,setup,score,source,opened_at,closed_at,entry,initial_stop,target1,qty,realized,fees,close_reason")
        .eq("status", "closed").order("closed_at", { ascending: false }).limit(5000);
      if (error) return json({ error: error.message }, 500);
      return json({ trades: data, since: acc.created_at });
    }
    if (route === "pending-list") {
      const [{ data: waiting }, { data: recent }] = await Promise.all([
        db.from("viko_pending").select("*").in("status", ["waiting", "asking"]).order("created_at", { ascending: false }),
        db.from("viko_pending").select("*").not("status", "in", "(waiting,asking)").gt("done_at", new Date(Date.now() - 3 * 86400000).toISOString()).order("done_at", { ascending: false }).limit(30),
      ]);
      return json({ waiting: waiting ?? [], recent: recent ?? [] });
    }
    if (req.method !== "POST") return json({ error: "use POST" }, 405);
    const b = await req.json().catch(() => ({}));
    if (route === "open") {
      const { count } = await db.from("viko_paper_trades").select("id", { count: "exact", head: true }).eq("status", "open");
      if ((count ?? 0) >= MAX_OPEN) return json({ error: `You already have ${MAX_OPEN} open paper trades. Close one first.` }, 400);
      const q = await quotes([b.symbol]);
      const price = q[b.symbol]?.price;
      if (!price) return json({ error: "Couldn't get a live price for this market." }, 502);
      return json({ trade: await openTrade(db, acc, b, price) });
    }
    if (route === "pending-add") {
      try { return json({ pending: await addPending(db, b) }); } catch (e) { if (e instanceof UserErr) return json({ error: e.message }, 400); throw e; }
    }
    if (route === "pending-cancel") {
      const { data } = await db.from("viko_pending").update({ status: "cancelled", note: "Cancelled by you.", done_at: new Date().toISOString() }).eq("id", String(b.id)).in("status", ["waiting", "asking"]).select();
      if (!data?.length) return json({ error: "That order isn't waiting any more." }, 400);
      return json({ ok: true });
    }
    if (route === "pending-check") return json({ ok: true, changed: await checkPending(db, req.headers.get("x-viko-key") ?? "") });
    if (route === "pending-approve" || route === "pending-edit" || route === "pending-skip") {
      try {
        if (route === "pending-approve") return json({ ok: true, note: await approvePending(db, String(b.id), req.headers.get("x-viko-key") ?? "", b.amount) });
        if (route === "pending-edit") return json({ pending: await editPending(db, b) });
        const { data } = await db.from("viko_pending").update({ status: "skipped", note: "Skipped by you, nothing traded.", done_at: new Date().toISOString() }).eq("id", String(b.id)).in("status", ["waiting", "asking"]).select();
        if (!data?.length) throw new UserErr("That order isn't waiting any more.");
        return json({ ok: true });
      } catch (e) { if (e instanceof UserErr) return json({ error: e.message }, 400); throw e; }
    }
    if (route === "history-delete") {
      // Deletes finished trades only (never open ones). The balance is not changed.
      const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 500) : [];
      if (!b.all && !ids.length) return json({ error: "Choose which trades to delete." }, 400);
      // Hidden from the history list, but kept for the track record (which needs every result to be honest).
      let q = db.from("viko_paper_trades").update({ hidden: true }, { count: "exact" }).eq("status", "closed").eq("hidden", false);
      if (!b.all) q = q.in("id", ids);
      const { count, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, deleted: count ?? 0 });
    }
    if (route === "close") {
      const { data: t } = await db.from("viko_paper_trades").select("*").eq("id", b.id).single();
      if (!t || t.status !== "open") return json({ error: "That trade is not open." }, 400);
      const q = await quotes([t.symbol]);
      await closePart(db, t, q[t.symbol]?.price ?? t.last_price, t.qty_open, "manual");
      return json({ ok: true });
    }
    if (route === "settings") {
      const patch: any = {};
      if (typeof b.autopilot === "boolean") patch.autopilot = b.autopilot;
      if (b.auto_level === "approved" || b.auto_level === "practice") patch.auto_level = b.auto_level;
      if (b.risk_pct !== undefined) patch.risk_pct = Math.min(5, Math.max(0.1, Number(b.risk_pct)));
      if (Array.isArray(b.auto_tfs)) patch.auto_tfs = b.auto_tfs.filter((x: string) => ALL_TFS.includes(x));
      if (Array.isArray(b.watchlist)) patch.watchlist = b.watchlist.slice(0, 60).map((w: any) => ({ id: String(w.id).slice(0, 40), label: String(w.label).slice(0, 40) }));
      if (b.reset) {
        const sb = Math.max(100, Number(b.reset.starting_balance ?? 10000));
        await db.from("viko_paper_trades").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await db.from("viko_paper_events").delete().neq("id", 0);
        Object.assign(patch, { balance: sb, starting_balance: sb });
      }
      const { data } = await db.from("viko_paper_account").update(patch).eq("id", "main").select().single();
      if (b.autopilot !== undefined) await log(db, null, "settings", b.autopilot ? "Autopilot switched on." : "Autopilot switched off.");
      if (b.reset) await log(db, null, "settings", `Paper account reset to ${patch.balance}.`);
      return json({ account: data });
    }
    if (route === "tick") {
      const { data: open } = await db.from("viko_paper_trades").select("*").eq("status", "open");
      await manage(db, open ?? []);
      let opened: string[] = [];
      const due = !acc.last_scan || Date.now() - new Date(acc.last_scan).getTime() > 10 * 60 * 1000;
      if (acc.autopilot && (due || b.force)) {
        opened = await autopilot(db, acc);
        await db.from("viko_paper_account").update({ last_scan: new Date().toISOString() }).eq("id", "main");
      }
      await db.from("viko_paper_account").update({ last_tick: new Date().toISOString() }).eq("id", "main");
      return json({ ok: true, managed: (open ?? []).length, opened });
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }
});

// For the management tests.
export { manage, closePart, checkPending, approvePending, editPending };
