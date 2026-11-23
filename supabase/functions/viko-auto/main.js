import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class UserError extends Error {
}
const TF_H = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };
const HORIZONS = {
  "24h": { h: 24, tfs: ["5m", "15m", "30m", "1h", "2h", "4h"], name: "24 hours" },
  "48h": { h: 48, tfs: ["15m", "30m", "1h", "2h", "4h"], name: "48 hours" },
  "72h": { h: 72, tfs: ["30m", "1h", "2h", "4h", "1d"], name: "72 hours" },
  "1w": { h: 168, tfs: ["1h", "2h", "4h", "1d"], name: "1 week" },
  "1m": { h: 720, tfs: ["4h", "1d", "1w"], name: "1 month" }
};
const RISK = { careful: 0.1, balanced: 0.2, bold: 0.35, max: 0.5 };
const ALL_TFS = Object.keys(TF_H);
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
const r2 = (x) => Math.round(x * 100) / 100;
const fmt = (x) => Math.abs(x) >= 1e3 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(4) : x.toPrecision(5);
async function event(db, plan_id, position_id, message) {
  await db.from("viko_auto_events").insert({ plan_id, position_id, message });
}
const brokerName = (b) => b === "binance" ? "Binance" : b === "deriv" ? "Deriv" : "Binance + Deriv";
async function sourcePrice(id) {
  try {
    const [src, sym] = id.split(":");
    if (src === "crypto") {
      const r3 = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${sym}`);
      return r3.ok ? Number((await r3.json()).price) : null;
    }
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`, { headers: UA });
    return r.ok ? Number((await r.json())?.chart?.result?.[0]?.meta?.regularMarketPrice) || null : null;
  } catch {
    return null;
  }
}
const BN_BASE = { demo: "https://demo-fapi.binance.com", live: "https://fapi.binance.com" };
function bnCreds(mode) {
  const k = Deno.env.get(mode === "live" ? "BINANCE_LIVE_KEY" : "BINANCE_DEMO_KEY"), s = Deno.env.get(mode === "live" ? "BINANCE_LIVE_SECRET" : "BINANCE_DEMO_SECRET");
  return k && s ? { k, s } : null;
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
class BnError extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
  code;
}
async function bn(mode, method, path, params = {}, signed = true) {
  const c = bnCreds(mode);
  if (signed && !c) throw new UserError(`Binance ${mode} is not connected: add BINANCE_${mode === "live" ? "LIVE" : "DEMO"}_KEY and BINANCE_${mode === "live" ? "LIVE" : "DEMO"}_SECRET in Supabase secrets.`);
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  if (signed) {
    q.set("recvWindow", "5000");
    q.set("timestamp", String(Date.now()));
    q.set("signature", await hmac(c.s, q.toString()));
  }
  const r = await fetch(`${BN_BASE[mode]}${path}?${q}`, { method, headers: signed ? { "X-MBX-APIKEY": c.k } : {} });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { msg: text.slice(0, 200) };
  }
  if (!r.ok || typeof j?.code === "number" && j.code < 0) {
    const code = j?.code ?? r.status, msg = j?.msg ?? text;
    if (r.status === 451) throw new BnError(code, "Binance refused this server's location.");
    if (code === -2015 || code === -2014) throw new BnError(code, "Binance rejected the API key (check Enable Futures, and that demo keys come from demo.binance.com).");
    if (code === -2019) throw new BnError(code, "Not enough margin in your Binance futures wallet.");
    throw new BnError(code, `Binance: ${msg} (${code})`);
  }
  return j;
}
const bnInfo = {};
async function bnSymbols(mode) {
  let c = bnInfo[mode];
  if (!c || Date.now() - c.at > 36e5) {
    const j = await bn(mode, "GET", "/fapi/v1/exchangeInfo", {}, false);
    c = { at: Date.now(), syms: new Map(j.symbols.filter((s) => s.status === "TRADING" && (s.contractType === "PERPETUAL" || s.contractType === "TRADIFI_PERPETUAL") && s.quoteAsset === "USDT").map((s) => [s.symbol, s])) };
    bnInfo[mode] = c;
  }
  return c.syms;
}
const BN_MAP = {
  "GC=F": "XAUUSDT",
  "SI=F": "XAGUSDT",
  "PL=F": "XPTUSDT",
  "PA=F": "XPDUSDT",
  "CL=F": "CLUSDT",
  "BZ=F": "BZUSDT",
  "NG=F": "NATGASUSDT",
  "HG=F": "COPPERUSDT",
  "^GSPC": "SPYUSDT",
  "^NDX": "QQQUSDT",
  "^IXIC": "QQQUSDT",
  "^RUT": "IWMUSDT",
  "BRK-B": "BRKBUSDT"
};
function bnSymbolFor(id, syms) {
  const [src, s] = id.split(":");
  if (src === "crypto") {
    const base = s.replace(/USDT$/, "");
    for (const c2 of [`${base}USDT`, `1000${base}USDT`]) {
      const x2 = syms.get(c2);
      if (x2 && (x2.underlyingType ?? "COIN") === "COIN") return c2;
    }
    return null;
  }
  const c = BN_MAP[s] ?? (/^[A-Z]{1,5}$/.test(s) ? `${s}USDT` : null);
  const x = c ? syms.get(c) : null;
  return x && x.underlyingType && x.underlyingType !== "COIN" ? c : null;
}
function bnRules(sym, syms) {
  const s = syms.get(sym);
  const f = (t) => s.filters.find((x) => x.filterType === t) ?? {};
  return { sym, tick: Number(f("PRICE_FILTER").tickSize), step: Number(f("MARKET_LOT_SIZE").stepSize) || Number(f("LOT_SIZE").stepSize), minQty: Number(f("LOT_SIZE").minQty), minNotional: Number(f("MIN_NOTIONAL").notional ?? 5) };
}
const dec = (x) => {
  const s = String(x);
  return s.includes("e-") ? Number(s.split("e-")[1]) : (s.split(".")[1] ?? "").replace(/0+$/, "").length;
};
const floorTo = (x, step) => (Math.floor(x / step + 1e-9) * step).toFixed(dec(step));
const roundTo = (x, tick) => (Math.round(x / tick) * tick).toFixed(dec(tick));
const bnMark = async (mode, sym) => Number((await bn(mode, "GET", "/fapi/v1/premiumIndex", { symbol: sym }, false)).markPrice);
async function bnProtect(mode, sym, long, stop, t2, tick) {
  const exit = long ? "SELL" : "BUY";
  await bn(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "STOP_MARKET", triggerPrice: roundTo(stop, tick), closePosition: true, workingType: "MARK_PRICE", priceProtect: true });
  if (t2 !== null) await bn(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t2, tick), closePosition: true, workingType: "MARK_PRICE" });
}
async function bnRealized(mode, sym, sinceMs) {
  const trades = await bn(mode, "GET", "/fapi/v1/userTrades", { symbol: sym, startTime: Math.max(sinceMs - 6e4, Date.now() - 6.9 * 864e5), limit: 1e3 });
  return trades.reduce((a, t) => a + Number(t.realizedPnl) - (t.commissionAsset === "USDT" ? Number(t.commission) : 0), 0);
}
async function bnClose(mode, sym) {
  await bn(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {
  });
  const p = (await bn(mode, "GET", "/fapi/v3/positionRisk", { symbol: sym })).find((x) => Number(x.positionAmt) !== 0);
  if (!p) return null;
  const amt = Number(p.positionAmt);
  const res = await bn(mode, "POST", "/fapi/v1/order", { symbol: sym, side: amt > 0 ? "SELL" : "BUY", type: "MARKET", quantity: String(Math.abs(amt)), reduceOnly: true, newOrderRespType: "RESULT" });
  return Number(res.avgPrice);
}
const DV_MAP = {
  "GC=F": ["frxXAUUSD"],
  "SI=F": ["frxXAGUSD"],
  "PL=F": ["frxXPTUSD"],
  "PA=F": ["frxXPDUSD"],
  "CL=F": ["WTI_OIL", "frxUSOIL"],
  "BZ=F": ["BRENT_OIL", "frxUKOIL"],
  "^GSPC": ["OTC_SPC"],
  SPY: ["OTC_SPC"],
  "^NDX": ["OTC_NDX"],
  QQQ: ["OTC_NDX"],
  "^IXIC": ["OTC_NDX"],
  "^DJI": ["OTC_DJI"],
  DIA: ["OTC_DJI"],
  "^FTSE": ["OTC_FTSE"],
  "^GDAXI": ["OTC_GDAXI"],
  "^N225": ["OTC_N225"],
  "^HSI": ["OTC_HSI"],
  "^FCHI": ["OTC_FCHI"],
  "^AXJO": ["OTC_AS51"],
  "^STOXX50E": ["OTC_SX5E"],
  "^SSMI": ["OTC_SSMI"]
};
function derivCandidates(id) {
  const [src, s] = id.split(":");
  if (src === "crypto") return ["cry" + s.replace(/USDT$/, "") + "USD"];
  if (s.endsWith("=X")) return ["frx" + s.replace("=X", "")];
  return DV_MAP[s] ?? [];
}
class Deriv {
  ws;
  n = 1;
  pending = /* @__PURE__ */ new Map();
  account = { currency: "USD" };
  static connected() {
    return !!(Deno.env.get("DERIV_APP_ID") && Deno.env.get("DERIV_TOKEN"));
  }
  async connect(url) {
    this.ws = new WebSocket(url);
    await new Promise((ok, no) => {
      const t = setTimeout(() => no(new UserError("Deriv connection timed out.")), 12e3);
      this.ws.onopen = () => {
        clearTimeout(t);
        ok();
      };
      this.ws.onerror = () => {
        clearTimeout(t);
        no(new UserError("Deriv connection failed."));
      };
    });
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      const p = this.pending.get(m.req_id);
      if (!p) return;
      this.pending.delete(m.req_id);
      m.error ? p.no(new UserError(`Deriv: ${m.error.message}`)) : p.ok(m);
    };
  }
  static async publicSession() {
    const d = new Deriv();
    await d.connect("wss://api.derivws.com/trading/v1/options/ws/public");
    return d;
  }
  static async open(mode) {
    const app = Deno.env.get("DERIV_APP_ID"), tok = Deno.env.get("DERIV_TOKEN");
    if (!app || !tok) throw new UserError("Deriv is not connected: add DERIV_APP_ID and DERIV_TOKEN in Supabase secrets.");
    const h = { Authorization: `Bearer ${tok}`, "Deriv-App-ID": app, "Content-Type": "application/json" };
    const r = await fetch("https://api.derivws.com/trading/v1/options/accounts", { headers: h });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new UserError(r.status === 401 || r.status === 403 ? "Deriv rejected the token. Make sure it has the 'trade' scope and that DERIV_APP_ID is the app it was made for." : `Deriv accounts request failed (${r.status}).`);
    const list = Array.isArray(j.data) ? j.data : j.data ? [j.data] : [];
    const account = list.find((a) => a.account_type === (mode === "live" ? "real" : "demo") && a.status !== "disabled");
    if (!account) throw new UserError(mode === "live" ? "No real Deriv Options account was found. Open one in Deriv (Trader's Hub) first." : "No Deriv demo account was found.");
    const o = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${account.account_id}/otp`, { method: "POST", headers: h });
    const oj = await o.json().catch(() => ({}));
    if (!o.ok || !oj?.data?.url) throw new UserError(`Deriv would not open a trading session (${o.status}).`);
    const d = new Deriv();
    d.account = account;
    await d.connect(oj.data.url);
    return d;
  }
  send(msg) {
    const req_id = this.n++;
    return new Promise((ok, no) => {
      const t = setTimeout(() => {
        this.pending.delete(req_id);
        no(new UserError("Deriv did not answer in time."));
      }, 15e3);
      this.pending.set(req_id, { ok: (v) => {
        clearTimeout(t);
        ok(v);
      }, no: (e) => {
        clearTimeout(t);
        no(e);
      } });
      this.ws.send(JSON.stringify({ ...msg, req_id }));
    });
  }
  close() {
    try {
      this.ws.close();
    } catch {
    }
  }
  async multipliers(sym) {
    try {
      const m = await this.send({ contracts_for: sym, currency: this.account.currency ?? "USD" });
      const c = (m.contracts_for?.available ?? []).find((x) => x.contract_type === "MULTUP");
      return c ? (c.multiplier_range ?? []).map(Number).sort((a, b) => a - b) : null;
    } catch {
      return null;
    }
  }
  async spot(sym) {
    try {
      const m = await this.send({ ticks_history: sym, end: "latest", count: 1, style: "ticks" });
      return Number(m.history?.prices?.[0]) || null;
    } catch {
      return null;
    }
  }
  poc(id) {
    return this.send({ proposal_open_contract: 1, contract_id: id }).then((m) => m.proposal_open_contract);
  }
}
let dvActive = null;
async function derivActive(d) {
  if (dvActive && Date.now() - dvActive.at < 36e5) return dvActive;
  const m = await d.send({ active_symbols: "brief", contract_type: ["MULTUP"] });
  const all = new Map((m.active_symbols ?? []).map((s) => [s.underlying_symbol, s]));
  dvActive = { at: Date.now(), all, open: new Set([...all.values()].filter((s) => s.exchange_is_open && !s.is_trading_suspended).map((s) => s.underlying_symbol)) };
  return dvActive;
}
const dvSymbolFor = (id, act) => derivCandidates(id).find((c) => act.all.has(c)) ?? null;
function readCfg(b) {
  const broker = b.broker === "deriv" ? "deriv" : b.broker === "both" ? "both" : "binance";
  const alloc = ["each", "equal", "score", "custom"].includes(b.alloc) ? b.alloc : "equal";
  const custom = b.custom && typeof b.custom === "object" ? Object.fromEntries(Object.entries(b.custom).map(([k, v]) => [String(k), Math.max(0, Number(v))]).filter(([, v]) => Number(v) > 0)) : null;
  const cfg = { broker, mode: b.mode === "live" ? "live" : "demo", amount: Number(b.amount), count: Math.min(20, Math.max(1, Math.round(Number(b.count) || 1))), horizon: String(b.horizon), strict: Math.min(100, Math.max(65, Math.round(Number(b.strict) || 75))), risk: String(b.risk), alloc, custom, fallback: b.fallback !== false };
  if (!(cfg.amount > 0)) throw new UserError("Enter how much to invest.");
  if (!HORIZONS[cfg.horizon]) throw new UserError("Pick a time window.");
  if (!RISK[cfg.risk]) cfg.risk = "balanced";
  return cfg;
}
const totalOf = (c) => c.alloc === "each" ? c.amount * c.count : c.alloc === "custom" && c.custom ? Math.max(c.amount, Object.values(c.custom).reduce((a, x) => a + x, 0)) : c.amount;
function fresh(r, now) {
  const h = TF_H[r.tf];
  if (now - Date.parse(r.scanned_at) > Math.max(45 * 6e4, 2 * h * 36e5)) return false;
  const quiet = r.tf === "1M" ? 40 * 86400 : r.tf === "1w" ? 10 * 86400 : r.tf === "1d" ? 4 * 86400 : 3 * h * 3600 + 20 * 60;
  return now / 1e3 - r.candle_t <= quiet;
}
async function newsView(r) {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/viko-news`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: r.symbol, name: r.label, market: r.market, tf: r.tf, technical: { verdict: r.verdict, dir: r.dir, score: r.score, setup: r.setup?.name ?? "", price: r.price } }) });
    const j = await res.json();
    return { stance: j?.opinion?.stance, text: String(j?.opinion?.text ?? "").slice(0, 400) };
  } catch {
    return { stance: void 0, text: "" };
  }
}
async function venues(cfg, d) {
  const v = {};
  if (cfg.broker !== "deriv") v.bn = await bnSymbols(cfg.mode).catch(() => /* @__PURE__ */ new Map());
  if (cfg.broker !== "binance" && d) v.dv = await derivActive(d).catch(() => ({ all: /* @__PURE__ */ new Map(), open: /* @__PURE__ */ new Set() }));
  return v;
}
function route(id, cfg, v) {
  if (cfg.broker !== "deriv" && v.bn) {
    const s = bnSymbolFor(id, v.bn);
    if (s) return { broker: "binance", sym: s };
  }
  if (cfg.broker !== "binance" && v.dv) {
    const s = dvSymbolFor(id, v.dv);
    if (s && v.dv.open.has(s)) return { broker: "deriv", sym: s };
  }
  return null;
}
async function candidates(db, cfg, v, exclude, want) {
  const hz = HORIZONS[cfg.horizon];
  const now = Date.now();
  const { data } = await db.from("viko_picks").select("symbol,tf,label,market,price,candle_t,scanned_at,verdict,dir,score,hard_fail,triggered,rr1,setup,news_warn").gt("scanned_at", new Date(now - 3 * 36e5 - (hz.h > 100 ? 4 * 864e5 : 0)).toISOString());
  const rows = (data ?? []).filter((r) => fresh(r, now) && r.setup);
  const by = /* @__PURE__ */ new Map();
  for (const r of rows) by.set(r.symbol, [...by.get(r.symbol) ?? [], r]);
  const lean = (r) => r.setup && !r.hard_fail && (r.score ?? 0) >= 55 ? r.dir : null;
  const atBar = (r) => (r.score ?? 0) >= cfg.strict && (r.verdict === "APPROVED" || cfg.strict < 80 && r.verdict === "WATCH" && r.triggered && !r.hard_fail && (r.rr1 ?? 0) >= 2);
  const nearBar = (r) => !atBar(r) && (r.score ?? 0) >= 55 && !r.hard_fail && r.triggered && (r.rr1 ?? 0) >= 1.5 && r.verdict !== "NO TRADE";
  const fitsTime = (r) => hz.tfs.includes(r.tf) && (r.setup.expectBars ?? 3) * TF_H[r.tf] * 0.6 <= hz.h;
  const newsSoon = (r) => {
    const m = String(r.news_warn ?? "").match(/is due (\S+)$/);
    const at = m ? Date.parse(m[1]) : NaN;
    return !!r.news_warn && (!Number.isFinite(at) || at > now && at - now <= 3 * 36e5);
  };
  const ok = (r) => !newsSoon(r) && !exclude.has(r.symbol);
  const s1 = rows.filter(atBar), s2 = s1.filter(fitsTime), s3 = s2.filter((r) => route(r.symbol, cfg, v)), s4 = s3.filter(ok);
  const u = (a) => new Set(a.map((r) => r.symbol)).size;
  const diag = { quality: u(s1), time: u(s2), broker: u(s3), news: u(s4), opinionDropped: 0, near: 0, examples: [...new Map(s1.map((r) => [r.symbol, `${r.label} ${r.tf} (${r.score}%)`])).values()].slice(0, 6) };
  const rank = (r) => {
    const others = (by.get(r.symbol) ?? []).filter((x) => x.tf !== r.tf && ALL_TFS.includes(x.tf));
    const agree = others.filter((x) => lean(x) === r.dir).length, against = others.filter((x) => lean(x) && lean(x) !== r.dir).length;
    return { ...r, agree, against, venue: route(r.symbol, cfg, v), rank: r.score + 4 * agree - 8 * against + Math.min(4, r.rr1 ?? 0) * 2 };
  };
  const main = s4.map(rank).filter((r) => r.against < 3).sort((a, b) => b.rank - a.rank);
  const near = cfg.fallback ? rows.filter((r) => nearBar(r) && fitsTime(r) && route(r.symbol, cfg, v) && ok(r)).map((r) => ({ ...rank(r), below: true })).filter((r) => r.against < 3).sort((a, b) => b.rank - a.rank) : [];
  const seen = /* @__PURE__ */ new Set(), out = [];
  const take = async (pool) => {
    const fresh2 = pool.filter((r) => !seen.has(r.symbol) && (seen.add(r.symbol), true));
    for (let i = 0; i < fresh2.length && out.length < want; i += 5) {
      const batch = fresh2.slice(i, i + 5);
      const views = await Promise.all(batch.map(newsView));
      batch.forEach((r, j) => {
        if (out.length >= want) return;
        const nv = views[j];
        if (nv.stance === "bullish" && r.dir === "short" || nv.stance === "bearish" && r.dir === "long") {
          diag.opinionDropped++;
          return;
        }
        out.push({ ...r, opinion: nv.text, stance: nv.stance ?? "neutral" });
        if (r.below) diag.near++;
      });
    }
  };
  await take(main);
  if (out.length < want) await take(near);
  return Object.assign(out, { diag });
}
async function size(cfg, r, d, v) {
  const s = r.setup, long = r.dir === "long", target = RISK[cfg.risk];
  const venue = r.venue;
  const src = await sourcePrice(r.symbol) ?? r.price;
  let live;
  if (venue.broker === "binance") live = await bnMark(cfg.mode, venue.sym).catch(() => null);
  else live = d ? await d.spot(venue.sym) : null;
  if (!live) return { skip: `${r.label}: no live price from ${brokerName(venue.broker)}.` };
  const k = live / src;
  const stop = s.stop * k, t1 = s.target1 * k, t2 = s.target2 * k;
  if (!(long ? stop < live && t1 > live : stop > live && t1 < live)) return { skip: `${r.label} has already moved past its stop or first target.` };
  const stopPct = Math.abs(live - stop) / live;
  let lev;
  if (venue.broker === "binance") {
    const maxLev = Number(v.bn?.get(venue.sym)?.maxLeverage ?? 10) || 10;
    lev = Math.max(1, Math.min(cfg.risk === "max" ? 20 : 10, maxLev, Math.floor(target / stopPct)));
    if (lev * stopPct >= 0.8) lev = Math.floor(0.7 / stopPct);
    if (lev < 1) return { skip: `${r.label}'s stop-loss is too far away to trade safely.` };
  } else {
    const mults = d ? await d.multipliers(venue.sym) : null;
    if (!mults?.length) return { skip: `${r.label} can't be traded with multipliers on Deriv right now.` };
    const fit = mults.filter((m) => m * stopPct <= target * 1.25);
    lev = fit.length ? fit[fit.length - 1] : mults[0];
    if (lev * stopPct > 0.9) return { skip: `${r.label}'s stop-loss is too far for Deriv's smallest multiplier (${mults[0]}x).` };
  }
  return { broker: venue.broker, sym: venue.sym, live, k, stop, t1, t2, stopPct, lev, t1Pct: Math.abs(t1 - live) / live, t2Pct: Math.abs(t2 - live) / live };
}
function allocate(cfg, trades) {
  const n = trades.length;
  if (!n) return;
  if (cfg.alloc === "each") trades.forEach((t) => t.money = r2(cfg.amount));
  else if (cfg.alloc === "custom") trades.forEach((t) => t.money = r2(cfg.custom?.[t.symbol] ?? cfg.amount / cfg.count));
  else if (cfg.alloc === "score") {
    const w = trades.map((t) => Math.max(5, t.score - 50 + (t.agree ?? 0) * 2));
    const sum = w.reduce((a, x) => a + x, 0);
    trades.forEach((t, i) => t.money = r2(cfg.amount * (n / cfg.count) * w[i] / sum));
  } else trades.forEach((t) => t.money = r2(cfg.amount / cfg.count));
}
async function preview(db, cfg, exclude, want, d) {
  const v = await venues(cfg, d);
  const picks = await candidates(db, cfg, v, exclude, want + 4);
  const diag = picks.diag;
  const trades = [], skipped = [];
  for (const r of picks) {
    if (trades.length >= want) break;
    const z = await size(cfg, r, d, v).catch((e) => ({ skip: `${r.label}: ${e.message}` }));
    if (z.skip) {
      skipped.push(z.skip);
      continue;
    }
    trades.push({
      symbol: r.symbol,
      label: r.label,
      market: r.market,
      tf: r.tf,
      dir: r.dir,
      score: r.score,
      agree: r.agree,
      against: r.against,
      below: !!r.below,
      opinion: r.opinion,
      stance: r.stance,
      setup: `${r.setup.name} (${r.setup.degree})`,
      broker: z.broker,
      brokerSymbol: z.sym,
      entry: z.live,
      stop: z.stop,
      target1: z.t1,
      target2: z.t2,
      leverage: z.lev,
      hours: [r2((r.setup.expectBars ?? 3) * TF_H[r.tf] * 0.6), r2((r.setup.expectBars ?? 3) * TF_H[r.tf] * 1.6)],
      _z: z
    });
  }
  allocate(cfg, trades);
  for (const t of trades) {
    const pos = t.money * t.leverage;
    Object.assign(t, { loss: r2(pos * t._z.stopPct), profit1: r2(pos / 2 * t._z.t1Pct), profit2: r2(pos / 2 * t._z.t1Pct + pos / 2 * t._z.t2Pct) });
    if (t.broker === "binance") {
      const rules = bnRules(t.brokerSymbol, v.bn);
      if (pos < rules.minNotional) {
        t.tooSmall = `Binance needs at least ${Math.ceil(rules.minNotional / t.leverage)} USDT on ${t.label} at ${t.leverage}x.`;
      }
      t._rules = rules;
    } else if (t.money < 1) t.tooSmall = "Deriv needs at least 1 USD per trade.";
  }
  const ok = trades.filter((t) => !t.tooSmall);
  skipped.push(...trades.filter((t) => t.tooSmall).map((t) => t.tooSmall));
  return { trades: ok, skipped, horizon: HORIZONS[cfg.horizon].name, total: totalOf(cfg), diag, venues: { binance: v.bn ? v.bn.size : null, deriv: v.dv ? v.dv.open.size : null } };
}
async function place(db, cfg, plan_id, t, d) {
  const long = t.dir === "long";
  const base = { plan_id, broker: t.broker, mode: cfg.mode, symbol: t.symbol, label: `${t.label}`, tf: t.tf, dir: t.dir, setup: t.setup, score: t.score, opinion: t.opinion, stake: t.money, leverage: t.leverage, stop: t.stop, initial_stop: t.stop, target1: t.target1, target2: t.target2, below_bar: !!t.below };
  if (t.broker === "binance") {
    const rules = t._rules, sym2 = rules.sym;
    await bn(cfg.mode, "POST", "/fapi/v1/marginType", { symbol: sym2, marginType: "ISOLATED" }).catch((e) => {
      if (!(e instanceof BnError) || e.code !== -4046) throw e;
    });
    await bn(cfg.mode, "POST", "/fapi/v1/leverage", { symbol: sym2, leverage: t.leverage });
    const mark = await bnMark(cfg.mode, sym2);
    const qty = floorTo(t.money * t.leverage / mark, rules.step);
    if (Number(qty) < rules.minQty) throw new UserError(`${t.label}: the amount is below Binance's minimum size.`);
    const filled = await bn(cfg.mode, "POST", "/fapi/v1/order", { symbol: sym2, side: long ? "BUY" : "SELL", type: "MARKET", quantity: qty, newOrderRespType: "RESULT" });
    const entry2 = Number(filled.avgPrice) || mark;
    try {
      await bnProtect(cfg.mode, sym2, long, t.stop, null, rules.tick);
    } catch (e) {
      await bnClose(cfg.mode, sym2).catch(() => {
      });
      throw new UserError(`${t.label}: Binance refused the stop-loss, so the trade was closed straight away. ${e.message}`);
    }
    const half = floorTo(Number(qty) / 2, rules.step), exit = long ? "SELL" : "BUY";
    if (Number(half) >= rules.minQty) await bn(cfg.mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym2, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t.target1, rules.tick), quantity: half, reduceOnly: true, workingType: "MARK_PRICE" }).catch(() => {
    });
    await bn(cfg.mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym2, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t.target2, rules.tick), closePosition: true, workingType: "MARK_PRICE" }).catch(() => {
    });
    const { data: data2 } = await db.from("viko_auto_positions").insert({ ...base, broker_symbol: sym2, entry: entry2, qty: Number(qty), refs: { scale: 1, tick: rules.tick, step: rules.step, opened_ms: Date.now() }, last_price: entry2, last_pnl: 0 }).select().single();
    await event(db, plan_id, data2.id, `${long ? "Bought" : "Sold"} ${t.label} (${sym2}) on Binance at ${fmt(entry2)} with ${t.money} USDT at ${t.leverage}x. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} and ${fmt(t.target2)}.${t.below ? " Below your bar: filling an empty slot." : ""}`);
    return;
  }
  const { sym, stopPct, t1Pct, t2Pct } = t._z;
  const ctype = long ? "MULTUP" : "MULTDOWN";
  const parts = t.money >= 2 ? [{ role: "t1", stake: r2(t.money / 2), tp: t1Pct }, { role: "t2", stake: r2(t.money - r2(t.money / 2)), tp: t2Pct }] : [{ role: "t1", stake: t.money, tp: t1Pct }];
  const refs = [];
  for (const p of parts) {
    const sl = Math.min(r2(p.stake * t.leverage * stopPct), r2(p.stake * 0.95));
    const tp = Math.max(0.01, r2(p.stake * t.leverage * p.tp));
    try {
      const m = await d.send({ buy: "1", price: p.stake, parameters: { amount: p.stake, basis: "stake", contract_type: ctype, currency: d.account.currency ?? "USD", underlying_symbol: sym, multiplier: t.leverage, limit_order: { stop_loss: Math.max(0.01, sl), take_profit: tp } } });
      refs.push({ id: m.buy.contract_id, role: p.role, stake: p.stake });
    } catch (e) {
      for (const r of refs) await d.send({ sell: r.id, price: 0 }).catch(() => {
      });
      throw new UserError(`${t.label}: ${e.message}`);
    }
  }
  const first = await d.poc(refs[0].id).catch(() => null);
  const entry = Number(first?.entry_spot ?? first?.entry_tick ?? t.entry);
  const { data } = await db.from("viko_auto_positions").insert({ ...base, broker_symbol: sym, entry, refs: { contracts: refs, account: d.account.account_id }, last_price: entry, last_pnl: 0 }).select().single();
  await event(db, plan_id, data.id, `${long ? "Bought (Up)" : "Sold (Down)"} ${t.label} (${sym}) on Deriv with ${t.money} USD at x${t.leverage}. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} and ${fmt(t.target2)}.${t.below ? " Below your bar: filling an empty slot." : ""}`);
}
function planCfg(plan) {
  return { broker: plan.broker, mode: plan.mode, amount: plan.amount, count: plan.count, horizon: plan.horizon, strict: plan.strict, risk: plan.risk, alloc: plan.alloc ?? "equal", custom: plan.custom ?? null, fallback: plan.fallback ?? true };
}
function usableBrokers(cfg) {
  const want = cfg.broker === "both" ? ["binance", "deriv"] : [cfg.broker];
  return want.filter((b) => b === "binance" ? !!bnCreds(cfg.mode) : Deriv.connected());
}
async function fill(db, plan, d) {
  const cfg = planCfg(plan);
  const usable = usableBrokers(cfg);
  if (!usable.length) return 0;
  const eff = { ...cfg, broker: usable.length === 2 ? "both" : usable[0] };
  const { data: mine } = await db.from("viko_auto_positions").select("symbol").eq("plan_id", plan.id);
  const { data: openAll } = await db.from("viko_auto_positions").select("symbol").eq("status", "open").eq("mode", plan.mode);
  const slots = plan.count - (mine ?? []).length;
  if (slots <= 0) return 0;
  const exclude = new Set([...mine ?? [], ...openAll ?? []].map((x) => String(x.symbol)));
  const pv = await preview(db, eff, exclude, slots, d);
  let placed = 0;
  for (const t of pv.trades) {
    try {
      await place(db, eff, plan.id, t, d);
      placed++;
    } catch (e) {
      await event(db, plan.id, null, e.message);
    }
  }
  return placed;
}
async function manageBinance(db, p, endNow, why = "time") {
  const mode = p.mode, sym = p.broker_symbol, sc = p.refs?.scale ?? 1, tick = p.refs?.tick ?? 1e-4, long = p.dir === "long";
  const since = p.refs?.opened_ms ?? Date.parse(p.opened_at);
  const pos = (await bn(mode, "GET", "/fapi/v3/positionRisk", { symbol: sym })).find((x) => Number(x.positionAmt) !== 0);
  if (!pos || endNow) {
    let exit = p.last_price;
    if (pos) exit = (await bnClose(mode, sym) ?? p.last_price * sc) / sc;
    await bn(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {
    });
    const pnl = await bnRealized(mode, sym, since).catch(() => p.last_pnl ?? 0);
    const reason = pos ? why : Math.abs(exit - p.stop) < Math.abs(exit - p.target2) ? p.t1_hit ? "stop at entry" : "stop" : "target 2";
    await db.from("viko_auto_positions").update({ status: "closed", closed_at: (/* @__PURE__ */ new Date()).toISOString(), pnl: r2(pnl), close_reason: reason, last_price: exit, last_pnl: r2(pnl), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.id);
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${pnl >= 0 ? "+" : ""}${r2(pnl)} USDT.`);
    return;
  }
  const amt = Math.abs(Number(pos.positionAmt)), mark = Number(pos.markPrice) / sc;
  const realized = p.t1_hit ? await bnRealized(mode, sym, since).catch(() => 0) : 0;
  const patch = { last_price: mark, last_pnl: r2(Number(pos.unRealizedProfit) + realized), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  const algos = await bn(mode, "GET", "/fapi/v1/openAlgoOrders", { symbol: sym }).catch(() => []);
  const hasStop = algos.some((o) => o.orderType === "STOP_MARKET");
  const prog = (long ? mark - p.entry : p.entry - mark) / Math.abs(p.target2 - p.entry);
  let newStop = null, msg = "";
  if (!p.t1_hit && amt <= p.qty * 0.75) {
    patch.t1_hit = true;
    newStop = p.entry;
    msg = `${p.label}: target 1 hit, half taken as profit. Stop moved to the entry price, so the rest can't lose.`;
  } else if (p.t1_hit && prog >= 0.6 && (long ? p.stop < p.target1 : p.stop > p.target1)) {
    newStop = p.target1;
    msg = `${p.label}: well on the way to target 2. Stop raised to target 1 to lock in profit.`;
  }
  if (newStop !== null || !hasStop) {
    const st = newStop ?? p.stop;
    await bn(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {
    });
    await bnProtect(mode, sym, long, st * sc, p.target2 * sc, tick);
    patch.stop = st;
    await event(db, p.plan_id, p.id, msg || `${p.label}: the stop-loss was missing on Binance, so Viko put it back at ${fmt(st)}.`);
  }
  await db.from("viko_auto_positions").update(patch).eq("id", p.id);
}
async function manageDeriv(db, p, d, endNow, why = "time") {
  const cons = p.refs?.contracts ?? [];
  let total = 0, allSold = true, spot = p.last_price;
  const states = [];
  for (const c of cons) {
    let s = await d.poc(c.id).catch(() => null);
    if (s && !s.is_sold && endNow) {
      await d.send({ sell: c.id, price: 0 }).catch(() => {
      });
      s = await d.poc(c.id).catch(() => s);
    }
    states.push({ c, s });
    if (s) {
      total += Number(s.profit ?? 0);
      spot = Number(s.current_spot ?? spot);
      if (!s.is_sold) allSold = false;
    }
  }
  const patch = { last_price: spot, last_pnl: r2(total), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  const t1 = states.find((x) => x.c.role === "t1"), t2 = states.find((x) => x.c.role === "t2");
  if (!p.t1_hit && t1?.s?.is_sold && Number(t1.s.profit) > 0) {
    patch.t1_hit = true;
    patch.stop = p.entry;
    if (t2?.s && !t2.s.is_sold) {
      const ok = await d.send({ contract_update: 1, contract_id: t2.c.id, limit_order: { stop_loss: Math.max(0.1, r2(t2.c.stake * 0.02)) } }).then(() => true, () => false);
      await event(db, p.plan_id, p.id, ok ? `${p.label}: target 1 hit, half taken as profit. The rest now risks almost nothing.` : `${p.label}: target 1 hit, half taken as profit.`);
    } else await event(db, p.plan_id, p.id, `${p.label}: target 1 hit.`);
  }
  if (allSold) {
    const reason = endNow ? why : total > 0 ? t2?.s && Number(t2.s.profit) > 0 ? "target 2" : "target 1" : "stop";
    Object.assign(patch, { status: "closed", closed_at: (/* @__PURE__ */ new Date()).toISOString(), pnl: r2(total), close_reason: reason });
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${total >= 0 ? "+" : ""}${r2(total)} USD.`);
  }
  await db.from("viko_auto_positions").update(patch).eq("id", p.id);
}
async function manageAll(db, opts) {
  let q = db.from("viko_auto_plans").select("*").eq("status", "active");
  if (opts.onlyPlan) q = q.eq("id", opts.onlyPlan);
  const { data: plans } = await q;
  const sessions = /* @__PURE__ */ new Map();
  const deriv = async (mode) => {
    if (!sessions.has(mode)) sessions.set(mode, await Deriv.open(mode));
    return sessions.get(mode);
  };
  const errors = [];
  try {
    for (const plan of plans ?? []) {
      const ending = Date.now() >= Date.parse(plan.ends_at) || opts.endPlan === plan.id;
      const { data: pos } = await db.from("viko_auto_positions").select("*").eq("plan_id", plan.id).eq("status", "open");
      for (const p of pos ?? []) {
        const end = ending || opts.endPosition === p.id;
        const why = opts.endPlan === plan.id || opts.endPosition === p.id ? "collected by you" : "time window ended";
        try {
          p.broker === "binance" ? await manageBinance(db, p, end, why) : await manageDeriv(db, p, await deriv(p.mode), end, why);
        } catch (e) {
          errors.push(`${p.label}: ${e.message}`);
        }
      }
      if (ending) {
        await db.from("viko_auto_plans").update({ status: opts.endPlan === plan.id ? "stopped" : "done", closed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", plan.id);
        await event(db, plan.id, null, opts.endPlan === plan.id ? "You collected this plan. All its trades are closed." : `The ${HORIZONS[plan.horizon]?.name ?? ""} window has ended. All trades are closed.`);
        continue;
      }
      if (opts.fillPlans && Date.now() < Date.parse(plan.enter_until)) {
        try {
          await fill(db, plan, plan.broker !== "binance" && Deriv.connected() ? await deriv(plan.mode) : null);
        } catch (e) {
          errors.push(e.message);
        }
      }
      const { count: openLeft } = await db.from("viko_auto_positions").select("id", { count: "exact", head: true }).eq("plan_id", plan.id).eq("status", "open");
      const { count: total } = await db.from("viko_auto_positions").select("id", { count: "exact", head: true }).eq("plan_id", plan.id);
      if ((openLeft ?? 0) === 0 && ((total ?? 0) >= plan.count || Date.now() >= Date.parse(plan.enter_until)) && (total ?? 0) > 0) {
        await db.from("viko_auto_plans").update({ status: "done", closed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", plan.id);
        await event(db, plan.id, null, "Every trade in this plan has finished.");
      }
    }
  } finally {
    for (const s of sessions.values()) s.close();
  }
  return errors;
}
async function keyOk(req, db, k) {
  const given = req.headers.get("x-viko-key");
  if (!given) return false;
  const h = await sha(given);
  const { data } = await db.from("viko_config").select("v").eq("k", k);
  return (data ?? []).some((r) => r.v === h);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const url = new URL(req.url);
  const rt = url.pathname.split("/").filter(Boolean).pop();
  try {
    if (rt === "markets") {
      const { data } = await db.from("viko_picks").select("symbol,market").eq("tf", "1d");
      const ids = [...new Set((data ?? []).map((r) => String(r.symbol)))];
      const out = { total: ids.length };
      for (const mode of ["demo", "live"]) {
        const syms = await bnSymbols(mode).catch(() => /* @__PURE__ */ new Map());
        out[`binance_${mode}`] = ids.filter((id) => bnSymbolFor(id, syms)).length;
      }
      const d = await Deriv.publicSession().catch(() => null);
      if (d) {
        const act = await derivActive(d).catch(() => null);
        d.close();
        if (act) {
          out.deriv = ids.filter((id) => dvSymbolFor(id, act)).length;
          out.deriv_symbols = act.all.size;
          out.deriv_list = [...act.all.keys()].slice(0, 200);
        }
      }
      return json(out);
    }
    if (rt === "manage") {
      if (!await keyOk(req, db, "cron_key")) return json({ error: "unauthorised" }, 401);
      return json({ ok: true, errors: await manageAll(db, { fillPlans: true }) });
    }
    if (!await keyOk(req, db, "journal_key")) return json({ error: "Your app key is missing or wrong. Add it in Settings." }, 401);
    if (rt === "state") {
      if (url.searchParams.get("refresh")) await manageAll(db, { fillPlans: false }).catch(() => []);
      const { data: plans } = await db.from("viko_auto_plans").select("*").order("created_at", { ascending: false }).limit(20);
      const ids = (plans ?? []).map((p) => p.id);
      const { data: positions } = ids.length ? await db.from("viko_auto_positions").select("*").in("plan_id", ids).order("opened_at", { ascending: false }) : { data: [] };
      const { data: events } = await db.from("viko_auto_events").select("*").order("at", { ascending: false }).limit(60);
      return json({ plans, positions, events, now: Date.now() });
    }
    if (rt === "history") {
      const { data } = await db.from("viko_auto_positions").select("id,plan_id,broker,mode,symbol,label,tf,dir,stake,leverage,entry,pnl,close_reason,opened_at,closed_at,score,below_bar").eq("status", "closed").order("closed_at", { ascending: false }).limit(2e3);
      return json({ rows: data });
    }
    if (rt === "connect") {
      const broker = url.searchParams.get("broker") === "deriv" ? "deriv" : "binance";
      const mode = url.searchParams.get("mode") === "live" ? "live" : "demo";
      if (broker === "binance") {
        const acc = await bn(mode, "GET", "/fapi/v3/account");
        return json({ ok: true, broker, mode, balance: Number(acc.availableBalance), currency: "USDT" });
      }
      const d = await Deriv.open(mode);
      d.close();
      return json({ ok: true, broker, mode, balance: Number(d.account.balance ?? 0), currency: d.account.currency ?? "USD", account: d.account.account_id });
    }
    if (rt === "deriv-status") {
      const mode = url.searchParams.get("mode") === "live" ? "live" : "demo";
      const out = { mode, connected: false, keysSet: Deriv.connected() };
      if (!out.keysSet) return json(out);
      const d = await Deriv.open(mode);
      try {
        out.connected = true;
        out.account = d.account.account_id;
        out.currency = d.account.currency ?? "USD";
        out.balance = Number((await d.send({ balance: 1 }).catch(() => null))?.balance?.balance ?? d.account.balance ?? 0);
        const pf = await d.send({ portfolio: 1 }).catch(() => ({ portfolio: { contracts: [] } }));
        const list = (pf.portfolio?.contracts ?? []).filter((c) => /^MULT/.test(c.contract_type ?? ""));
        out.contracts = [];
        for (const c of list.slice(0, 25)) {
          const s = await d.poc(c.contract_id).catch(() => null);
          out.contracts.push({ id: c.contract_id, symbol: c.underlying_symbol ?? c.symbol, type: c.contract_type, stake: Number(c.buy_price), profit: Number(s?.profit ?? 0), spot: Number(s?.current_spot ?? 0), entry: Number(s?.entry_spot ?? 0), multiplier: Number(s?.multiplier ?? 0) });
        }
      } finally {
        d.close();
      }
      return json(out);
    }
    if (req.method !== "POST") return json({ error: "use POST" }, 405);
    const b = await req.json().catch(() => ({}));
    if (rt === "deriv-close") {
      const d = await Deriv.open(b.mode === "live" ? "live" : "demo");
      try {
        const m = await d.send({ sell: Number(b.contract_id), price: 0 });
        return json({ ok: true, sold_for: m.sell?.sold_for });
      } finally {
        d.close();
      }
    }
    if (rt === "preview" || rt === "start") {
      const cfg = readCfg(b);
      const needDeriv = cfg.broker !== "binance";
      let d = null;
      if (needDeriv) d = Deriv.connected() ? await Deriv.open(cfg.mode).catch(async (e) => {
        if (rt === "start") throw e;
        return await Deriv.publicSession().catch(() => null);
      }) : rt === "preview" ? await Deriv.publicSession().catch(() => null) : null;
      try {
        const { data: openAll } = await db.from("viko_auto_positions").select("symbol").eq("status", "open").eq("mode", cfg.mode);
        const exclude = new Set((openAll ?? []).map((x) => String(x.symbol)));
        if (rt === "preview") {
          const pv2 = await preview(db, cfg, exclude, cfg.count, d);
          return json({ ...pv2, connected: { binance: !!bnCreds(cfg.mode), deriv: Deriv.connected() }, trades: pv2.trades.map(({ _z, _rules, ...t }) => t) });
        }
        const usable = usableBrokers(cfg);
        if (!usable.length) throw new UserError(`${brokerName(cfg.broker)} is not connected for ${cfg.mode} yet. Open Brokers and follow the steps.`);
        const eff = { ...cfg, broker: usable.length === 2 ? "both" : usable[0] };
        const pv = await preview(db, eff, exclude, cfg.count, d);
        const need = {};
        for (const t of pv.trades) need[t.broker] = (need[t.broker] ?? 0) + t.money;
        for (const [br, amt] of Object.entries(need)) {
          const bal = br === "binance" ? Number((await bn(cfg.mode, "GET", "/fapi/v3/account")).availableBalance) : Number((await d.send({ balance: 1 }).catch(() => null))?.balance?.balance ?? d.account.balance ?? Infinity);
          if (bal < amt) throw new UserError(`Your ${brokerName(br)} ${cfg.mode} balance is ${r2(bal)}, but these trades need ${r2(amt)}. Lower the amount or top up.`);
        }
        const hz = HORIZONS[cfg.horizon];
        const now = Date.now();
        const { data: plan } = await db.from("viko_auto_plans").insert({ broker: cfg.broker, mode: cfg.mode, amount: cfg.amount, count: cfg.count, horizon: cfg.horizon, strict: cfg.strict, risk: cfg.risk, alloc: cfg.alloc, custom: cfg.custom, fallback: cfg.fallback, total: totalOf(cfg), ends_at: new Date(now + hz.h * 36e5).toISOString(), enter_until: new Date(now + hz.h * 36e5 / 2).toISOString() }).select().single();
        await event(db, plan.id, null, `Plan started on ${brokerName(eff.broker)} (${cfg.mode}): up to ${cfg.count} trade${cfg.count > 1 ? "s" : ""}, ${r2(totalOf(cfg))} in total, ${hz.name}, ${cfg.strict}%+${cfg.fallback ? " (empty slots may use the best setups below the bar)" : " only"}.`);
        let placed = 0;
        for (const t of pv.trades) {
          try {
            await place(db, eff, plan.id, t, d);
            placed++;
          } catch (e) {
            await event(db, plan.id, null, e.message);
          }
        }
        if (placed < cfg.count) await event(db, plan.id, null, `${placed ? `${placed} placed now.` : "Nothing qualifies right now."} Viko keeps checking every 5 minutes and fills the rest until ${new Date(Date.parse(plan.enter_until)).toUTCString().slice(0, 22)} UTC.`);
        return json({ ok: true, plan_id: plan.id, placed, skipped: pv.skipped });
      } finally {
        d?.close();
      }
    }
    if (rt === "close") {
      if (b.plan_id) return json({ ok: true, errors: await manageAll(db, { fillPlans: false, onlyPlan: String(b.plan_id), endPlan: String(b.plan_id) }) });
      if (b.position_id) {
        const { data: p } = await db.from("viko_auto_positions").select("plan_id").eq("id", b.position_id).single();
        return json({ ok: true, errors: await manageAll(db, { fillPlans: false, onlyPlan: p?.plan_id, endPosition: String(b.position_id) }) });
      }
      return json({ error: "Say which plan or trade to close." }, 400);
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: e.message }, e instanceof UserError || e instanceof BnError ? 400 : 500);
  }
});
