// supabase/functions/viko-paper/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// supabase/functions/viko-paper/trail.ts
function trailStop(x) {
  const s = x.dir === "long" ? 1 : -1;
  const e = x.entry * s, s0 = x.initialStop * s, cur = x.stop * s, t1 = x.target1 * s, t2 = x.target2 * s;
  const px = x.price * s, pk = Math.max(x.peak * s, px);
  const r1 = t1 - e;
  if (!(r1 > 0) || ![e, s0, cur, t1, t2, px, pk].every(Number.isFinite)) return null;
  const g = pk - e;
  let cand = s0, why = "";
  if (g >= 0.5 * r1 && e - 0.5 * (e - s0) > cand) {
    cand = e - 0.5 * (e - s0);
    why = "halfway to target 1, so the risk is cut in half";
  }
  if (g >= 0.8 * r1 && e > cand) {
    cand = e;
    why = "close to target 1, so the stop is now at the entry price and the trade can't lose";
  }
  if ((x.t1Hit || g >= r1) && e + 0.5 * g > cand) {
    cand = e + 0.5 * g;
    why = "past target 1, so the stop locks in half of the best gain so far";
  }
  if (t2 > e && g >= 0.6 * (t2 - e) && t1 > cand) {
    cand = t1;
    why = "well on the way to target 2, so the stop is at target 1";
  }
  cand = Math.min(cand, px - 0.25 * r1);
  if (cand <= cur + 0.05 * r1) return null;
  return { stop: cand * s, why, locksProfit: cand > e };
}
var nextPeak = (dir, peak, ...prices) => {
  const all = [peak, ...prices].filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  return all.length ? dir === "long" ? Math.max(...all) : Math.min(...all) : NaN;
};

// supabase/functions/viko-paper/costs.ts
var MAJORS = /* @__PURE__ */ new Set(["BTC", "ETH", "BNB", "SOL", "XRP"]);
function costsFor(symbol) {
  const [src, raw = ""] = symbol.split(":");
  const s = raw.toUpperCase();
  if (src === "crypto") {
    const base = s.replace(/(USDT|USDC|FDUSD|BUSD)$/, "");
    return MAJORS.has(base) ? { fee: 5e-4, slip: 2e-4, label: "major coin: 0.05% fee + 0.02% slippage per side" } : { fee: 5e-4, slip: 8e-4, label: "smaller coin: 0.05% fee + 0.08% slippage per side" };
  }
  if (s.endsWith("=X")) return { fee: 1e-4, slip: 1e-4, label: "currency pair: 0.01% spread + 0.01% slippage per side" };
  if (s.endsWith("=F")) return { fee: 2e-4, slip: 2e-4, label: "commodity: 0.02% spread + 0.02% slippage per side" };
  return { fee: 5e-4, slip: 3e-4, label: "stock or index: 0.05% spread + 0.03% slippage per side" };
}
function marketFill(price, side, c) {
  return side === "buy" ? price * (1 + c.slip) : price * (1 - c.slip);
}

// supabase/functions/viko-paper/market.ts
var UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
async function binance(sym, tf) {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com"];
  let lastErr = "";
  for (const h of hosts) {
    try {
      const r = await fetch(`${h}/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000`);
      if (!r.ok) {
        lastErr = `${h} ${r.status}`;
        continue;
      }
      const rows = await r.json();
      return rows.map((k) => ({ t: Math.floor(Number(k[0]) / 1e3), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(`binance: ${lastErr}`);
}
async function yahoo(sym, tf) {
  const cfg = {
    "5m": ["5m", "60d", 0],
    "15m": ["15m", "60d", 0],
    "30m": ["30m", "60d", 0],
    "1h": ["60m", "730d", 0],
    "2h": ["60m", "730d", 7200],
    "4h": ["60m", "730d", 14400],
    "1d": ["1d", "10y", 0],
    "1w": ["1wk", "max", 0],
    "1M": ["1mo", "max", 0]
  };
  const [iv, range, bucketSec] = cfg[tf];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${iv}&range=${range}&includePrePost=false`;
  let r = await fetch(url, { headers: UA });
  if (!r.ok) r = await fetch(url.replace("query1", "query2"), { headers: UA });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description ?? "yahoo: no data");
  const ts = res.timestamp ?? [];
  const q = res.indicators.quote[0];
  let out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x) => x == null || Number.isNaN(x))) continue;
    out.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  if (bucketSec) {
    const agg = [];
    for (const k of out) {
      const bucket = Math.floor(k.t / bucketSec) * bucketSec;
      const last = agg[agg.length - 1];
      if (last && last.t === bucket) {
        last.h = Math.max(last.h, k.h);
        last.l = Math.min(last.l, k.l);
        last.c = k.c;
        last.v += k.v;
      } else agg.push({ ...k, t: bucket });
    }
    out = agg;
  }
  return out.slice(-1e3);
}
async function candles(symbol, tf) {
  const m = symbol.match(/^(crypto|yahoo):([A-Za-z0-9.=^\-]{1,24})$/);
  if (!m) throw new Error("bad symbol");
  return m[1] === "crypto" ? binance(m[2].toUpperCase(), tf) : yahoo(m[2].toUpperCase(), tf);
}
async function quotes(symbols) {
  const out = {};
  const crypto2 = symbols.filter((s) => s.startsWith("crypto:")).map((s) => s.slice(7).toUpperCase()).filter((s) => /^[A-Z0-9]{2,20}$/.test(s));
  const yah = symbols.filter((s) => s.startsWith("yahoo:")).map((s) => s.slice(6)).filter((s) => /^[A-Za-z0-9.=^\-]{1,24}$/.test(s));
  const jobs = [];
  if (crypto2.length) jobs.push((async () => {
    for (const h of ["https://data-api.binance.vision", "https://api.binance.com"]) {
      try {
        const r = await fetch(`${h}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(crypto2))}&type=MINI`);
        if (!r.ok) continue;
        for (const t of await r.json()) {
          const p = +t.lastPrice, o = +t.openPrice;
          out[`crypto:${t.symbol}`] = { price: p, change: o ? (p / o - 1) * 100 : 0 };
        }
        return;
      } catch {
      }
    }
  })());
  for (const s of yah) jobs.push((async () => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1h&range=1d`, { headers: UA });
      if (!r.ok) return;
      const meta = (await r.json())?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return;
      const prev = meta.chartPreviousClose ?? meta.previousClose;
      out[`yahoo:${s}`] = { price: meta.regularMarketPrice, change: prev ? (meta.regularMarketPrice / prev - 1) * 100 : 0 };
    } catch {
    }
  })());
  await Promise.all(jobs);
  return out;
}
async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// supabase/functions/viko-paper/index.ts
import { analyze, makeTip } from "https://cdn.jsdelivr.net/gh/onjikoochuot/onjikoochuot.github.io@c77a63cf778ec7acec7aee88b13f7c62705344c2/supabase/functions/viko-paper/engine.js";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
var MAX_OPEN = 25;
var TF_HOURS = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };
var ALL_TFS = Object.keys(TF_HOURS);
var calCache = null;
async function calendar() {
  if (calCache && Date.now() - calCache.at < 30 * 60 * 1e3) return calCache.events;
  const all = [];
  for (const f of ["ff_calendar_thisweek.json", "ff_calendar_nextweek.json"]) {
    try {
      const r = await fetch(`https://nfs.faireconomy.media/${f}`);
      if (!r.ok) continue;
      for (const e of await r.json()) all.push({ title: String(e.title), currency: String(e.country), impact: String(e.impact), at: Date.parse(e.date) });
    } catch {
    }
  }
  calCache = { at: Date.now(), events: all };
  return all;
}
function currenciesFor(symbol) {
  const s = symbol.split(":")[1] ?? "";
  if (s.endsWith("=X")) {
    const p = s.replace("=X", "");
    return [p.slice(0, 3), p.slice(3, 6)];
  }
  if (s === "^FTSE") return ["GBP"];
  if (s === "^GDAXI") return ["EUR"];
  if (s === "^N225") return ["JPY"];
  if (s === "^HSI") return ["CNY", "USD"];
  return ["USD"];
}
var inTime = (ms) => {
  const m = Math.round(ms / 6e4);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
async function authed(req, db) {
  const given = req.headers.get("x-viko-key");
  if (!given) return false;
  const h = await sha256(given);
  const { data } = await db.from("viko_config").select("k,v").in("k", ["journal_key", "cron_key"]);
  return (data ?? []).some((r) => r.v === h);
}
async function account(db) {
  let { data } = await db.from("viko_paper_account").select("*").eq("id", "main").maybeSingle();
  if (!data) ({ data } = await db.from("viko_paper_account").insert({ id: "main" }).select().single());
  return data;
}
async function log(db, trade_id, kind, message) {
  await db.from("viko_paper_events").insert({ trade_id, kind, message });
}
async function alert(db, kind, title, body, pnl = null) {
  await db.from("viko_alerts").insert({ kind, mode: "paper", title, body, pnl }).then(() => {
  }, () => {
  });
}
var fmt = (x) => Math.abs(x) >= 1e3 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(4) : x.toFixed(6);
async function openTrade(db, acc, b, livePrice) {
  const long = b.dir === "long";
  const cost = costsFor(String(b.symbol));
  const entry = marketFill(livePrice, long ? "buy" : "sell", cost);
  const stop = Number(b.stop), t1 = Number(b.target1), t2 = Number(b.target2 ?? b.target1);
  if (!(long ? stop < entry && t1 > entry : stop > entry && t1 < entry)) throw new Error(`Price has moved: at ${fmt(entry)} the stop or target is on the wrong side. Re-analyse first.`);
  const amount = Number(b.amount);
  if (b.amount != null && !(amount > 0)) throw new Error("Enter how much paper money to put into this trade.");
  if (amount > Number(acc.balance)) throw new Error(`That's more than your paper balance (${Number(acc.balance).toFixed(2)}).`);
  const riskMoney = Number(acc.balance) * Number(acc.risk_pct) / 100;
  const qty = amount > 0 ? amount / entry : riskMoney / Math.abs(entry - stop);
  const entryFee = qty * entry * cost.fee;
  const row = {
    symbol: String(b.symbol).slice(0, 40),
    label: String(b.label ?? b.symbol).slice(0, 40),
    tf: String(b.tf).slice(0, 3),
    dir: long ? "long" : "short",
    setup: String(b.setup ?? "").slice(0, 120),
    score: Number(b.score ?? 0),
    source: b.source === "auto" ? "auto" : "manual",
    entry,
    stop,
    initial_stop: stop,
    target1: t1,
    fees: entryFee,
    realized: -entryFee,
    target2: long ? Math.max(t1, t2) : Math.min(t1, t2),
    qty,
    qty_open: qty,
    last_price: entry,
    last_checked: Math.floor(Date.now() / 1e3),
    tip: String(b.tip ?? "").slice(0, 1500),
    payload: b.payload ?? null,
    close_by: Number(b.closeAfterHours) > 0 ? new Date(Date.now() + Math.min(24 * 60, Number(b.closeAfterHours)) * 36e5).toISOString() : null
  };
  const { data, error } = await db.from("viko_paper_trades").insert(row).select().single();
  if (error) throw error;
  await db.from("viko_paper_account").update({ balance: Number(acc.balance) - entryFee }).eq("id", "main");
  await log(db, data.id, "open", `${row.source === "auto" ? "Autopilot opened" : "Opened"} ${row.dir} ${row.label} at ${fmt(entry)} (quote ${fmt(livePrice)}, fee ${entryFee.toFixed(2)}), stop ${fmt(stop)}, target ${fmt(t1)}.`);
  await alert(db, "open", `Paper ${long ? "buy" : "sell"}: ${row.label}`, `Opened at ${fmt(entry)} (${row.tf}). Stop ${fmt(stop)}, target ${fmt(t1)}.`);
  return data;
}
async function closePart(db, t, level, part, reason) {
  const long = t.dir === "long";
  const cost = costsFor(String(t.symbol));
  const price = reason === "target1" || reason === "target2" ? level : marketFill(level, long ? "sell" : "buy", cost);
  const fee = part * price * cost.fee;
  const pnl = (long ? price - t.entry : t.entry - price) * part - fee;
  const qtyOpen = Math.max(0, t.qty_open - part);
  const done = qtyOpen <= t.qty * 1e-9;
  const patch = { qty_open: done ? 0 : qtyOpen, realized: Number(t.realized) + pnl, last_price: price, fees: Number(t.fees ?? 0) + fee };
  if (done) Object.assign(patch, { status: "closed", exit_price: price, closed_at: (/* @__PURE__ */ new Date()).toISOString(), close_reason: reason });
  await db.from("viko_paper_trades").update(patch).eq("id", t.id);
  const { data: acc } = await db.from("viko_paper_account").select("balance").eq("id", "main").single();
  await db.from("viko_paper_account").update({ balance: Number(acc.balance) + pnl }).eq("id", "main");
  Object.assign(t, patch);
  if (reason === "target1") await alert(db, "t1", `Paper ${t.label}: target 1 hit`, `Half closed at ${fmt(price)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}). Stop moved to entry.`, pnl);
  if (done) await alert(db, "close", `Paper ${t.label} closed: ${Number(patch.realized) >= 0 ? "+" : ""}${Number(patch.realized).toFixed(2)}`, `Closed at ${fmt(price)} (${reason === "manual" ? "by you" : reason === "time" ? "time limit" : reason}). Total result ${Number(patch.realized) >= 0 ? "+" : ""}${Number(patch.realized).toFixed(2)} paper dollars.`, Number(patch.realized));
  await log(db, t.id, reason, `${t.label}: ${reason === "target1" ? "first target hit, half closed, stop moved to entry" : reason === "target2" ? "second target hit, trade closed" : reason === "trailing" ? "trailing stop hit, profit locked in" : reason === "stop" ? t.t1_hit ? "stopped out at entry (no loss on the rest)" : "stop-loss hit, trade closed" : reason === "time" ? "time limit reached, closed at the market price" : "closed by you"} at ${fmt(price)} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}).`);
}
async function manage(db, open) {
  const bySym = /* @__PURE__ */ new Map();
  for (const t of open) {
    try {
      if (!bySym.has(t.symbol)) bySym.set(t.symbol, await candles(t.symbol, "15m"));
      const BAR = 900, openedSec = Math.floor(new Date(t.opened_at).getTime() / 1e3);
      const bars = bySym.get(t.symbol).filter((k) => k.t + BAR > t.last_checked && k.t >= Math.ceil(openedSec / BAR) * BAR && k.t + BAR <= Math.floor(Date.now() / 1e3) + 60);
      const long = t.dir === "long";
      for (const k of bars) {
        if (t.status !== "open") break;
        const hitStop = long ? k.l <= t.stop : k.h >= t.stop;
        if (hitStop) {
          const locked = long ? t.stop > t.entry : t.stop < t.entry;
          await closePart(db, t, t.stop, t.qty_open, locked ? "trailing" : "stop");
          break;
        }
        if (!t.t1_hit && (long ? k.h >= t.target1 : k.l <= t.target1)) {
          await closePart(db, t, t.target1, t.qty / 2, "target1");
          t.t1_hit = true;
          t.stop = long ? Math.max(t.stop, t.entry) : Math.min(t.stop, t.entry);
          await db.from("viko_paper_trades").update({ t1_hit: true, stop: t.stop }).eq("id", t.id);
        }
        if (t.t1_hit && t.status === "open" && (long ? k.h >= t.target2 : k.l <= t.target2)) {
          await closePart(db, t, t.target2, t.qty_open, "target2");
          break;
        }
        t.peak = nextPeak(t.dir, t.peak ?? t.entry, long ? k.h : k.l);
        const tr = trailStop({ dir: t.dir, entry: t.entry, initialStop: t.initial_stop ?? t.stop, stop: t.stop, target1: t.target1, target2: t.target2, peak: t.peak, price: k.c, t1Hit: !!t.t1_hit });
        if (tr) {
          t.stop = tr.stop;
          await log(db, t.id, "trail", `${t.label}: stop-loss moved to ${fmt(tr.stop)}: ${tr.why}.`);
        }
        await db.from("viko_paper_trades").update({ stop: t.stop, peak: t.peak }).eq("id", t.id);
      }
      const series = bySym.get(t.symbol);
      if (t.status === "open" && series.length) await db.from("viko_paper_trades").update({ last_price: series[series.length - 1].c, last_checked: series[series.length - 1].t }).eq("id", t.id);
      if (t.status === "open" && t.close_by && Date.now() >= Date.parse(t.close_by)) {
        const q = await quotes([t.symbol]).catch(() => ({}));
        await closePart(db, t, q[t.symbol]?.price ?? (series.length ? series[series.length - 1].c : t.last_price ?? t.entry), t.qty_open, "time");
      }
    } catch (e) {
      await log(db, t.id, "error", `${t.label}: could not check prices (${e.message}).`);
    }
  }
}
async function autopilot(db, acc) {
  const { data: open } = await db.from("viko_paper_trades").select("symbol").eq("status", "open");
  const busy = new Set((open ?? []).map((r) => r.symbol));
  let slots = MAX_OPEN - busy.size;
  const opened = [];
  const watch = acc.watchlist ?? [];
  const cal = await calendar();
  const skipped = /* @__PURE__ */ new Set();
  for (const tf of acc.auto_tfs ?? ["4h", "1d"]) {
    for (const w of watch) {
      if (slots <= 0) return opened;
      if (busy.has(w.id)) continue;
      try {
        const c = await candles(w.id, tf);
        if (c.length < 150) continue;
        const a = analyze(c, tf);
        const s = a.setups.find((x) => x.verdict === "APPROVED") ?? (acc.auto_level === "practice" ? a.setups.find((x) => x.verdict === "WATCH" && !x.hardFail && x.triggered && x.rr1 >= 2 && x.score >= 65) : void 0);
        if (!s) continue;
        const windowMs = Math.max(2, 2 * (TF_HOURS[tf] ?? 1)) * 36e5;
        const cur = currenciesFor(w.id);
        const now = Date.now();
        const big = cal.find((e) => e.impact === "High" && cur.includes(e.currency) && e.at > now && e.at - now <= windowMs);
        if (big) {
          if (!skipped.has(w.id)) {
            skipped.add(w.id);
            await log(db, null, "skip", `Skipped ${w.label} (${tf}): ${big.title} (${big.currency}) is due in ${inTime(big.at - now)}. Waiting until it's out.`);
          }
          continue;
        }
        const tip = makeTip(s, w.label, tf, Math.floor(Date.now() / 1e3), Number(acc.balance), Number(acc.risk_pct));
        await openTrade(db, acc, { symbol: w.id, label: w.label, tf, dir: s.dir, stop: s.stop, target1: s.target1, target2: s.target2, setup: `${s.name} (${s.degree})${s.verdict === "APPROVED" ? "" : `, practice at ${s.score}%`}`, score: s.score, tip: [tip.headline, ...tip.steps].join("\n"), source: "auto" }, c[c.length - 1].c);
        busy.add(w.id);
        slots--;
        opened.push(`${w.label} ${tf}`);
      } catch {
      }
    }
  }
  return opened;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!await authed(req, db)) return json({ error: "Your app key is missing or wrong. Add it in Settings." }, 401);
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  try {
    let acc = await account(db);
    if (route === "state") {
      const [{ data: open }, { data: closed }, { data: events }] = await Promise.all([
        db.from("viko_paper_trades").select("*").eq("status", "open").order("opened_at", { ascending: false }),
        db.from("viko_paper_trades").select("*").eq("status", "closed").eq("hidden", false).order("closed_at", { ascending: false }).limit(100),
        db.from("viko_paper_events").select("*").order("at", { ascending: false }).limit(40)
      ]);
      const syms = (open ?? []).map((t) => String(t.symbol));
      const q = await quotes([...new Set(syms)]);
      for (const t of open ?? []) if (q[t.symbol]) t.last_price = q[t.symbol].price;
      return json({ account: acc, open, closed, events, now: Date.now() });
    }
    if (route === "report") {
      const { data, error } = await db.from("viko_paper_trades").select("id,symbol,label,tf,dir,setup,score,source,opened_at,closed_at,entry,initial_stop,target1,qty,realized,fees,close_reason").eq("status", "closed").order("closed_at", { ascending: false }).limit(5e3);
      if (error) return json({ error: error.message }, 500);
      return json({ trades: data, since: acc.created_at });
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
    if (route === "history-delete") {
      const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 500) : [];
      if (!b.all && !ids.length) return json({ error: "Choose which trades to delete." }, 400);
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
      const patch = {};
      if (typeof b.autopilot === "boolean") patch.autopilot = b.autopilot;
      if (b.auto_level === "approved" || b.auto_level === "practice") patch.auto_level = b.auto_level;
      if (b.risk_pct !== void 0) patch.risk_pct = Math.min(5, Math.max(0.1, Number(b.risk_pct)));
      if (Array.isArray(b.auto_tfs)) patch.auto_tfs = b.auto_tfs.filter((x) => ALL_TFS.includes(x));
      if (Array.isArray(b.watchlist)) patch.watchlist = b.watchlist.slice(0, 60).map((w) => ({ id: String(w.id).slice(0, 40), label: String(w.label).slice(0, 40) }));
      if (b.reset) {
        const sb = Math.max(100, Number(b.reset.starting_balance ?? 1e4));
        await db.from("viko_paper_trades").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await db.from("viko_paper_events").delete().neq("id", 0);
        Object.assign(patch, { balance: sb, starting_balance: sb });
      }
      const { data } = await db.from("viko_paper_account").update(patch).eq("id", "main").select().single();
      if (b.autopilot !== void 0) await log(db, null, "settings", b.autopilot ? "Autopilot switched on." : "Autopilot switched off.");
      if (b.reset) await log(db, null, "settings", `Paper account reset to ${patch.balance}.`);
      return json({ account: data });
    }
    if (route === "tick") {
      const { data: open } = await db.from("viko_paper_trades").select("*").eq("status", "open");
      await manage(db, open ?? []);
      let opened = [];
      const due = !acc.last_scan || Date.now() - new Date(acc.last_scan).getTime() > 10 * 60 * 1e3;
      if (acc.autopilot && (due || b.force)) {
        opened = await autopilot(db, acc);
        await db.from("viko_paper_account").update({ last_scan: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", "main");
      }
      await db.from("viko_paper_account").update({ last_tick: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", "main");
      return json({ ok: true, managed: (open ?? []).length, opened });
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String(e.message ?? e) }, 502);
  }
});
export {
  closePart,
  manage
};
