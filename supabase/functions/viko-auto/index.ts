// Viko Auto-trader: one button picks the strictest setups for your time window, places them on Binance or Deriv,
// then manages them (stop to entry after target 1, trailing, closing at the end of the window).
// Secrets: BINANCE_DEMO_KEY/SECRET, BINANCE_LIVE_KEY/SECRET, DERIV_APP_ID, DERIV_TOKEN (PAT with trade scope).
// User routes need x-viko-key (app key). POST /manage needs the cron key.
//   POST /preview {broker, mode, amount, count, horizon, strict, risk}
//   POST /start   {same}
//   GET  /state[?refresh=1]       plans, positions, events (refresh = re-check open trades with the broker now)
//   POST /close   {plan_id} | {position_id}   collect now
//   GET  /history                 closed trades for the summary
//   GET  /connect?broker=&mode=   balance check
//   POST /manage                  cron: manage every open trade and fill waiting plans
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type DB = ReturnType<typeof createClient>;
type Mode = "demo" | "live";
type Broker = "binance" | "deriv";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class UserError extends Error {}

const TF_H: Record<string, number> = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };
const HORIZONS: Record<string, { h: number; tfs: string[]; name: string }> = {
  "24h": { h: 24, tfs: ["15m", "30m", "1h", "2h"], name: "24 hours" },
  "48h": { h: 48, tfs: ["30m", "1h", "2h", "4h"], name: "48 hours" },
  "72h": { h: 72, tfs: ["1h", "2h", "4h"], name: "72 hours" },
  "1w": { h: 168, tfs: ["2h", "4h", "1d"], name: "1 week" },
  "1m": { h: 720, tfs: ["4h", "1d", "1w"], name: "1 month" },
};
const RISK: Record<string, number> = { careful: 0.1, balanced: 0.2, bold: 0.35 };
const ALL_TFS = Object.keys(TF_H);
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
const r2 = (x: number) => Math.round(x * 100) / 100;
const fmt = (x: number) => (Math.abs(x) >= 1000 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(4) : x.toPrecision(5));
async function event(db: DB, plan_id: string | null, position_id: string | null, message: string) { await db.from("viko_auto_events").insert({ plan_id, position_id, message }); }

// ======================= Binance USD-M futures =======================
const BN_BASE: Record<Mode, string> = { demo: "https://demo-fapi.binance.com", live: "https://fapi.binance.com" };
function bnCreds(mode: Mode) {
  const k = Deno.env.get(mode === "live" ? "BINANCE_LIVE_KEY" : "BINANCE_DEMO_KEY"), s = Deno.env.get(mode === "live" ? "BINANCE_LIVE_SECRET" : "BINANCE_DEMO_SECRET");
  return k && s ? { k, s } : null;
}
async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
class BnError extends Error { constructor(public code: number, msg: string) { super(msg); } }
async function bn(mode: Mode, method: string, path: string, params: Record<string, string | number | boolean> = {}, signed = true) {
  const c = bnCreds(mode);
  if (signed && !c) throw new UserError(`Binance ${mode} is not connected: add BINANCE_${mode === "live" ? "LIVE" : "DEMO"}_KEY and BINANCE_${mode === "live" ? "LIVE" : "DEMO"}_SECRET in Supabase secrets.`);
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  if (signed) { q.set("recvWindow", "5000"); q.set("timestamp", String(Date.now())); q.set("signature", await hmac(c!.s, q.toString())); }
  const r = await fetch(`${BN_BASE[mode]}${path}?${q}`, { method, headers: signed ? { "X-MBX-APIKEY": c!.k } : {} });
  const text = await r.text();
  let j: any; try { j = JSON.parse(text); } catch { j = { msg: text.slice(0, 200) }; }
  if (!r.ok || (typeof j?.code === "number" && j.code < 0)) {
    const code = j?.code ?? r.status, msg = j?.msg ?? text;
    if (r.status === 451) throw new BnError(code, "Binance refused this server's location.");
    if (code === -2015 || code === -2014) throw new BnError(code, "Binance rejected the API key (check Enable Futures, and that demo keys come from demo.binance.com).");
    if (code === -2019) throw new BnError(code, "Not enough margin in your Binance futures wallet.");
    throw new BnError(code, `Binance: ${msg} (${code})`);
  }
  return j;
}
const bnInfo: Partial<Record<Mode, { at: number; syms: Map<string, any> }>> = {};
async function bnRules(mode: Mode, viko: string) {
  let c = bnInfo[mode];
  if (!c || Date.now() - c.at > 3600000) {
    const j = await bn(mode, "GET", "/fapi/v1/exchangeInfo", {}, false);
    c = { at: Date.now(), syms: new Map(j.symbols.filter((s: any) => s.status === "TRADING").map((s: any) => [s.symbol, s])) };
    bnInfo[mode] = c;
  }
  const base = viko.replace(/^crypto:/, "");
  for (const [sym, scale] of [[base, 1], [`1000${base}`, 1000]] as [string, number][]) {
    const s = c.syms.get(sym);
    if (!s) continue;
    const f = (t: string) => s.filters.find((x: any) => x.filterType === t) ?? {};
    return { sym, scale, tick: Number(f("PRICE_FILTER").tickSize), step: Number(f("MARKET_LOT_SIZE").stepSize) || Number(f("LOT_SIZE").stepSize), minQty: Number(f("LOT_SIZE").minQty), minNotional: Number(f("MIN_NOTIONAL").notional ?? 5) };
  }
  return null;
}
const dec = (x: number) => { const s = String(x); return s.includes("e-") ? Number(s.split("e-")[1]) : (s.split(".")[1] ?? "").replace(/0+$/, "").length; };
const floorTo = (x: number, step: number) => (Math.floor(x / step + 1e-9) * step).toFixed(dec(step));
const roundTo = (x: number, tick: number) => (Math.round(x / tick) * tick).toFixed(dec(tick));
const bnMark = async (mode: Mode, sym: string) => Number((await bn(mode, "GET", "/fapi/v1/premiumIndex", { symbol: sym }, false)).markPrice);
async function bnProtect(mode: Mode, sym: string, long: boolean, stop: number, t2: number | null, tick: number) {
  const exit = long ? "SELL" : "BUY";
  await bn(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "STOP_MARKET", triggerPrice: roundTo(stop, tick), closePosition: true, workingType: "MARK_PRICE", priceProtect: true });
  if (t2 !== null) await bn(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t2, tick), closePosition: true, workingType: "MARK_PRICE" });
}
async function bnRealized(mode: Mode, sym: string, sinceMs: number) {
  const trades = await bn(mode, "GET", "/fapi/v1/userTrades", { symbol: sym, startTime: Math.max(sinceMs - 60000, Date.now() - 6.9 * 86400000), limit: 1000 });
  return (trades as any[]).reduce((a, t) => a + Number(t.realizedPnl) - (t.commissionAsset === "USDT" ? Number(t.commission) : 0), 0);
}
async function bnClose(mode: Mode, sym: string) {
  await bn(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {});
  const p = (await bn(mode, "GET", "/fapi/v3/positionRisk", { symbol: sym })).find((x: any) => Number(x.positionAmt) !== 0);
  if (!p) return null;
  const amt = Number(p.positionAmt);
  const res = await bn(mode, "POST", "/fapi/v1/order", { symbol: sym, side: amt > 0 ? "SELL" : "BUY", type: "MARKET", quantity: String(Math.abs(amt)), reduceOnly: true, newOrderRespType: "RESULT" });
  return Number(res.avgPrice);
}

// ======================= Deriv (new Options API, multipliers) =======================
function derivSymbol(id: string): string | null {
  const s = id.split(":")[1] ?? "";
  if (id.startsWith("crypto:")) return "cry" + s.replace(/USDT$/, "") + "USD";
  if (s.endsWith("=X")) return "frx" + s.replace("=X", "");
  const m: Record<string, string> = { "GC=F": "frxXAUUSD", "SI=F": "frxXAGUSD", "PL=F": "frxXPTUSD", "^GSPC": "OTC_SPC", SPY: "OTC_SPC", "^NDX": "OTC_NDX", QQQ: "OTC_NDX", "^DJI": "OTC_DJI", DIA: "OTC_DJI", "^FTSE": "OTC_FTSE", "^GDAXI": "OTC_GDAXI", "^N225": "OTC_N225", "^HSI": "OTC_HSI" };
  return m[s] ?? null;
}
class Deriv {
  ws!: WebSocket; n = 1; pending = new Map<number, { ok: (v: any) => void; no: (e: Error) => void }>(); account: any;
  static async open(mode: Mode) {
    const app = Deno.env.get("DERIV_APP_ID"), tok = Deno.env.get("DERIV_TOKEN");
    if (!app || !tok) throw new UserError("Deriv is not connected: add DERIV_APP_ID and DERIV_TOKEN in Supabase secrets.");
    const h = { Authorization: `Bearer ${tok}`, "Deriv-App-ID": app, "Content-Type": "application/json" };
    const r = await fetch("https://api.derivws.com/trading/v1/options/accounts", { headers: h });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new UserError(r.status === 401 || r.status === 403 ? "Deriv rejected the token. Make sure it has the 'trade' scope and that DERIV_APP_ID is the app it was made for." : `Deriv accounts request failed (${r.status}).`);
    const list: any[] = Array.isArray(j.data) ? j.data : j.data ? [j.data] : [];
    const want = mode === "live" ? "real" : "demo";
    const account = list.find((a) => a.account_type === want && a.status !== "disabled");
    if (!account) throw new UserError(mode === "live" ? "No real Deriv Options account was found. Open one in Deriv (Trader's Hub) first." : "No Deriv demo account was found.");
    const o = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${account.account_id}/otp`, { method: "POST", headers: h });
    const oj = await o.json().catch(() => ({}));
    if (!o.ok || !oj?.data?.url) throw new UserError(`Deriv would not open a trading session (${o.status}).`);
    const d = new Deriv(); d.account = account;
    d.ws = new WebSocket(oj.data.url);
    await new Promise<void>((ok, no) => { const t = setTimeout(() => no(new UserError("Deriv connection timed out.")), 12000); d.ws.onopen = () => { clearTimeout(t); ok(); }; d.ws.onerror = () => { clearTimeout(t); no(new UserError("Deriv connection failed.")); }; });
    d.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      const p = d.pending.get(m.req_id);
      if (!p) return;
      d.pending.delete(m.req_id);
      m.error ? p.no(new UserError(`Deriv: ${m.error.message}`)) : p.ok(m);
    };
    return d;
  }
  send(msg: Record<string, unknown>): Promise<any> {
    const req_id = this.n++;
    return new Promise((ok, no) => {
      const t = setTimeout(() => { this.pending.delete(req_id); no(new UserError("Deriv did not answer in time.")); }, 15000);
      this.pending.set(req_id, { ok: (v) => { clearTimeout(t); ok(v); }, no: (e) => { clearTimeout(t); no(e); } });
      this.ws.send(JSON.stringify({ ...msg, req_id }));
    });
  }
  close() { try { this.ws.close(); } catch { /* closed */ } }
  async multipliers(sym: string): Promise<number[] | null> {
    try {
      const m = await this.send({ contracts_for: sym, currency: this.account.currency ?? "USD" });
      const c = (m.contracts_for?.available ?? []).find((x: any) => x.contract_type === "MULTUP");
      return c ? (c.multiplier_range ?? []).map(Number).sort((a: number, b: number) => a - b) : null;
    } catch { return null; }
  }
  async spot(sym: string): Promise<number | null> {
    try { const m = await this.send({ ticks_history: sym, end: "latest", count: 1, style: "ticks" }); return Number(m.history?.prices?.[0]) || null; } catch { return null; }
  }
  poc(id: number) { return this.send({ proposal_open_contract: 1, contract_id: id }).then((m) => m.proposal_open_contract); }
}

// ======================= picking trades =======================
type Cfg = { broker: Broker; mode: Mode; amount: number; count: number; horizon: string; strict: number; risk: string };
function readCfg(b: any): Cfg {
  const broker: Broker = b.broker === "deriv" ? "deriv" : "binance";
  const cfg = { broker, mode: (b.mode === "live" ? "live" : "demo") as Mode, amount: Number(b.amount), count: Math.min(3, Math.max(1, Math.round(Number(b.count) || 1))), horizon: String(b.horizon), strict: Math.min(100, Math.max(65, Math.round(Number(b.strict) || 80))), risk: String(b.risk) };
  if (!(cfg.amount > 0)) throw new UserError("Enter how much to invest.");
  if (!HORIZONS[cfg.horizon]) throw new UserError("Pick a time window.");
  if (!RISK[cfg.risk]) cfg.risk = "balanced";
  return cfg;
}
function fresh(r: any, now: number) {
  const h = TF_H[r.tf];
  if (now - Date.parse(r.scanned_at) > Math.max(45 * 60000, 2 * h * 3600000)) return false;
  const quiet = r.tf === "1M" ? 40 * 86400 : r.tf === "1w" ? 10 * 86400 : r.tf === "1d" ? 4 * 86400 : 3 * h * 3600 + 20 * 60;
  return now / 1000 - r.candle_t <= quiet;
}
async function newsView(r: any) {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/viko-news`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: r.symbol, name: r.label, market: r.market, tf: r.tf, technical: { verdict: r.verdict, dir: r.dir, score: r.score, setup: r.setup?.name ?? "", price: r.price } }) });
    const j = await res.json();
    return { stance: j?.opinion?.stance as string | undefined, text: String(j?.opinion?.text ?? "").slice(0, 400) };
  } catch { return { stance: undefined, text: "" }; }
}
async function candidates(db: DB, cfg: Cfg, exclude: Set<string>, want: number) {
  const hz = HORIZONS[cfg.horizon];
  const now = Date.now();
  const { data } = await db.from("viko_picks").select("symbol,tf,label,market,price,candle_t,scanned_at,verdict,dir,score,hard_fail,triggered,rr1,setup,news_warn").gt("scanned_at", new Date(now - 3 * 3600000 - (hz.h > 100 ? 4 * 86400000 : 0)).toISOString());
  const rows = (data ?? []).filter((r: any) => fresh(r, now));
  const by = new Map<string, any[]>();
  for (const r of rows) by.set(r.symbol, [...(by.get(r.symbol) ?? []), r]);
  const lean = (r: any) => (r.setup && !r.hard_fail && (r.score ?? 0) >= 55 ? r.dir : null);
  // Quality: 80%+ means the book approved it. Below 80 (practice levels) also accepts triggered, rule-clean setups with 2R+.
  const quality = (r: any) => r.setup && (r.score ?? 0) >= cfg.strict && (r.verdict === "APPROVED" || (cfg.strict < 80 && r.verdict === "WATCH" && r.triggered && !r.hard_fail && (r.rr1 ?? 0) >= 2));
  const fitsTime = (r: any) => hz.tfs.includes(r.tf) && (r.setup.expectBars ?? 3) * TF_H[r.tf] <= hz.h * 0.8;
  const brokerOk = (r: any) => (cfg.broker === "binance" ? r.market === "Crypto" : derivSymbol(r.symbol) !== null);
  const s1 = rows.filter(quality), s2 = s1.filter(fitsTime), s3 = s2.filter(brokerOk), s4 = s3.filter((r: any) => !r.news_warn && !exclude.has(r.symbol));
  const diag: any = { quality: new Set(s1.map((r: any) => r.symbol)).size, time: new Set(s2.map((r: any) => r.symbol)).size, broker: new Set(s3.map((r: any) => r.symbol)).size, news: new Set(s4.map((r: any) => r.symbol)).size, opinionDropped: 0,
    otherBroker: new Set(s2.filter((r: any) => (cfg.broker === "binance" ? derivSymbol(r.symbol) !== null : r.market === "Crypto")).map((r: any) => r.symbol)).size,
    examples: s1.slice(0, 6).map((r: any) => `${r.label} ${r.tf} (${r.score}%)`) };
  const pool = s4.map((r: any) => {
    const others = (by.get(r.symbol) ?? []).filter((x) => x.tf !== r.tf && ALL_TFS.includes(x.tf));
    const agree = others.filter((x) => lean(x) === r.dir).length, against = others.filter((x) => lean(x) && lean(x) !== r.dir).length;
    return { ...r, agree, against, rank: r.score + 4 * agree - 8 * against + Math.min(4, r.rr1 ?? 0) * 2 };
  }).filter((r: any) => r.against < 3).sort((a: any, b: any) => b.rank - a.rank);
  const seen = new Set<string>(), out: any[] = [];
  for (const r of pool) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    const nv = await newsView(r);
    const opposed = (nv.stance === "bullish" && r.dir === "short") || (nv.stance === "bearish" && r.dir === "long");
    if (opposed) { diag.opinionDropped++; continue; }
    out.push({ ...r, opinion: nv.text, stance: nv.stance ?? "neutral" });
    if (out.length >= want) break;
  }
  return Object.assign(out, { diag });
}

/** Turn a pick into concrete broker terms (leverage or multiplier, amounts). Uses live broker prices. */
async function size(cfg: Cfg, r: any, money: number, d: Deriv | null) {
  const s = r.setup, long = r.dir === "long";
  const target = RISK[cfg.risk];
  if (cfg.broker === "binance") {
    const rules = await bnRules(cfg.mode, r.symbol);
    if (!rules) return { skip: `${r.label} has no Binance futures contract.` };
    const live = (await bnMark(cfg.mode, rules.sym)) / rules.scale;
    if (!(long ? s.stop < live && s.target1 > live : s.stop > live && s.target1 < live)) return { skip: `${r.label} has already moved past its stop or first target.` };
    const stopPct = Math.abs(live - s.stop) / live;
    let lev = Math.max(1, Math.min(10, Math.floor(target / stopPct)));
    if (lev * stopPct >= 0.8) lev = Math.floor(0.7 / stopPct);
    if (lev < 1) return { skip: `${r.label}'s stop-loss is too far away to trade safely.` };
    const notional = money * lev;
    if (notional < rules.minNotional) return { skip: `${r.label} needs at least ${Math.ceil(rules.minNotional / lev)} USDT per trade on Binance.` };
    return { live, stopPct, lev, t1Pct: Math.abs(s.target1 - live) / live, t2Pct: Math.abs(s.target2 - live) / live, rules };
  }
  const sym = derivSymbol(r.symbol)!;
  const mults = d ? await d.multipliers(sym) : null;
  if (d && !mults?.length) return { skip: `${r.label} can't be traded with multipliers on Deriv.` };
  const live = (d ? await d.spot(sym) : null) ?? r.price;
  if (!(long ? s.stop < live && s.target1 > live : s.stop > live && s.target1 < live)) return { skip: `${r.label} has already moved past its stop or first target.` };
  const stopPct = Math.abs(live - s.stop) / live;
  const allowed = mults ?? [1, 2, 3, 5, 10, 20, 50, 100];
  const fit = allowed.filter((m) => m * stopPct <= target * 1.25);
  const lev = fit.length ? fit[fit.length - 1] : allowed[0];
  if (lev * stopPct > 0.9) return { skip: `${r.label}'s stop-loss is too far for Deriv's smallest multiplier (${allowed[0]}x).` };
  return { live, stopPct, lev, t1Pct: Math.abs(s.target1 - live) / live, t2Pct: Math.abs(s.target2 - live) / live, sym };
}

async function preview(db: DB, cfg: Cfg, exclude = new Set<string>(), want?: number, d: Deriv | null = null) {
  const n = want ?? cfg.count;
  const picks = await candidates(db, cfg, exclude, n + 3);
  const diag = (picks as any).diag;
  const money = r2(cfg.amount / cfg.count);
  const trades: any[] = [], skipped: string[] = [];
  for (const r of picks) {
    if (trades.length >= n) break;
    const z: any = await size(cfg, r, money, d).catch((e) => ({ skip: `${r.label}: ${(e as Error).message}` }));
    if (z.skip) { skipped.push(z.skip); continue; }
    const pos = money * z.lev;
    trades.push({
      symbol: r.symbol, label: r.label, market: r.market, tf: r.tf, dir: r.dir, score: r.score, agree: r.agree, against: r.against, opinion: r.opinion, stance: r.stance,
      setup: `${r.setup.name} (${r.setup.degree})`, entry: z.live, stop: r.setup.stop, target1: r.setup.target1, target2: r.setup.target2,
      money, leverage: z.lev, loss: r2(pos * z.stopPct), profit1: r2(pos / 2 * z.t1Pct), profit2: r2(pos / 2 * z.t1Pct + pos / 2 * z.t2Pct),
      hours: [r2((r.setup.expectBars ?? 3) * TF_H[r.tf] * 0.6), r2((r.setup.expectBars ?? 3) * TF_H[r.tf] * 1.6)], _z: z,
    });
  }
  return { trades, skipped, money, horizon: HORIZONS[cfg.horizon].name, diag };
}

// ======================= placing =======================
async function place(db: DB, cfg: Cfg, plan_id: string, t: any, d: Deriv | null) {
  const long = t.dir === "long";
  const base = { plan_id, broker: cfg.broker, mode: cfg.mode, symbol: t.symbol, label: t.label, tf: t.tf, dir: t.dir, setup: t.setup, score: t.score, opinion: t.opinion, stake: t.money, leverage: t.leverage, stop: t.stop, initial_stop: t.stop, target1: t.target1, target2: t.target2 };
  if (cfg.broker === "binance") {
    const { rules } = t._z;
    const sym = rules.sym, sc = rules.scale;
    await bn(cfg.mode, "POST", "/fapi/v1/marginType", { symbol: sym, marginType: "ISOLATED" }).catch((e) => { if (!(e instanceof BnError) || e.code !== -4046) throw e; });
    await bn(cfg.mode, "POST", "/fapi/v1/leverage", { symbol: sym, leverage: t.leverage });
    const mark = await bnMark(cfg.mode, sym);
    const qty = floorTo(t.money * t.leverage / mark, rules.step);
    if (Number(qty) < rules.minQty) throw new UserError(`${t.label}: the amount is below Binance's minimum size.`);
    const filled = await bn(cfg.mode, "POST", "/fapi/v1/order", { symbol: sym, side: long ? "BUY" : "SELL", type: "MARKET", quantity: qty, newOrderRespType: "RESULT" });
    const entry = Number(filled.avgPrice) || mark;
    try { await bnProtect(cfg.mode, sym, long, t.stop * sc, null, rules.tick); }
    catch (e) { await bnClose(cfg.mode, sym).catch(() => {}); throw new UserError(`${t.label}: Binance refused the stop-loss, so the trade was closed straight away. ${(e as Error).message}`); }
    const half = floorTo(Number(qty) / 2, rules.step);
    const exit = long ? "SELL" : "BUY";
    if (Number(half) >= rules.minQty) await bn(cfg.mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t.target1 * sc, rules.tick), quantity: half, reduceOnly: true, workingType: "MARK_PRICE" }).catch(() => {});
    await bn(cfg.mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t.target2 * sc, rules.tick), closePosition: true, workingType: "MARK_PRICE" }).catch(() => {});
    const { data } = await db.from("viko_auto_positions").insert({ ...base, broker_symbol: sym, entry: entry / sc, qty: Number(qty), refs: { scale: sc, tick: rules.tick, step: rules.step, opened_ms: Date.now() }, last_price: entry / sc, last_pnl: 0 }).select().single();
    await event(db, plan_id, data!.id, `${long ? "Bought" : "Sold"} ${t.label} at ${fmt(entry / sc)} with ${t.money} USDT at ${t.leverage}x. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} and ${fmt(t.target2)}.`);
    return;
  }
  // Deriv: two half-size contracts, one takes profit at target 1, the other at target 2.
  const { sym, stopPct, t1Pct, t2Pct } = t._z;
  const ctype = long ? "MULTUP" : "MULTDOWN";
  const parts = t.money >= 2 ? [{ role: "t1", stake: r2(t.money / 2), tp: t1Pct }, { role: "t2", stake: r2(t.money - r2(t.money / 2)), tp: t2Pct }] : [{ role: "t1", stake: t.money, tp: t1Pct }];
  const refs: any[] = [];
  for (const p of parts) {
    const sl = Math.min(r2(p.stake * t.leverage * stopPct), r2(p.stake * 0.95));
    const tp = Math.max(0.01, r2(p.stake * t.leverage * p.tp));
    try {
      const m = await d!.send({ buy: "1", price: p.stake, parameters: { amount: p.stake, basis: "stake", contract_type: ctype, currency: d!.account.currency ?? "USD", underlying_symbol: sym, multiplier: t.leverage, limit_order: { stop_loss: Math.max(0.01, sl), take_profit: tp } } });
      refs.push({ id: m.buy.contract_id, role: p.role, stake: p.stake });
    } catch (e) {
      for (const r of refs) await d!.send({ sell: r.id, price: 0 }).catch(() => {});
      throw new UserError(`${t.label}: ${(e as Error).message}`);
    }
  }
  const first = await d!.poc(refs[0].id).catch(() => null);
  const entry = Number(first?.entry_spot ?? first?.entry_tick ?? t.entry);
  const { data } = await db.from("viko_auto_positions").insert({ ...base, broker_symbol: sym, entry, refs: { contracts: refs, account: d!.account.account_id }, last_price: entry, last_pnl: 0 }).select().single();
  await event(db, plan_id, data!.id, `${long ? "Bought (Up)" : "Sold (Down)"} ${t.label} on Deriv with ${t.money} USD at x${t.leverage}. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} and ${fmt(t.target2)}.`);
}

async function fill(db: DB, plan: any, d: Deriv | null) {
  const cfg: Cfg = { broker: plan.broker, mode: plan.mode, amount: plan.amount, count: plan.count, horizon: plan.horizon, strict: plan.strict, risk: plan.risk };
  const { data: mine } = await db.from("viko_auto_positions").select("symbol,status").eq("plan_id", plan.id);
  const { data: openAll } = await db.from("viko_auto_positions").select("symbol").eq("status", "open").eq("broker", plan.broker).eq("mode", plan.mode);
  const slots = plan.count - (mine ?? []).length;
  if (slots <= 0) return 0;
  const exclude = new Set([...(mine ?? []), ...(openAll ?? [])].map((x: any) => x.symbol));
  const pv = await preview(db, cfg, exclude, slots, d);
  let placed = 0;
  for (const t of pv.trades) {
    try { await place(db, cfg, plan.id, t, d); placed++; }
    catch (e) { await event(db, plan.id, null, (e as Error).message); }
  }
  return placed;
}

// ======================= managing =======================
async function manageBinance(db: DB, p: any, endNow: boolean, why = "time") {
  const mode = p.mode as Mode, sym = p.broker_symbol, sc = p.refs?.scale ?? 1, tick = p.refs?.tick ?? 0.0001, long = p.dir === "long";
  const since = p.refs?.opened_ms ?? Date.parse(p.opened_at);
  const pos = (await bn(mode, "GET", "/fapi/v3/positionRisk", { symbol: sym })).find((x: any) => Number(x.positionAmt) !== 0);
  if (!pos || endNow) {
    let exit = p.last_price;
    if (pos) exit = ((await bnClose(mode, sym)) ?? p.last_price * sc) / sc;
    await bn(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {});
    const pnl = await bnRealized(mode, sym, since).catch(() => p.last_pnl ?? 0);
    const reason = pos ? why : Math.abs(exit - p.stop) < Math.abs(exit - p.target2) ? (p.t1_hit ? "stop at entry" : "stop") : "target 2";
    await db.from("viko_auto_positions").update({ status: "closed", closed_at: new Date().toISOString(), pnl: r2(pnl), close_reason: reason, last_price: exit, last_pnl: r2(pnl), updated_at: new Date().toISOString() }).eq("id", p.id);
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${pnl >= 0 ? "+" : ""}${r2(pnl)} USDT.`);
    return;
  }
  const amt = Math.abs(Number(pos.positionAmt)), mark = Number(pos.markPrice) / sc;
  const realized = p.t1_hit ? await bnRealized(mode, sym, since).catch(() => 0) : 0;
  const patch: any = { last_price: mark, last_pnl: r2(Number(pos.unRealizedProfit) + realized), updated_at: new Date().toISOString() };
  const algos: any[] = await bn(mode, "GET", "/fapi/v1/openAlgoOrders", { symbol: sym }).catch(() => []);
  const hasStop = algos.some((o) => o.orderType === "STOP_MARKET");
  const prog = (long ? mark - p.entry : p.entry - mark) / Math.abs(p.target2 - p.entry);
  let newStop: number | null = null, msg = "";
  if (!p.t1_hit && amt <= p.qty * 0.75) { patch.t1_hit = true; newStop = p.entry; msg = `${p.label}: target 1 hit, half taken as profit. Stop moved to the entry price, so the rest can't lose.`; }
  else if (p.t1_hit && prog >= 0.6 && (long ? p.stop < p.target1 : p.stop > p.target1)) { newStop = p.target1; msg = `${p.label}: well on the way to target 2. Stop raised to target 1 to lock in profit.`; }
  if (newStop !== null || !hasStop) {
    const st = newStop ?? p.stop;
    await bn(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {});
    await bnProtect(mode, sym, long, st * sc, p.target2 * sc, tick);
    patch.stop = st;
    await event(db, p.plan_id, p.id, msg || `${p.label}: the stop-loss was missing on Binance, so Viko put it back at ${fmt(st)}.`);
  }
  await db.from("viko_auto_positions").update(patch).eq("id", p.id);
}

async function manageDeriv(db: DB, p: any, d: Deriv, endNow: boolean, why = "time") {
  const cons: any[] = p.refs?.contracts ?? [];
  let total = 0, allSold = true, spot = p.last_price;
  const states: any[] = [];
  for (const c of cons) {
    let s = await d.poc(c.id).catch(() => null);
    if (s && !s.is_sold && endNow) { await d.send({ sell: c.id, price: 0 }).catch(() => {}); s = await d.poc(c.id).catch(() => s); }
    states.push({ c, s });
    if (s) { total += Number(s.profit ?? 0); spot = Number(s.current_spot ?? spot); if (!s.is_sold) allSold = false; }
  }
  const patch: any = { last_price: spot, last_pnl: r2(total), updated_at: new Date().toISOString() };
  const t1 = states.find((x) => x.c.role === "t1"), t2 = states.find((x) => x.c.role === "t2");
  if (!p.t1_hit && t1?.s?.is_sold && Number(t1.s.profit) > 0) {
    patch.t1_hit = true; patch.stop = p.entry;
    if (t2?.s && !t2.s.is_sold) {
      const ok = await d.send({ contract_update: 1, contract_id: t2.c.id, limit_order: { stop_loss: Math.max(0.1, r2(t2.c.stake * 0.02)) } }).then(() => true, () => false);
      await event(db, p.plan_id, p.id, ok ? `${p.label}: target 1 hit, half taken as profit. The rest now risks almost nothing.` : `${p.label}: target 1 hit, half taken as profit.`);
    } else await event(db, p.plan_id, p.id, `${p.label}: target 1 hit.`);
  }
  if (allSold) {
    const reason = endNow ? why : total > 0 ? (t2?.s && Number(t2.s.profit) > 0 ? "target 2" : "target 1") : "stop";
    Object.assign(patch, { status: "closed", closed_at: new Date().toISOString(), pnl: r2(total), close_reason: reason });
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${total >= 0 ? "+" : ""}${r2(total)} USD.`);
  }
  await db.from("viko_auto_positions").update(patch).eq("id", p.id);
}

async function manageAll(db: DB, opts: { fillPlans: boolean; onlyPlan?: string; endPlan?: string; endPosition?: string }) {
  let q = db.from("viko_auto_plans").select("*").eq("status", "active");
  if (opts.onlyPlan) q = q.eq("id", opts.onlyPlan);
  const { data: plans } = await q;
  const sessions = new Map<string, Deriv>();
  const deriv = async (mode: Mode) => { if (!sessions.has(mode)) sessions.set(mode, await Deriv.open(mode)); return sessions.get(mode)!; };
  const errors: string[] = [];
  try {
    for (const plan of plans ?? []) {
      const ending = Date.now() >= Date.parse(plan.ends_at) || opts.endPlan === plan.id;
      const { data: pos } = await db.from("viko_auto_positions").select("*").eq("plan_id", plan.id).eq("status", "open");
      for (const p of pos ?? []) {
        const end = ending || opts.endPosition === p.id;
        const why = opts.endPlan === plan.id || opts.endPosition === p.id ? "collected by you" : "time window ended";
        try { p.broker === "binance" ? await manageBinance(db, p, end, why) : await manageDeriv(db, p, await deriv(p.mode), end, why); }
        catch (e) { errors.push(`${p.label}: ${(e as Error).message}`); }
      }
      if (ending) {
        await db.from("viko_auto_plans").update({ status: opts.endPlan === plan.id ? "stopped" : "done", closed_at: new Date().toISOString() }).eq("id", plan.id);
        await event(db, plan.id, null, opts.endPlan === plan.id ? "You collected this plan. All its trades are closed." : `The ${HORIZONS[plan.horizon]?.name ?? ""} window has ended. All trades are closed.`);
        continue;
      }
      if (opts.fillPlans && Date.now() < Date.parse(plan.enter_until)) {
        try { await fill(db, plan, plan.broker === "deriv" ? await deriv(plan.mode) : null); } catch (e) { errors.push((e as Error).message); }
      }
      const { count: openLeft } = await db.from("viko_auto_positions").select("id", { count: "exact", head: true }).eq("plan_id", plan.id).eq("status", "open");
      const { count: total } = await db.from("viko_auto_positions").select("id", { count: "exact", head: true }).eq("plan_id", plan.id);
      if ((openLeft ?? 0) === 0 && ((total ?? 0) >= plan.count || Date.now() >= Date.parse(plan.enter_until)) && (total ?? 0) > 0) {
        await db.from("viko_auto_plans").update({ status: "done", closed_at: new Date().toISOString() }).eq("id", plan.id);
        await event(db, plan.id, null, "Every trade in this plan has finished.");
      }
    }
  } finally { for (const s of sessions.values()) s.close(); }
  return errors;
}

// ======================= HTTP =======================
async function keyOk(req: Request, db: DB, k: string) {
  const given = req.headers.get("x-viko-key");
  if (!given) return false;
  const h = await sha(given);
  const { data } = await db.from("viko_config").select("v").eq("k", k);
  return (data ?? []).some((r: any) => r.v === h);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop();
  try {
    if (route === "manage") {
      if (!(await keyOk(req, db, "cron_key"))) return json({ error: "unauthorised" }, 401);
      return json({ ok: true, errors: await manageAll(db, { fillPlans: true }) });
    }
    if (!(await keyOk(req, db, "journal_key"))) return json({ error: "Your app key is missing or wrong. Add it in Settings." }, 401);

    if (route === "state") {
      if (url.searchParams.get("refresh")) await manageAll(db, { fillPlans: false }).catch(() => []);
      const { data: plans } = await db.from("viko_auto_plans").select("*").order("created_at", { ascending: false }).limit(20);
      const ids = (plans ?? []).map((p: any) => p.id);
      const { data: positions } = ids.length ? await db.from("viko_auto_positions").select("*").in("plan_id", ids).order("opened_at", { ascending: false }) : { data: [] };
      const { data: events } = await db.from("viko_auto_events").select("*").order("at", { ascending: false }).limit(60);
      return json({ plans, positions, events, now: Date.now() });
    }
    if (route === "history") {
      const { data } = await db.from("viko_auto_positions").select("id,plan_id,broker,mode,symbol,label,tf,dir,stake,leverage,entry,pnl,close_reason,opened_at,closed_at,score").eq("status", "closed").order("closed_at", { ascending: false }).limit(2000);
      return json({ rows: data });
    }
    if (route === "connect") {
      const broker = url.searchParams.get("broker") === "deriv" ? "deriv" : "binance";
      const mode: Mode = url.searchParams.get("mode") === "live" ? "live" : "demo";
      if (broker === "binance") {
        const acc = await bn(mode, "GET", "/fapi/v3/account");
        return json({ ok: true, broker, mode, balance: Number(acc.availableBalance), currency: "USDT" });
      }
      const d = await Deriv.open(mode);
      d.close();
      return json({ ok: true, broker, mode, balance: Number(d.account.balance ?? 0), currency: d.account.currency ?? "USD", account: d.account.account_id });
    }
    if (req.method !== "POST") return json({ error: "use POST" }, 405);
    const b = await req.json().catch(() => ({}));

    if (route === "preview" || route === "start") {
      const cfg = readCfg(b);
      const d = cfg.broker === "deriv" && (route === "start" || (Deno.env.get("DERIV_APP_ID") && Deno.env.get("DERIV_TOKEN"))) ? await Deriv.open(cfg.mode).catch((e) => { if (route === "start") throw e; return null; }) : null;
      try {
        const { data: openAll } = await db.from("viko_auto_positions").select("symbol").eq("status", "open").eq("broker", cfg.broker).eq("mode", cfg.mode);
        const pv = await preview(db, cfg, new Set((openAll ?? []).map((x: any) => x.symbol)), cfg.count, d);
        if (route === "preview") return json({ ...pv, trades: pv.trades.map(({ _z, ...t }: any) => t) });
        // start: check the wallet, create the plan, place what qualifies now; the rest is filled by the manager later.
        let balance = Infinity;
        if (cfg.broker === "binance") balance = Number((await bn(cfg.mode, "GET", "/fapi/v3/account")).availableBalance);
        else balance = Number(d!.account.balance ?? Infinity);
        if (balance < cfg.amount) throw new UserError(`Your ${cfg.broker === "binance" ? "Binance futures" : "Deriv"} ${cfg.mode} balance is ${r2(balance)}, less than the ${cfg.amount} you chose.`);
        const hz = HORIZONS[cfg.horizon];
        const now = Date.now();
        const { data: plan } = await db.from("viko_auto_plans").insert({ ...cfg, ends_at: new Date(now + hz.h * 3600000).toISOString(), enter_until: new Date(now + hz.h * 3600000 / 2).toISOString() }).select().single();
        await event(db, plan!.id, null, `Plan started: ${cfg.amount} ${cfg.broker === "binance" ? "USDT on Binance" : "USD on Deriv"} (${cfg.mode}), ${cfg.count} trade${cfg.count > 1 ? "s" : ""}, ${hz.name}, ${cfg.strict}%+ only.`);
        let placed = 0;
        for (const t of pv.trades) {
          try { await place(db, cfg, plan!.id, t, d); placed++; } catch (e) { await event(db, plan!.id, null, (e as Error).message); }
        }
        if (placed < cfg.count) await event(db, plan!.id, null, `${placed ? `${placed} placed now.` : "Nothing qualifies right now."} Viko keeps watching and fills the rest when a setup meets your bar, until ${new Date(Date.parse(plan!.enter_until)).toUTCString().slice(0, 22)} UTC.`);
        return json({ ok: true, plan_id: plan!.id, placed, skipped: pv.skipped });
      } finally { d?.close(); }
    }
    if (route === "close") {
      if (b.plan_id) return json({ ok: true, errors: await manageAll(db, { fillPlans: false, onlyPlan: String(b.plan_id), endPlan: String(b.plan_id) }) });
      if (b.position_id) {
        const { data: p } = await db.from("viko_auto_positions").select("plan_id").eq("id", b.position_id).single();
        return json({ ok: true, errors: await manageAll(db, { fillPlans: false, onlyPlan: p?.plan_id, endPosition: String(b.position_id) }) });
      }
      return json({ error: "Say which plan or trade to close." }, 400);
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof UserError || e instanceof BnError ? 400 : 500);
  }
});
