// Viko paper trading. All routes need header x-viko-key (your app key, or the cron key).
// GET  /viko-paper/state
// POST /viko-paper/open      {symbol,label,tf,dir,stop,target1,target2,setup,score,tip,source}
// POST /viko-paper/close     {id}
// POST /viko-paper/settings  {autopilot?,auto_level?,risk_pct?,auto_tfs?,watchlist?,reset?:{starting_balance}}
// POST /viko-paper/tick      manage open trades against live prices, then run the autopilot scan
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { nextPeak, trailStop } from "./trail.ts";
import { candles, quotes, sha256, type Candle, type Tf } from "./market.ts";
// @ts-ignore engine bundle (scripts/build-functions.sh), pinned to a commit
import { analyze, makeTip } from "https://cdn.jsdelivr.net/gh/onjikoochuot/onjikoochuot.github.io@c77a63cf778ec7acec7aee88b13f7c62705344c2/supabase/functions/viko-paper/engine.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
type DB = ReturnType<typeof createClient>;
const MAX_OPEN = 8;
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
async function alert(db: DB, kind: string, title: string, body: string, pnl: number | null = null) {
  await db.from("viko_alerts").insert({ kind, mode: "paper", title, body, pnl }).then(() => {}, () => {});
}
const fmt = (x: number) => (Math.abs(x) >= 1000 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(4) : x.toFixed(6));

async function openTrade(db: DB, acc: any, b: any, livePrice: number) {
  const long = b.dir === "long";
  const entry = livePrice;
  const stop = Number(b.stop), t1 = Number(b.target1), t2 = Number(b.target2 ?? b.target1);
  if (!(long ? stop < entry && t1 > entry : stop > entry && t1 < entry)) throw new Error(`Price has moved: at ${fmt(entry)} the stop or target is on the wrong side. Re-analyse first.`);
  const riskMoney = Number(acc.balance) * Number(acc.risk_pct) / 100;
  const qty = riskMoney / Math.abs(entry - stop);
  const row = {
    symbol: String(b.symbol).slice(0, 40), label: String(b.label ?? b.symbol).slice(0, 40), tf: String(b.tf).slice(0, 3), dir: long ? "long" : "short",
    setup: String(b.setup ?? "").slice(0, 120), score: Number(b.score ?? 0), source: b.source === "auto" ? "auto" : "manual",
    entry, stop, initial_stop: stop, target1: t1, target2: long ? Math.max(t1, t2) : Math.min(t1, t2), qty, qty_open: qty,
    last_price: entry, last_checked: Math.floor(Date.now() / 1000), tip: String(b.tip ?? "").slice(0, 1500), payload: b.payload ?? null,
  };
  const { data, error } = await db.from("viko_paper_trades").insert(row).select().single();
  if (error) throw error;
  await log(db, data.id, "open", `${row.source === "auto" ? "Autopilot opened" : "Opened"} ${row.dir} ${row.label} at ${fmt(entry)}, stop ${fmt(stop)}, target ${fmt(t1)}.`);
  await alert(db, "open", `Paper ${long ? "buy" : "sell"}: ${row.label}`, `Opened at ${fmt(entry)} (${row.tf}). Stop ${fmt(stop)}, target ${fmt(t1)}.`);
  return data;
}

async function closePart(db: DB, t: any, price: number, part: number, reason: string) {
  const long = t.dir === "long";
  const pnl = (long ? price - t.entry : t.entry - price) * part;
  const qtyOpen = Math.max(0, t.qty_open - part);
  const done = qtyOpen <= t.qty * 1e-9;
  const patch: any = { qty_open: done ? 0 : qtyOpen, realized: Number(t.realized) + pnl, last_price: price };
  if (done) Object.assign(patch, { status: "closed", exit_price: price, closed_at: new Date().toISOString(), close_reason: reason });
  await db.from("viko_paper_trades").update(patch).eq("id", t.id);
  const { data: acc } = await db.from("viko_paper_account").select("balance").eq("id", "main").single();
  await db.from("viko_paper_account").update({ balance: Number(acc!.balance) + pnl }).eq("id", "main");
  Object.assign(t, patch);
  if (reason === "target1") await alert(db, "t1", `Paper ${t.label}: target 1 hit`, `Half closed at ${fmt(price)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}). Stop moved to entry.`, pnl);
  if (done) await alert(db, "close", `Paper ${t.label} closed: ${Number(patch.realized) >= 0 ? "+" : ""}${Number(patch.realized).toFixed(2)}`, `Closed at ${fmt(price)} (${reason === "manual" ? "by you" : reason}). Total result ${Number(patch.realized) >= 0 ? "+" : ""}${Number(patch.realized).toFixed(2)} paper dollars.`, Number(patch.realized));
  await log(db, t.id, reason, `${t.label}: ${reason === "target1" ? "first target hit, half closed, stop moved to entry" : reason === "target2" ? "second target hit, trade closed" : reason === "trailing" ? "trailing stop hit, profit locked in" : reason === "stop" ? (t.t1_hit ? "stopped out at entry (no loss on the rest)" : "stop-loss hit, trade closed") : "closed by you"} at ${fmt(price)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}).`);
}

/** Walk the hourly bars since the last check and apply stop / targets in a conservative order. */
async function manage(db: DB, open: any[]) {
  const bySym = new Map<string, Candle[]>();
  for (const t of open) {
    try {
      if (!bySym.has(t.symbol)) bySym.set(t.symbol, await candles(t.symbol, "1h"));
      const bars = bySym.get(t.symbol)!.filter((k) => k.t + 3600 > t.last_checked && k.t >= Math.floor(new Date(t.opened_at).getTime() / 1000 / 3600) * 3600 + 3600);
      const long = t.dir === "long";
      for (const k of bars) {
        if (t.status !== "open") break;
        const hitStop = long ? k.l <= t.stop : k.h >= t.stop;
        if (hitStop) { const locked = long ? t.stop > t.entry : t.stop < t.entry; await closePart(db, t, t.stop, t.qty_open, locked ? "trailing" : "stop"); break; }
        if (!t.t1_hit && (long ? k.h >= t.target1 : k.l <= t.target1)) {
          await closePart(db, t, t.target1, t.qty / 2, "target1");
          t.t1_hit = true; t.stop = long ? Math.max(t.stop, t.entry) : Math.min(t.stop, t.entry);
          await db.from("viko_paper_trades").update({ t1_hit: true, stop: t.entry }).eq("id", t.id);
        }
        if (t.t1_hit && t.status === "open" && (long ? k.h >= t.target2 : k.l <= t.target2)) { await closePart(db, t, t.target2, t.qty_open, "target2"); break; }
        // Trail the stop with this hour's best price, exactly like the real-money managers.
        t.peak = nextPeak(t.dir, t.peak ?? t.entry, long ? k.h : k.l);
        const tr = trailStop({ dir: t.dir, entry: t.entry, initialStop: t.initial_stop ?? t.stop, stop: t.stop, target1: t.target1, target2: t.target2, peak: t.peak, price: k.c, t1Hit: !!t.t1_hit });
        if (tr) { t.stop = tr.stop; await log(db, t.id, "trail", `${t.label}: stop-loss moved to ${fmt(tr.stop)}: ${tr.why}.`); }
        await db.from("viko_paper_trades").update({ stop: t.stop, peak: t.peak }).eq("id", t.id);
      }
      const series = bySym.get(t.symbol)!;
      if (t.status === "open" && series.length) await db.from("viko_paper_trades").update({ last_price: series[series.length - 1].c, last_checked: series[series.length - 1].t }).eq("id", t.id);
    } catch (e) { await log(db, t.id, "error", `${t.label}: could not check prices (${(e as Error).message}).`); }
  }
}

async function autopilot(db: DB, acc: any) {
  const { data: open } = await db.from("viko_paper_trades").select("symbol").eq("status", "open");
  const busy = new Set((open ?? []).map((r: any) => r.symbol));
  let slots = MAX_OPEN - busy.size;
  const opened: string[] = [];
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
        const a = analyze(c, tf);
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
        db.from("viko_paper_trades").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(100),
        db.from("viko_paper_events").select("*").order("at", { ascending: false }).limit(40),
      ]);
      const syms: string[] = ((open ?? []) as any[]).map((t) => String(t.symbol));
      const q = await quotes([...new Set(syms)]);
      for (const t of open ?? []) if (q[t.symbol]) t.last_price = q[t.symbol].price;
      return json({ account: acc, open, closed, events, now: Date.now() });
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
