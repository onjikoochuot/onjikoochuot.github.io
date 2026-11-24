// supabase/functions/viko-auto/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// supabase/functions/viko-auto/trail.ts
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

// supabase/functions/viko-auto/index.ts
var BROKERS = ["binance", "bybit", "mt5", "deriv"];
var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
var json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
var UserError = class extends Error {
};
var TF_H = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };
var HORIZONS = {
  "24h": { h: 24, tfs: ["5m", "15m", "30m", "1h", "2h", "4h"], name: "24 hours" },
  "48h": { h: 48, tfs: ["15m", "30m", "1h", "2h", "4h"], name: "48 hours" },
  "72h": { h: 72, tfs: ["30m", "1h", "2h", "4h", "1d"], name: "72 hours" },
  "1w": { h: 168, tfs: ["1h", "2h", "4h", "1d"], name: "1 week" },
  "1m": { h: 720, tfs: ["4h", "1d", "1w"], name: "1 month" }
};
var RISK = { careful: 0.1, balanced: 0.2, bold: 0.35, max: 0.5 };
var ALL_TFS = Object.keys(TF_H);
var UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
var sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
var r2 = (x) => Math.round(x * 100) / 100;
var fmt = (x) => Math.abs(x) >= 1e3 ? x.toFixed(2) : Math.abs(x) >= 1 ? x.toFixed(4) : x.toPrecision(5);
async function event(db, plan_id, position_id, message) {
  await db.from("viko_auto_events").insert({ plan_id, position_id, message });
}
async function alert(db, kind, mode, title, body, pnl = null) {
  await db.from("viko_alerts").insert({ kind, mode, title, body, pnl }).then(() => {
  }, () => {
  });
}
var acct = (mode) => mode === "live" ? "Real money" : "Demo";
var sgn = (x) => `${x >= 0 ? "+" : "\u2212"}${Math.abs(r2(x))}`;
var brokerName = (b) => ({ binance: "Binance", deriv: "Deriv", bybit: "Bybit", mt5: "MT5" })[b] ?? "your connected brokers";
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
var BN_BASE = { demo: "https://demo-fapi.binance.com", live: "https://fapi.binance.com" };
function bnCreds(mode) {
  const k = Deno.env.get(mode === "live" ? "BINANCE_LIVE_KEY" : "BINANCE_DEMO_KEY"), s = Deno.env.get(mode === "live" ? "BINANCE_LIVE_SECRET" : "BINANCE_DEMO_SECRET");
  return k && s ? { k, s } : null;
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
var BnError = class extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
  code;
};
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
var bnInfo = {};
async function bnSymbols(mode) {
  let c = bnInfo[mode];
  if (!c || Date.now() - c.at > 36e5) {
    const j = await bn(mode, "GET", "/fapi/v1/exchangeInfo", {}, false);
    c = { at: Date.now(), syms: new Map(j.symbols.filter((s) => s.status === "TRADING" && (s.contractType === "PERPETUAL" || s.contractType === "TRADIFI_PERPETUAL") && s.quoteAsset === "USDT").map((s) => [s.symbol, s])) };
    bnInfo[mode] = c;
  }
  return c.syms;
}
var BN_MAP = {
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
var dec = (x) => {
  const s = String(x);
  return s.includes("e-") ? Number(s.split("e-")[1]) : (s.split(".")[1] ?? "").replace(/0+$/, "").length;
};
var floorTo = (x, step) => (Math.floor(x / step + 1e-9) * step).toFixed(dec(step));
var roundTo = (x, tick) => (Math.round(x / tick) * tick).toFixed(dec(tick));
var bnMark = async (mode, sym) => Number((await bn(mode, "GET", "/fapi/v1/premiumIndex", { symbol: sym }, false)).markPrice);
async function bnProtect(mode, sym, long, stop, t2, tick) {
  const exit = long ? "SELL" : "BUY";
  await bn(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "STOP_MARKET", triggerPrice: roundTo(stop, tick), closePosition: true, workingType: "MARK_PRICE", priceProtect: true });
  if (t2 !== null) await bn(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t2, tick), closePosition: true, workingType: "MARK_PRICE" });
}
async function bnRealized(mode, sym, sinceMs) {
  const trades = await bn(mode, "GET", "/fapi/v1/userTrades", { symbol: sym, startTime: Math.max(sinceMs - 6e4, Date.now() - 6.9 * 864e5), limit: 1e3 });
  return trades.reduce((a, t) => a + Number(t.realizedPnl) - (t.commissionAsset === "USDT" ? Number(t.commission) : 0), 0);
}
async function bnLastFill(mode, sym, sinceMs) {
  const trades = await bn(mode, "GET", "/fapi/v1/userTrades", { symbol: sym, startTime: Math.max(sinceMs - 6e4, Date.now() - 6.9 * 864e5), limit: 1e3 });
  const last = [...trades].sort((a, b) => Number(a.time ?? 0) - Number(b.time ?? 0)).pop();
  return last ? Number(last.price) : null;
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
var BY_BASE = { demo: "https://api-demo.bybit.com", live: "https://api.bybit.com" };
function byCreds(mode) {
  const M = mode === "live" ? "LIVE" : "DEMO";
  const k = Deno.env.get(`BYBIT_${M}_KEY`), sec = Deno.env.get(`BYBIT_${M}_SECRET`);
  return k && sec ? { k, s: sec } : null;
}
var ByError = class extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
  }
  code;
};
async function by(mode, method, path, params = {}, signed = true) {
  const c = byCreds(mode);
  if (signed && !c) throw new UserError(`Bybit ${mode} is not connected: add BYBIT_${mode === "live" ? "LIVE" : "DEMO"}_KEY and BYBIT_${mode === "live" ? "LIVE" : "DEMO"}_SECRET in Supabase secrets.`);
  let url = (signed ? BY_BASE[mode] : BY_BASE.live) + path, body, payload = "";
  if (method === "GET") {
    payload = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    if (payload) url += `?${payload}`;
  } else {
    body = JSON.stringify(params);
    payload = body;
  }
  const headers = { "Content-Type": "application/json" };
  if (signed) {
    const ts = String(Date.now());
    Object.assign(headers, { "X-BAPI-API-KEY": c.k, "X-BAPI-TIMESTAMP": ts, "X-BAPI-RECV-WINDOW": "5000", "X-BAPI-SIGN": await hmac(c.s, ts + c.k + "5000" + payload) });
  }
  const r = await fetch(url, { method, headers, body });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { retCode: r.status, retMsg: text.replace(/<[^>]+>/g, " ").trim().slice(0, 160) };
  }
  if (r.status === 403 || r.status === 451) throw new UserError("Bybit refused this server's location. Bybit can't be used from here; use Binance, MT5 or Deriv.");
  if (!r.ok || j.retCode !== 0) {
    const code = Number(j.retCode ?? r.status);
    if ([10003, 10004, 10005, 33004].includes(code)) throw new UserError(`Bybit rejected the API key. Use a ${mode === "demo" ? "Demo Trading" : "real-account"} key with Contract (derivatives) trading switched on.`);
    if (code === 110007 || code === 110004 || code === 110012) throw new UserError("Not enough balance in your Bybit account for this trade.");
    if (code === 10001 && /position idx/i.test(j.retMsg ?? "")) throw new UserError("Switch Bybit's position mode to One-Way (Derivatives settings), then try again.");
    throw new ByError(code, `Bybit: ${j.retMsg ?? text.slice(0, 120)} (${code})`);
  }
  return j.result;
}
var byInfo = null;
async function bySymbols() {
  if (byInfo && Date.now() - byInfo.at < 36e5) return byInfo.syms;
  const syms = /* @__PURE__ */ new Map();
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const res = await by("live", "GET", "/v5/market/instruments-info", { category: "linear", limit: 1e3, ...cursor ? { cursor } : {} }, false);
    for (const x of res.list ?? []) if (x.status === "Trading" && x.quoteCoin === "USDT" && x.contractType === "LinearPerpetual") syms.set(x.symbol, x);
    cursor = res.nextPageCursor ?? "";
    if (!cursor) break;
  }
  byInfo = { at: Date.now(), syms };
  return syms;
}
function bySymbolFor(id, syms) {
  const [src, s] = id.split(":");
  if (src === "crypto") {
    const b = s.replace(/USDT$/, "");
    return [`${b}USDT`, `1000${b}USDT`, `${b}1000USDT`, `10000${b}USDT`, `1000000${b}USDT`].find((c2) => syms.has(c2)) ?? null;
  }
  const c = { "GC=F": "XAUTUSDT" }[s];
  return c && syms.has(c) ? c : null;
}
function byRules(sym, syms) {
  const x = syms.get(sym);
  return { sym, tick: Number(x.priceFilter.tickSize), step: Number(x.lotSizeFilter.qtyStep), minQty: Number(x.lotSizeFilter.minOrderQty), minNotional: Number(x.lotSizeFilter.minNotionalValue ?? 5) || 5, maxLev: Number(x.leverageFilter?.maxLeverage ?? 10) || 10 };
}
var byMark = async (sym) => Number((await by("live", "GET", "/v5/market/tickers", { category: "linear", symbol: sym }, false)).list?.[0]?.markPrice);
var byPos = async (mode, sym) => ((await by(mode, "GET", "/v5/position/list", { category: "linear", symbol: sym })).list ?? []).find((x) => Number(x.size) > 0) ?? null;
async function byStop(mode, sym, stop, tick) {
  await by(mode, "POST", "/v5/position/trading-stop", { category: "linear", symbol: sym, tpslMode: "Full", stopLoss: roundTo(stop, tick), slTriggerBy: "MarkPrice", positionIdx: 0 }).catch((e) => {
    if (!(e instanceof ByError) || e.code !== 34040) throw e;
  });
}
async function byRealized(mode, sym, sinceMs) {
  const res = await by(mode, "GET", "/v5/position/closed-pnl", { category: "linear", symbol: sym, startTime: Math.max(sinceMs - 6e4, Date.now() - 6.9 * 864e5), limit: 100 });
  return (res.list ?? []).reduce((a, x) => a + Number(x.closedPnl ?? 0), 0);
}
async function byLastExit(mode, sym, sinceMs) {
  const res = await by(mode, "GET", "/v5/position/closed-pnl", { category: "linear", symbol: sym, startTime: Math.max(sinceMs - 6e4, Date.now() - 6.9 * 864e5), limit: 1 });
  const x = res.list?.[0];
  return x ? Number(x.avgExitPrice) : null;
}
async function byClose(mode, sym) {
  await by(mode, "POST", "/v5/order/cancel-all", { category: "linear", symbol: sym }).catch(() => {
  });
  const p = await byPos(mode, sym);
  if (!p) return null;
  await by(mode, "POST", "/v5/order/create", { category: "linear", symbol: sym, side: p.side === "Buy" ? "Sell" : "Buy", orderType: "Market", qty: p.size, reduceOnly: true, positionIdx: 0 });
  return Number((await by(mode, "GET", "/v5/market/tickers", { category: "linear", symbol: sym }, false)).list?.[0]?.lastPrice) || null;
}
function mtCreds(mode) {
  const token = Deno.env.get("METAAPI_TOKEN"), acc = Deno.env.get(mode === "live" ? "METAAPI_ACCOUNT_LIVE" : "METAAPI_ACCOUNT_DEMO");
  return token && acc ? { token, acc, region: Deno.env.get("METAAPI_REGION") || "new-york" } : null;
}
async function mt(mode, method, path, body) {
  const c = mtCreds(mode);
  if (!c) throw new UserError(`MT5 ${mode} is not connected: add METAAPI_TOKEN and METAAPI_ACCOUNT_${mode === "live" ? "LIVE" : "DEMO"} in Supabase secrets.`);
  const r = await fetch(`https://mt-client-api-v1.${c.region}.agiliumtrade.ai/users/current/accounts/${c.acc}${path}`, { method, headers: { "auth-token": c.token, "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : void 0 });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { message: text.slice(0, 160) };
  }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new UserError("MetaApi rejected the token. Copy it again from app.metaapi.cloud \u2192 API access.");
    if (r.status === 404) throw new UserError(`MetaApi can't find that MT5 account${/region/i.test(j.message ?? "") ? " in this region" : ""}. Check METAAPI_ACCOUNT_${mode === "live" ? "LIVE" : "DEMO"} and METAAPI_REGION, and that the account is deployed.`);
    throw new UserError(`MT5 (MetaApi): ${j.message ?? text.slice(0, 120)} (${r.status})`);
  }
  return j;
}
async function mtTrade(mode, body) {
  const j = await mt(mode, "POST", "/trade", body);
  if (!["TRADE_RETCODE_DONE", "TRADE_RETCODE_PLACED", "TRADE_RETCODE_DONE_PARTIAL", "TRADE_RETCODE_NO_CHANGES"].includes(j.stringCode)) throw new UserError(`MT5 refused: ${j.message ?? j.stringCode}`);
  return j;
}
var mtSymCache = {};
async function mtSymbols(mode) {
  const c = mtSymCache[mode];
  if (c && Date.now() - c.at < 36e5) return c.list;
  const list = (await mt(mode, "GET", "/symbols")).filter((x) => typeof x === "string");
  mtSymCache[mode] = { at: Date.now(), list };
  return list;
}
var MT_MAP = {
  "GC=F": ["XAUUSD", "GOLD"],
  "SI=F": ["XAGUSD", "SILVER"],
  "PL=F": ["XPTUSD"],
  "PA=F": ["XPDUSD"],
  "CL=F": ["USOIL", "XTIUSD", "WTI", "USOUSD"],
  "BZ=F": ["UKOIL", "XBRUSD", "BRENT"],
  "NG=F": ["XNGUSD", "NATGAS", "NGAS"],
  "^GSPC": ["US500", "SPX500", "SP500", "US500CASH"],
  SPY: ["US500", "SPX500", "SP500"],
  "^NDX": ["USTEC", "NAS100", "US100", "USTECH"],
  QQQ: ["USTEC", "NAS100", "US100"],
  "^IXIC": ["USTEC", "NAS100", "US100"],
  "^DJI": ["US30", "DJ30", "WS30", "US30CASH"],
  DIA: ["US30", "DJ30", "WS30"],
  "^RUT": ["US2000", "RUSSELL2000"],
  IWM: ["US2000"]
};
function mtSymbolFor(id, list) {
  const [src, s] = id.split(":");
  const cands = src === "crypto" ? [s.replace(/USDT$/, "") + "USD", s] : s.endsWith("=X") ? [s.replace("=X", "")] : MT_MAP[s] ?? (/^[A-Z]{2,5}$/.test(s) ? [s] : []);
  for (const c of cands) {
    const exact = list.find((x) => x.toUpperCase() === c);
    if (exact) return { sym: exact, cand: c };
    const rx = new RegExp(`^${c}([._#-]?[A-Z]{0,2}|[._-]US|[._-]?CASH)$`, "i");
    const near = list.find((x) => rx.test(x));
    if (near) return { sym: near, cand: c };
  }
  return null;
}
async function mtPrice(mode, sym) {
  const p = await mt(mode, "GET", `/symbols/${encodeURIComponent(sym)}/current-price`);
  return (Number(p.bid) + Number(p.ask)) / 2;
}
var mtSpec = (mode, sym) => mt(mode, "GET", `/symbols/${encodeURIComponent(sym)}/specification`);
async function mtUsdPerLot(mode, cand, price, contractSize, list) {
  if (/^[A-Z]{6}$/.test(cand) && !/^(XAU|XAG|XPT|XPD|BTC|ETH)/.test(cand)) {
    const base = cand.slice(0, 3), quote = cand.slice(3);
    if (base === "USD") return contractSize;
    if (quote === "USD") return contractSize * price;
    const direct = mtSymbolFor(`yahoo:${base}USD=X`, list), inverse = mtSymbolFor(`yahoo:USD${base}=X`, list);
    if (direct) return contractSize * await mtPrice(mode, direct.sym);
    if (inverse) return contractSize / await mtPrice(mode, inverse.sym);
    return null;
  }
  return contractSize * price;
}
var roundDigits = (x, d) => Number(x.toFixed(Math.max(0, Math.min(8, d))));
var DV_MAP = {
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
var Deriv = class _Deriv {
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
    const d = new _Deriv();
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
    const d = new _Deriv();
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
};
var dvActive = null;
async function derivActive(d) {
  if (dvActive && Date.now() - dvActive.at < 36e5) return dvActive;
  const m = await d.send({ active_symbols: "brief", contract_type: ["MULTUP"] });
  const all = new Map((m.active_symbols ?? []).map((s) => [s.underlying_symbol, s]));
  dvActive = { at: Date.now(), all, open: new Set([...all.values()].filter((s) => s.exchange_is_open && !s.is_trading_suspended).map((s) => s.underlying_symbol)) };
  return dvActive;
}
var dvSymbolFor = (id, act) => derivCandidates(id).find((c) => act.all.has(c)) ?? null;
var allow = (cfg, b) => cfg.allowed ? cfg.allowed.includes(b) : cfg.broker === "both" || cfg.broker === b;
function readPicks(x) {
  if (!Array.isArray(x) || !x.length) return null;
  const out = [];
  for (const p of x.slice(0, 20)) {
    const symbol = String(p?.symbol ?? "");
    if (!/^(crypto|yahoo):[A-Za-z0-9.=^\-]{1,24}$/.test(symbol) || !(String(p.tf) in TF_H)) continue;
    const n = (v) => Number(v);
    const q = { symbol, label: String(p.label ?? symbol).slice(0, 40), market: String(p.market ?? "").slice(0, 20), tf: String(p.tf), dir: p.dir === "short" ? "short" : "long", score: Math.round(n(p.score) || 0), name: String(p.name ?? "Chosen setup").slice(0, 60), stop: n(p.stop), target1: n(p.target1), target2: n(p.target2), expectBars: Math.max(1, n(p.expectBars) || 3) };
    if (![q.stop, q.target1, q.target2].every((v) => v > 0)) continue;
    if (!out.some((o) => o.symbol === q.symbol)) out.push(q);
  }
  return out.length ? out : null;
}
var PICK_MIN_H = 24;
var PICK_MAX_H = 400 * 24;
var pickHours = (picks) => Math.min(PICK_MAX_H, Math.max(PICK_MIN_H, ...picks.map((p) => p.expectBars * TF_H[p.tf] * 1.6)));
function readCfg(b) {
  const broker = ["binance", "deriv", "bybit", "mt5", "both"].includes(b.broker) ? b.broker : "binance";
  const alloc = ["each", "equal", "score", "custom"].includes(b.alloc) ? b.alloc : "equal";
  const custom = b.custom && typeof b.custom === "object" ? Object.fromEntries(Object.entries(b.custom).map(([k, v]) => [String(k), Math.max(0, Number(v))]).filter(([, v]) => Number(v) > 0)) : null;
  const picks = readPicks(b.picks);
  const cfg = { broker, mode: b.mode === "live" ? "live" : "demo", amount: Number(b.amount), count: Math.min(20, Math.max(1, Math.round(Number(b.count) || 1))), horizon: String(b.horizon), strict: Math.min(100, Math.max(65, Math.round(Number(b.strict) || 75))), risk: String(b.risk), alloc, custom, fallback: b.fallback !== false, picks };
  if (!(cfg.amount > 0)) throw new UserError("Enter how much to invest.");
  if (b.picks && !picks) throw new UserError("Those setups are missing their stop-loss or targets. Open the chart again and retry.");
  if (picks) {
    cfg.count = picks.length;
    cfg.horizon = "pick";
    cfg.fallback = false;
    cfg.strict = Math.max(0, Math.min(...picks.map((p) => p.score)));
  } else if (!HORIZONS[cfg.horizon]) throw new UserError("Pick a time window.");
  if (!RISK[cfg.risk]) cfg.risk = "balanced";
  return cfg;
}
var totalOf = (c) => c.alloc === "each" ? c.amount * c.count : c.alloc === "custom" && c.custom ? Math.max(c.amount, Object.values(c.custom).reduce((a, x) => a + x, 0)) : c.amount;
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
  await Promise.all([
    allow(cfg, "binance") && bnSymbols(cfg.mode).then((x) => {
      v.bn = x;
    }, () => {
      v.bn = /* @__PURE__ */ new Map();
    }),
    allow(cfg, "bybit") && bySymbols().then((x) => {
      v.by = x;
    }, () => {
      v.by = /* @__PURE__ */ new Map();
    }),
    allow(cfg, "mt5") && mtCreds(cfg.mode) && mtSymbols(cfg.mode).then((x) => {
      v.mt = x;
    }, () => {
      v.mt = [];
    }),
    allow(cfg, "deriv") && d && derivActive(d).then((x) => {
      v.dv = x;
    }, () => {
      v.dv = { all: /* @__PURE__ */ new Map(), open: /* @__PURE__ */ new Set() };
    })
  ]);
  return v;
}
function route(id, cfg, v) {
  for (const b of BROKERS) {
    if (!allow(cfg, b)) continue;
    if (b === "binance" && v.bn) {
      const s = bnSymbolFor(id, v.bn);
      if (s) return { broker: b, sym: s };
    }
    if (b === "bybit" && v.by) {
      const s = bySymbolFor(id, v.by);
      if (s) return { broker: b, sym: s };
    }
    if (b === "mt5" && v.mt?.length) {
      const m = mtSymbolFor(id, v.mt);
      if (m) return { broker: b, sym: m.sym, cand: m.cand };
    }
    if (b === "deriv" && v.dv) {
      const s = dvSymbolFor(id, v.dv);
      if (s && v.dv.open.has(s)) return { broker: b, sym: s };
    }
  }
  return null;
}
async function candidates(db, cfg, v, exclude, want) {
  const hz = HORIZONS[cfg.horizon];
  const now = Date.now();
  const { data } = await db.from("viko_picks").select("symbol,tf,label,market,price,candle_t,scanned_at,verdict,dir,score,hard_fail,triggered,rr1,setup,news_warn").gt("scanned_at", new Date(now - 3 * 36e5 - (hz.h > 100 ? 4 * 864e5 : 0)).toISOString());
  const rows = (data ?? []).filter((r) => fresh(r, now) && r.setup);
  const by2 = /* @__PURE__ */ new Map();
  for (const r of rows) by2.set(r.symbol, [...by2.get(r.symbol) ?? [], r]);
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
    const others = (by2.get(r.symbol) ?? []).filter((x) => x.tf !== r.tf && ALL_TFS.includes(x.tf));
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
async function chosen(cfg, v, exclude) {
  const out = [], skipped = [];
  const list = cfg.picks.filter((p) => {
    if (exclude.has(p.symbol)) {
      skipped.push(`${p.label} already has an open trade, so it was left out.`);
      return false;
    }
    return true;
  });
  const views = await Promise.all(list.map((p) => newsView({ symbol: p.symbol, label: p.label, market: p.market, tf: p.tf, verdict: p.score >= 80 ? "APPROVED" : "WATCH", dir: p.dir, score: p.score, setup: { name: p.name }, price: 0 })));
  list.forEach((p, i) => {
    const venue = route(p.symbol, cfg, v);
    if (!venue) {
      skipped.push(`${p.label} can't be traded on ${brokerName(cfg.broker)}${cfg.broker !== "binance" && v.dv ? " right now (market closed or not offered)" : ""}.`);
      return;
    }
    const nv = views[i];
    const against = nv.stance === "bullish" && p.dir === "short" || nv.stance === "bearish" && p.dir === "long";
    out.push({
      symbol: p.symbol,
      label: p.label,
      market: p.market,
      tf: p.tf,
      dir: p.dir,
      score: p.score,
      agree: 0,
      against: 0,
      venue,
      price: 0,
      opinion: nv.text,
      stance: nv.stance ?? "neutral",
      newsAgainst: against,
      setup: { name: p.name, degree: p.tf, stop: p.stop, target1: p.target1, target2: p.target2, expectBars: p.expectBars }
    });
  });
  return Object.assign(out, { diag: { chosen: cfg.picks.length }, skippedPre: skipped });
}
async function size(cfg, r, d, v) {
  const s = r.setup, long = r.dir === "long", target = RISK[cfg.risk];
  const venue = r.venue;
  const src = await sourcePrice(r.symbol) ?? r.price;
  if (!src) return { skip: `${r.label}: no live price right now.` };
  let live;
  if (venue.broker === "binance") live = await bnMark(cfg.mode, venue.sym).catch(() => null);
  else if (venue.broker === "bybit") live = await byMark(venue.sym).catch(() => null);
  else if (venue.broker === "mt5") live = await mtPrice(cfg.mode, venue.sym).catch(() => null);
  else live = d ? await d.spot(venue.sym) : null;
  if (!live) return { skip: `${r.label}: no live price from ${brokerName(venue.broker)}.` };
  const k = live / src;
  const stop = s.stop * k, t1 = s.target1 * k, t2 = s.target2 * k;
  if (!(long ? stop < live && t1 > live : stop > live && t1 < live)) return { skip: `${r.label} has already moved past its stop or first target.` };
  const stopPct = Math.abs(live - stop) / live;
  let lev;
  if (venue.broker === "binance" || venue.broker === "bybit" || venue.broker === "mt5") {
    const maxLev = venue.broker === "binance" ? Number(v.bn?.get(venue.sym)?.maxLeverage ?? 10) || 10 : venue.broker === "bybit" ? byRules(venue.sym, v.by).maxLev : 30;
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
  return { broker: venue.broker, sym: venue.sym, cand: venue.cand, live, k, stop, t1, t2, stopPct, lev, t1Pct: Math.abs(t1 - live) / live, t2Pct: Math.abs(t2 - live) / live };
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
  const picks = cfg.picks ? await chosen(cfg, v, exclude) : await candidates(db, cfg, v, exclude, want + 4);
  const diag = picks.diag;
  const trades = [], skipped = [...picks.skippedPre ?? []];
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
      newsAgainst: !!r.newsAgainst,
      setup: cfg.picks ? `${r.setup.name}, ${r.tf}` : `${r.setup.name} (${r.setup.degree})`,
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
    } else if (t.broker === "bybit") {
      const rules = byRules(t.brokerSymbol, v.by);
      const qty = Number(floorTo(pos / t.entry, rules.step));
      if (pos < rules.minNotional || qty < rules.minQty) t.tooSmall = `Bybit needs at least ${Math.ceil(Math.max(rules.minNotional, rules.minQty * t.entry) / t.leverage)} USDT on ${t.label} at ${t.leverage}x.`;
      t._rules = rules;
    } else if (t.broker === "mt5") {
      try {
        const spec = await mtSpec(cfg.mode, t.brokerSymbol);
        const perLot = await mtUsdPerLot(cfg.mode, t._z.cand ?? t.brokerSymbol, t.entry, Number(spec.contractSize) || 1, v.mt);
        if (!perLot) {
          t.tooSmall = `${t.label}: Viko can't work out its dollar value on your MT5 broker, so it was left out.`;
          continue;
        }
        const step = Number(spec.volumeStep) || 0.01, minV = Number(spec.minVolume) || step;
        const vol = Number(floorTo(Math.min(pos / perLot, Number(spec.maxVolume) || 100), step));
        if (vol < minV) t.tooSmall = `MT5 needs at least ${Math.ceil(minV * perLot / t.leverage)} USD on ${t.label} at ${t.leverage}x (the smallest lot is ${minV}).`;
        t._mt = { vol, step, minV, digits: Number(spec.digits ?? 5) };
      } catch (e) {
        t.tooSmall = `${t.label}: ${e.message}`;
      }
    } else if (t.money < 1) t.tooSmall = "Deriv needs at least 1 USD per trade.";
  }
  const L = await getLimits(db), u = await usage(db, cfg.mode, L);
  const ok = withinLimits(trades.filter((t) => !t.tooSmall), u, L, skipped);
  skipped.push(...trades.filter((t) => t.tooSmall).map((t) => t.tooSmall));
  const pickH = cfg.picks ? pickHours(cfg.picks) : 0;
  return { limits: u.applies ? { money: L.money, trades: L.trades, loss: L.loss, used: u.money, count: u.trades, pnl: u.pnl, lossHit: u.lossHit } : null, trades: ok, skipped, horizon: cfg.picks ? "until the targets or stop are hit" : HORIZONS[cfg.horizon].name, closeBy: cfg.picks ? Date.now() + pickH * 36e5 : null, total: totalOf(cfg), diag, venues: { binance: v.bn ? v.bn.size : null, deriv: v.dv ? v.dv.open.size : null } };
}
var NO_LIMITS = { on: false, money: null, trades: null, loss: null, closeOnLoss: false, applies: "live", tz: "Africa/Nairobi" };
async function getLimits(db) {
  const { data } = await db.from("viko_settings").select("v").eq("k", "limits").maybeSingle();
  return { ...NO_LIMITS, ...data?.v ?? {} };
}
function readLimits(b) {
  const pos = (x) => x === null || x === "" || x === void 0 ? null : Number(x) > 0 ? Number(x) : null;
  let tz = String(b.tz ?? "Africa/Nairobi");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "Africa/Nairobi";
  }
  return { on: !!b.on, money: pos(b.money), trades: pos(b.trades) ? Math.round(Number(b.trades)) : null, loss: pos(b.loss), closeOnLoss: !!b.closeOnLoss, applies: b.applies === "all" ? "all" : "live", tz };
}
function dayStart(tz, now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t) => Number(parts.find((x) => x.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  const offset = asUtc - Math.floor(now / 1e3) * 1e3;
  return Date.UTC(g("year"), g("month") - 1, g("day")) - offset;
}
async function usage(db, mode, L) {
  L = L ?? await getLimits(db);
  const since = dayStart(L.tz);
  const { data: today } = await db.from("viko_auto_positions").select("stake,status,pnl,last_pnl,opened_at,closed_at").eq("mode", mode).or(`opened_at.gte."${new Date(since).toISOString()}",closed_at.gte."${new Date(since).toISOString()}",status.eq.open`);
  const rows = today ?? [];
  const openedToday = rows.filter((r) => Date.parse(r.opened_at) >= since);
  const money = openedToday.reduce((a, r) => a + Number(r.stake ?? 0), 0);
  const pnl = rows.reduce((a, r) => a + (r.status === "open" ? Number(r.last_pnl ?? 0) : r.closed_at && Date.parse(r.closed_at) >= since ? Number(r.pnl ?? 0) : 0), 0);
  const applies = L.on && (L.applies === "all" || mode === "live");
  return {
    applies,
    money: r2(money),
    trades: openedToday.length,
    pnl: r2(pnl),
    lossHit: applies && L.loss != null && pnl <= -L.loss,
    moneyLeft: applies && L.money != null ? Math.max(0, r2(L.money - money)) : Infinity,
    tradesLeft: applies && L.trades != null ? Math.max(0, L.trades - openedToday.length) : Infinity,
    since
  };
}
function withinLimits(trades, u, L, skipped) {
  if (!u.applies) return trades;
  if (u.lossHit) {
    skipped.push(`Daily loss limit reached (${sgn(u.pnl)} today, limit \u2212${L.loss}). No new trades until tomorrow.`);
    return [];
  }
  const out = [];
  let money = 0;
  for (const t of trades) {
    if (out.length >= u.tradesLeft) {
      skipped.push(`${t.label}: daily trade limit (${L.trades} a day) reached.`);
      continue;
    }
    if (money + t.money > u.moneyLeft + 1e-9) {
      skipped.push(`${t.label}: would pass your daily money limit (${u.money} of ${L.money} used today).`);
      continue;
    }
    money += t.money;
    out.push(t);
  }
  return out;
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
    await alert(db, "open", cfg.mode, `${acct(cfg.mode)}: ${long ? "bought" : "sold"} ${t.label}`, `Binance, ${t.money} USDT at ${t.leverage}x, entry ${fmt(entry2)}. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} / ${fmt(t.target2)}. Expected profit ${sgn(t.profit1 ?? 0)} to ${sgn(t.profit2 ?? 0)} USDT; at the stop ${sgn(-(t.loss ?? 0))}.`);
    return;
  }
  if (t.broker === "bybit") {
    const rules = t._rules, sym2 = rules.sym, exit = long ? "Sell" : "Buy";
    await by(cfg.mode, "POST", "/v5/position/set-leverage", { category: "linear", symbol: sym2, buyLeverage: String(t.leverage), sellLeverage: String(t.leverage) }).catch((e) => {
      if (!(e instanceof ByError) || e.code !== 110043) throw e;
    });
    const mark = await byMark(sym2);
    const qty = floorTo(t.money * t.leverage / mark, rules.step);
    if (Number(qty) < rules.minQty) throw new UserError(`${t.label}: the amount is below Bybit's minimum size.`);
    await by(cfg.mode, "POST", "/v5/order/create", { category: "linear", symbol: sym2, side: long ? "Buy" : "Sell", orderType: "Market", qty, stopLoss: roundTo(t.stop, rules.tick), slTriggerBy: "MarkPrice", tpslMode: "Full", positionIdx: 0 });
    const pos = await byPos(cfg.mode, sym2);
    if (!pos) throw new UserError(`${t.label}: Bybit didn't fill the order.`);
    const entry2 = Number(pos.avgPrice) || mark, size2 = Number(pos.size);
    if (!Number(pos.stopLoss)) {
      try {
        await byStop(cfg.mode, sym2, t.stop, rules.tick);
      } catch (e) {
        await byClose(cfg.mode, sym2).catch(() => {
        });
        throw new UserError(`${t.label}: Bybit refused the stop-loss, so the trade was closed straight away. ${e.message}`);
      }
    }
    const half = floorTo(size2 / 2, rules.step), rest = floorTo(size2 - Number(half), rules.step);
    const tp = (price, q) => by(cfg.mode, "POST", "/v5/order/create", { category: "linear", symbol: sym2, side: exit, orderType: "Limit", price: roundTo(price, rules.tick), qty: q, reduceOnly: true, timeInForce: "GTC", positionIdx: 0 }).catch(() => {
    });
    if (Number(half) >= rules.minQty && Number(rest) >= rules.minQty) {
      await tp(t.target1, half);
      await tp(t.target2, rest);
    } else await tp(t.target2, String(size2));
    const { data: data2 } = await db.from("viko_auto_positions").insert({ ...base, broker_symbol: sym2, entry: entry2, qty: size2, refs: { scale: 1, tick: rules.tick, step: rules.step, opened_ms: Date.now() }, last_price: entry2, last_pnl: 0 }).select().single();
    await event(db, plan_id, data2.id, `${long ? "Bought" : "Sold"} ${t.label} (${sym2}) on Bybit at ${fmt(entry2)} with ${t.money} USDT at ${t.leverage}x. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} and ${fmt(t.target2)}.`);
    await alert(db, "open", cfg.mode, `${acct(cfg.mode)}: ${long ? "bought" : "sold"} ${t.label}`, `Bybit, ${t.money} USDT at ${t.leverage}x, entry ${fmt(entry2)}. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} / ${fmt(t.target2)}. Expected profit ${sgn(t.profit1 ?? 0)} to ${sgn(t.profit2 ?? 0)} USDT; at the stop ${sgn(-(t.loss ?? 0))}.`);
    return;
  }
  if (t.broker === "mt5") {
    const sym2 = t.brokerSymbol, { vol, step, minV, digits } = t._mt;
    const half = Number(floorTo(vol / 2, step)), rest = Number(floorTo(vol - half, step));
    const legs = half >= minV && rest >= minV ? [{ role: "t1", vol: half, tp: t.target1 }, { role: "t2", vol: rest, tp: t.target2 }] : [{ role: "t2", vol, tp: t.target2 }];
    const refs2 = [];
    for (const l of legs) {
      try {
        const res = await mtTrade(cfg.mode, { actionType: long ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL", symbol: sym2, volume: l.vol, stopLoss: roundDigits(t.stop, digits), takeProfit: roundDigits(l.tp, digits), comment: "Viko" });
        refs2.push({ id: String(res.positionId ?? res.orderId), role: l.role, vol: l.vol });
      } catch (e) {
        for (const x of refs2) await mtTrade(cfg.mode, { actionType: "POSITION_CLOSE_ID", positionId: x.id }).catch(() => {
        });
        throw new UserError(`${t.label}: ${e.message}`);
      }
    }
    const open = (await mt(cfg.mode, "GET", "/positions").catch(() => [])).find((x) => String(x.id) === refs2[0].id);
    const entry2 = Number(open?.openPrice ?? t.entry);
    const { data: data2 } = await db.from("viko_auto_positions").insert({ ...base, broker_symbol: sym2, entry: entry2, qty: vol, refs: { positions: refs2, digits, opened_ms: Date.now() }, last_price: entry2, last_pnl: 0 }).select().single();
    await event(db, plan_id, data2.id, `${long ? "Bought" : "Sold"} ${t.label} (${sym2}) on MT5: ${vol} lots at ${fmt(entry2)}. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} and ${fmt(t.target2)}.`);
    await alert(db, "open", cfg.mode, `${acct(cfg.mode)}: ${long ? "bought" : "sold"} ${t.label}`, `MT5, ${vol} lots (about ${t.money} USD of margin at ${t.leverage}x), entry ${fmt(entry2)}. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} / ${fmt(t.target2)}. Expected profit ${sgn(t.profit1 ?? 0)} to ${sgn(t.profit2 ?? 0)} USD; at the stop ${sgn(-(t.loss ?? 0))}.`);
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
  await alert(db, "open", cfg.mode, `${acct(cfg.mode)}: ${long ? "bought" : "sold"} ${t.label}`, `Deriv, ${t.money} USD at x${t.leverage}, entry ${fmt(entry)}. Stop ${fmt(t.stop)}, targets ${fmt(t.target1)} / ${fmt(t.target2)}. Expected profit ${sgn(t.profit1 ?? 0)} to ${sgn(t.profit2 ?? 0)} USD; at the stop ${sgn(-(t.loss ?? 0))}.`);
}
function planCfg(plan) {
  return { broker: plan.broker, mode: plan.mode, amount: plan.amount, count: plan.count, horizon: plan.horizon, strict: plan.strict, risk: plan.risk, alloc: plan.alloc ?? "equal", custom: plan.custom ?? null, fallback: plan.fallback ?? true };
}
async function brokerBalance(b, mode, d) {
  if (b === "binance") return Number((await bn(mode, "GET", "/fapi/v3/account")).availableBalance);
  if (b === "bybit") {
    const w = (await by(mode, "GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" })).list?.[0];
    return Number(w?.totalAvailableBalance ?? w?.coin?.find((c) => c.coin === "USDT")?.walletBalance ?? 0);
  }
  if (b === "mt5") return Number((await mt(mode, "GET", "/account-information")).freeMargin ?? 0);
  return Number((await d?.send({ balance: 1 }).catch(() => null))?.balance?.balance ?? d?.account.balance ?? Infinity);
}
var connectedTo = (b, mode) => b === "binance" ? !!bnCreds(mode) : b === "bybit" ? !!byCreds(mode) : b === "mt5" ? !!mtCreds(mode) : Deriv.connected();
function usableBrokers(cfg) {
  const want = cfg.broker === "both" ? BROKERS : [cfg.broker];
  return want.filter((b) => connectedTo(b, cfg.mode));
}
async function fill(db, plan, d) {
  if (plan.horizon === "pick") return 0;
  const cfg = planCfg(plan);
  const usable = usableBrokers(cfg);
  if (!usable.length) return 0;
  const eff = { ...cfg, allowed: usable };
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
function trailFor(p, price, t1Hit) {
  const peak = nextPeak(p.dir, p.peak ?? p.entry, price);
  const t = trailStop({ dir: p.dir, entry: Number(p.entry), initialStop: Number(p.initial_stop ?? p.stop), stop: Number(p.stop), target1: Number(p.target1), target2: Number(p.target2), peak, price, t1Hit });
  return { peak, t };
}
var closeReason = (p, exit) => {
  const long = p.dir === "long", lockedProfit = long ? p.stop > p.entry : p.stop < p.entry, atEntry = Math.abs(p.stop - p.entry) / p.entry < 1e-6;
  if (Math.abs(exit - p.stop) < Math.abs(exit - p.target2)) return lockedProfit ? "trailing stop (profit locked)" : atEntry ? "stop at entry" : p.stop !== p.initial_stop ? "trailing stop" : "stop";
  return "target 2";
};
async function bnMoveStop(mode, sym, long, stop, tick) {
  const algos = await bn(mode, "GET", "/fapi/v1/openAlgoOrders", { symbol: sym }).catch(() => []);
  const old = algos.filter((o) => o.orderType === "STOP_MARKET");
  for (const o of old) await bn(mode, "DELETE", "/fapi/v1/algoOrder", { algoId: o.algoId }).catch(() => {
  });
  try {
    await bnProtect(mode, sym, long, stop, null, tick);
  } catch (e) {
    if (old[0]) await bnProtect(mode, sym, long, Number(old[0].triggerPrice), null, tick).catch(() => {
    });
    throw e;
  }
}
async function manageBinance(db, p, endNow, why = "time") {
  const mode = p.mode, sym = p.broker_symbol, sc = p.refs?.scale ?? 1, tick = p.refs?.tick ?? 1e-4, long = p.dir === "long";
  const since = p.refs?.opened_ms ?? Date.parse(p.opened_at);
  const pos = (await bn(mode, "GET", "/fapi/v3/positionRisk", { symbol: sym })).find((x) => Number(x.positionAmt) !== 0);
  if (!pos || endNow) {
    let exit = p.last_price;
    if (pos) exit = (await bnClose(mode, sym) ?? p.last_price * sc) / sc;
    else exit = (await bnLastFill(mode, sym, since).catch(() => null) ?? p.last_price * sc) / sc;
    await bn(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {
    });
    const pnl = await bnRealized(mode, sym, since).catch(() => p.last_pnl ?? 0);
    const reason = pos ? why : closeReason(p, exit);
    await db.from("viko_auto_positions").update({ status: "closed", closed_at: (/* @__PURE__ */ new Date()).toISOString(), pnl: r2(pnl), close_reason: reason, last_price: exit, last_pnl: r2(pnl), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.id);
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${pnl >= 0 ? "+" : ""}${r2(pnl)} USDT.`);
    await alert(db, "close", p.mode, `${acct(p.mode)}: ${p.label} closed ${sgn(pnl)} USDT`, `${pnl >= 0 ? "Profit" : "Loss"} of ${Math.abs(r2(pnl))} USDT on ${p.stake} USDT (${reason}). Binance, exit ${fmt(exit)}.`, r2(pnl));
    return;
  }
  const amt = Math.abs(Number(pos.positionAmt)), mark = Number(pos.markPrice) / sc;
  const realized = p.t1_hit ? await bnRealized(mode, sym, since).catch(() => 0) : 0;
  const patch = { last_price: mark, last_pnl: r2(Number(pos.unRealizedProfit) + realized), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  const algos = await bn(mode, "GET", "/fapi/v1/openAlgoOrders", { symbol: sym }).catch(() => []);
  const hasStop = algos.some((o) => o.orderType === "STOP_MARKET");
  const t1Now = !p.t1_hit && amt <= p.qty * 0.75;
  if (t1Now) {
    patch.t1_hit = true;
    await event(db, p.plan_id, p.id, `${p.label}: target 1 hit, half taken as profit.`);
    await alert(db, "t1", p.mode, `${acct(p.mode)}: ${p.label} hit target 1`, `Half taken as profit. Viko now trails the stop to lock in more as the price moves. Result so far ${sgn(patch.last_pnl)} USDT.`, patch.last_pnl);
  }
  const { peak, t } = trailFor(p, mark, p.t1_hit || t1Now);
  patch.peak = peak;
  if (t) {
    try {
      await bnMoveStop(mode, sym, long, t.stop * sc, tick);
      patch.stop = t.stop;
      await event(db, p.plan_id, p.id, `${p.label}: stop-loss moved to ${fmt(t.stop)}: ${t.why}.`);
    } catch (e) {
      await event(db, p.plan_id, p.id, `${p.label}: couldn't move the stop on Binance (${e.message}); it stays at ${fmt(p.stop)}.`);
    }
  } else if (!hasStop) {
    await bnProtect(mode, sym, long, p.stop * sc, p.t1_hit ? p.target2 * sc : null, tick);
    await event(db, p.plan_id, p.id, `${p.label}: the stop-loss was missing on Binance, so Viko put it back at ${fmt(p.stop)}.`);
  }
  await db.from("viko_auto_positions").update(patch).eq("id", p.id);
}
async function manageDeriv(db, p, d, endNow, why = "time") {
  const cons = p.refs?.contracts ?? [];
  const long = p.dir === "long";
  const read = async () => {
    let total2 = 0, allSold2 = true, spot2 = p.last_price;
    const states2 = [];
    for (const c of cons) {
      const st = await d.poc(c.id).catch(() => null);
      states2.push({ c, s: st });
      if (st) {
        total2 += Number(st.profit ?? 0);
        spot2 = Number(st.current_spot ?? spot2);
        if (!st.is_sold) allSold2 = false;
      }
    }
    return { total: total2, allSold: allSold2, spot: spot2, states: states2 };
  };
  let { total, allSold, spot, states } = await read();
  const lockedProfit = long ? p.stop > p.entry : p.stop < p.entry;
  const crossed = lockedProfit && (long ? spot <= p.stop : spot >= p.stop);
  if ((endNow || crossed) && !allSold) {
    for (const x of states) if (x.s && !x.s.is_sold) await d.send({ sell: x.c.id, price: 0 }).catch(() => {
    });
    ({ total, allSold, spot, states } = await read());
    if (crossed && !endNow) {
      endNow = true;
      why = "trailing stop (profit locked)";
    }
  }
  const patch = { last_price: spot, last_pnl: r2(total), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  const t1 = states.find((x) => x.c.role === "t1");
  const t1Now = !p.t1_hit && !!t1?.s?.is_sold && Number(t1.s.profit) > 0;
  if (t1Now) {
    patch.t1_hit = true;
    await event(db, p.plan_id, p.id, `${p.label}: target 1 hit, half taken as profit.`);
    await alert(db, "t1", p.mode, `${acct(p.mode)}: ${p.label} hit target 1`, `Half taken as profit on Deriv. Viko now trails the stop to lock in more. Result so far ${sgn(total)} USD.`, r2(total));
  }
  if (!allSold) {
    const { peak, t } = trailFor(p, spot, p.t1_hit || t1Now);
    patch.peak = peak;
    if (t) {
      const lossFrac = t.locksProfit ? 0 : Math.abs(p.entry - t.stop) / p.entry;
      let moved = 0;
      for (const x of states) {
        if (!x.s || x.s.is_sold) continue;
        const mult = Number(x.s.multiplier ?? p.leverage ?? 1), stake = Number(x.c.stake ?? x.s.buy_price ?? 0);
        const amount = Math.max(0.1, r2(stake * mult * lossFrac), r2(stake * 0.02));
        if (await d.send({ contract_update: 1, contract_id: x.c.id, limit_order: { stop_loss: Math.min(amount, r2(stake * 0.95)) } }).then(() => true, () => false)) moved++;
      }
      patch.stop = t.stop;
      await event(db, p.plan_id, p.id, `${p.label}: stop-loss moved to ${fmt(t.stop)}: ${t.why}.${t.locksProfit ? " Viko will close it if the price falls back to that level." : ""}${moved ? "" : " (Deriv didn't accept the change; Viko watches it instead.)"}`);
    }
  }
  if (allSold) {
    const t2 = states.find((x) => x.c.role === "t2");
    const exit = Number(t2?.s?.exit_tick ?? t2?.s?.sell_spot ?? spot);
    const reason = endNow ? why : closeReason(p, exit);
    Object.assign(patch, { status: "closed", closed_at: (/* @__PURE__ */ new Date()).toISOString(), pnl: r2(total), close_reason: reason });
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${total >= 0 ? "+" : ""}${r2(total)} USD.`);
    await alert(db, "close", p.mode, `${acct(p.mode)}: ${p.label} closed ${sgn(total)} USD`, `${total >= 0 ? "Profit" : "Loss"} of ${Math.abs(r2(total))} USD on ${p.stake} USD (${reason}). Deriv, last price ${fmt(spot)}.`, r2(total));
  }
  await db.from("viko_auto_positions").update(patch).eq("id", p.id);
}
async function manageBybit(db, p, endNow, why = "time") {
  const mode = p.mode, sym = p.broker_symbol, tick = p.refs?.tick ?? 1e-4, long = p.dir === "long";
  const since = p.refs?.opened_ms ?? Date.parse(p.opened_at);
  const pos = await byPos(mode, sym);
  if (!pos || endNow) {
    let exit = p.last_price;
    if (pos) exit = await byClose(mode, sym) ?? p.last_price;
    else exit = await byLastExit(mode, sym, since).catch(() => null) ?? p.last_price;
    await by(mode, "POST", "/v5/order/cancel-all", { category: "linear", symbol: sym }).catch(() => {
    });
    const pnl = await byRealized(mode, sym, since).catch(() => p.last_pnl ?? 0);
    const reason = pos ? why : closeReason(p, exit);
    await db.from("viko_auto_positions").update({ status: "closed", closed_at: (/* @__PURE__ */ new Date()).toISOString(), pnl: r2(pnl), close_reason: reason, last_price: exit, last_pnl: r2(pnl), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.id);
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${sgn(pnl)} USDT.`);
    await alert(db, "close", p.mode, `${acct(p.mode)}: ${p.label} closed ${sgn(pnl)} USDT`, `${pnl >= 0 ? "Profit" : "Loss"} of ${Math.abs(r2(pnl))} USDT on ${p.stake} USDT (${reason}). Bybit, exit ${fmt(exit)}.`, r2(pnl));
    return;
  }
  const size2 = Number(pos.size), mark = Number(pos.markPrice);
  const realized = p.t1_hit ? await byRealized(mode, sym, since).catch(() => 0) : 0;
  const patch = { last_price: mark, last_pnl: r2(Number(pos.unrealisedPnl) + realized), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  const t1Now = !p.t1_hit && size2 <= p.qty * 0.75;
  if (t1Now) {
    patch.t1_hit = true;
    await event(db, p.plan_id, p.id, `${p.label}: target 1 hit, half taken as profit.`);
    await alert(db, "t1", p.mode, `${acct(p.mode)}: ${p.label} hit target 1`, `Half taken as profit on Bybit. Viko now trails the stop to lock in more. Result so far ${sgn(patch.last_pnl)} USDT.`, patch.last_pnl);
  }
  const { peak, t } = trailFor(p, mark, p.t1_hit || t1Now);
  patch.peak = peak;
  if (t || !Number(pos.stopLoss)) {
    const st = t ? t.stop : p.stop;
    try {
      await byStop(mode, sym, st, tick);
      patch.stop = st;
      await event(db, p.plan_id, p.id, t ? `${p.label}: stop-loss moved to ${fmt(st)}: ${t.why}.` : `${p.label}: the stop-loss was missing on Bybit, so Viko put it back at ${fmt(st)}.`);
    } catch (e) {
      await event(db, p.plan_id, p.id, `${p.label}: couldn't move the stop on Bybit (${e.message}).`);
    }
  }
  await db.from("viko_auto_positions").update(patch).eq("id", p.id);
}
async function manageMt5(db, p, endNow, why = "time") {
  const mode = p.mode, legs = p.refs?.positions ?? [], digits = p.refs?.digits ?? 5, long = p.dir === "long";
  const done = { ...p.refs?.done ?? {} };
  const exits = { ...p.refs?.exits ?? {} };
  const open = (await mt(mode, "GET", "/positions")).filter((x) => legs.some((l) => l.id === String(x.id)));
  if (endNow) for (const x of open) await mtTrade(mode, { actionType: "POSITION_CLOSE_ID", positionId: String(x.id) }).catch(() => {
  });
  const stillOpen = endNow ? [] : open;
  for (const l of legs) {
    if (stillOpen.some((x) => String(x.id) === l.id) || l.id in done) continue;
    const deals = await mt(mode, "GET", `/history-deals/position/${encodeURIComponent(l.id)}`).catch(() => []);
    done[l.id] = deals.reduce((a, d) => a + Number(d.profit ?? 0) + Number(d.commission ?? 0) + Number(d.swap ?? 0), 0);
    const out = deals.filter((d) => /OUT/.test(String(d.entryType ?? ""))).pop();
    if (out) exits[l.id] = Number(out.price);
  }
  const openPnl = stillOpen.reduce((a, x) => a + Number(x.profit ?? 0) + Number(x.swap ?? 0) + Number(x.commission ?? 0), 0);
  const realized = Object.values(done).reduce((a, x) => a + x, 0);
  const spot = Number(stillOpen[0]?.currentPrice ?? p.last_price);
  const patch = { last_price: spot, last_pnl: r2(openPnl + realized), refs: { ...p.refs, done, exits }, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  const t1 = legs.find((l) => l.role === "t1"), t2open = stillOpen.find((x) => legs.some((l) => l.role === "t2" && l.id === String(x.id)));
  const t1Now = !p.t1_hit && !!t1 && t1.id in done && done[t1.id] > 0 && !!t2open;
  if (t1Now) {
    patch.t1_hit = true;
    await event(db, p.plan_id, p.id, `${p.label}: target 1 hit, half taken as profit.`);
    await alert(db, "t1", p.mode, `${acct(p.mode)}: ${p.label} hit target 1`, `Half taken as profit on MT5. Viko now trails the stop to lock in more. Result so far ${sgn(patch.last_pnl)}.`, patch.last_pnl);
  }
  if (stillOpen.length) {
    const { peak, t } = trailFor(p, spot, p.t1_hit || t1Now);
    patch.peak = peak;
    if (t) {
      let moved = 0;
      for (const x of stillOpen) await mtTrade(mode, { actionType: "POSITION_MODIFY", positionId: String(x.id), stopLoss: roundDigits(t.stop, digits), takeProfit: Number(x.takeProfit) || void 0 }).then(() => {
        moved++;
      }, () => {
      });
      if (moved) {
        patch.stop = t.stop;
        await event(db, p.plan_id, p.id, `${p.label}: stop-loss moved to ${fmt(t.stop)}: ${t.why}.`);
      }
    }
  }
  for (const x of stillOpen) if (!Number(x.stopLoss)) {
    await mtTrade(mode, { actionType: "POSITION_MODIFY", positionId: String(x.id), stopLoss: roundDigits(patch.stop ?? p.stop, digits), takeProfit: Number(x.takeProfit) || void 0 }).catch(() => {
    });
    await event(db, p.plan_id, p.id, `${p.label}: the stop-loss was missing on MT5, so Viko put it back.`);
  }
  if (!stillOpen.length) {
    const total = realized;
    const lastLeg = legs.find((l) => l.role === "t2") ?? legs[legs.length - 1];
    const exit = exits[lastLeg?.id] ?? spot;
    const reason = endNow ? why : closeReason({ ...p, stop: patch.stop ?? p.stop }, exit);
    Object.assign(patch, { status: "closed", closed_at: (/* @__PURE__ */ new Date()).toISOString(), pnl: r2(total), last_pnl: r2(total), close_reason: reason });
    await event(db, p.plan_id, p.id, `${p.label} closed (${reason}). Result: ${sgn(total)}.`);
    await alert(db, "close", p.mode, `${acct(p.mode)}: ${p.label} closed ${sgn(total)}`, `${total >= 0 ? "Profit" : "Loss"} of ${Math.abs(r2(total))} on about ${p.stake} USD (${reason}). MT5 ${p.broker_symbol}.`, r2(total));
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
  const L = await getLimits(db);
  const closeAll = {};
  if (L.on && L.loss != null) for (const mode of ["demo", "live"]) {
    const u = await usage(db, mode, L);
    if (!u.lossHit) continue;
    closeAll[mode] = L.closeOnLoss;
    const key = `limit_hit:${mode}`;
    const { data: seen } = await db.from("viko_settings").select("v").eq("k", key).maybeSingle();
    if (Number(seen?.v?.since) !== u.since) {
      await db.from("viko_settings").upsert({ k: key, v: { since: u.since }, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
      await alert(db, "limit", mode, `${acct(mode)}: daily loss limit reached`, `Today's result is ${sgn(u.pnl)} (limit \u2212${L.loss}). Viko won't open new trades until tomorrow${L.closeOnLoss ? " and is closing the open ones now" : ""}.`, u.pnl);
      await event(db, null, null, `Daily loss limit reached on ${acct(mode).toLowerCase()} (${sgn(u.pnl)} today). No new trades until tomorrow${L.closeOnLoss ? "; open trades are being closed" : ""}.`);
    }
  }
  try {
    for (const plan of plans ?? []) {
      const ending = Date.now() >= Date.parse(plan.ends_at) || opts.endPlan === plan.id;
      const { data: pos } = await db.from("viko_auto_positions").select("*").eq("plan_id", plan.id).eq("status", "open");
      for (const p of pos ?? []) {
        const end = ending || opts.endPosition === p.id || !!closeAll[p.mode];
        const why = opts.endPlan === plan.id || opts.endPosition === p.id ? "collected by you" : closeAll[p.mode] && !ending ? "daily loss limit" : "time window ended";
        try {
          if (p.broker === "binance") await manageBinance(db, p, end, why);
          else if (p.broker === "bybit") await manageBybit(db, p, end, why);
          else if (p.broker === "mt5") await manageMt5(db, p, end, why);
          else await manageDeriv(db, p, await deriv(p.mode), end, why);
        } catch (e) {
          errors.push(`${p.label}: ${e.message}`);
        }
      }
      if (ending) {
        await db.from("viko_auto_plans").update({ status: opts.endPlan === plan.id ? "stopped" : "done", closed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", plan.id);
        await event(db, plan.id, null, opts.endPlan === plan.id ? "You collected this plan. All its trades are closed." : plan.horizon === "pick" ? "Viko's time estimate for these trades has passed. Anything still open is now closed." : `The ${HORIZONS[plan.horizon]?.name ?? ""} window has ended. All trades are closed.`);
        continue;
      }
      if (opts.fillPlans && Date.now() < Date.parse(plan.enter_until)) {
        try {
          await fill(db, plan, (plan.broker === "deriv" || plan.broker === "both") && Deriv.connected() ? await deriv(plan.mode) : null);
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
      const bys = await bySymbols().catch(() => null);
      if (bys) out.bybit = ids.filter((id) => bySymbolFor(id, bys)).length;
      for (const mode of ["demo", "live"]) if (mtCreds(mode)) {
        const l = await mtSymbols(mode).catch(() => null);
        if (l) out[`mt5_${mode}`] = ids.filter((id) => mtSymbolFor(id, l)).length;
      }
      return json(out);
    }
    if (rt === "manage") {
      if (!await keyOk(req, db, "cron_key")) return json({ error: "unauthorised" }, 401);
      return json({ ok: true, errors: await manageAll(db, { fillPlans: true }) });
    }
    const fromWaiting = rt === "start-pending" && (await keyOk(req, db, "cron_key") || await keyOk(req, db, "journal_key"));
    if (!fromWaiting && !await keyOk(req, db, "journal_key")) return json({ error: "Your app key is missing or wrong. Add it in Settings." }, 401);
    if (rt === "state") {
      if (url.searchParams.get("refresh")) await manageAll(db, { fillPlans: false }).catch(() => []);
      const { data: plans } = await db.from("viko_auto_plans").select("*").order("created_at", { ascending: false }).limit(20);
      const ids = (plans ?? []).map((p) => p.id);
      const { data: positions } = ids.length ? await db.from("viko_auto_positions").select("*").in("plan_id", ids).order("opened_at", { ascending: false }) : { data: [] };
      const { data: events } = await db.from("viko_auto_events").select("*").order("at", { ascending: false }).limit(60);
      return json({ plans, positions, events, now: Date.now() });
    }
    if (rt === "history-delete") {
      const b2 = await req.json().catch(() => ({}));
      const ids = Array.isArray(b2.ids) ? b2.ids.map(String).slice(0, 500) : [];
      if (!b2.all && !ids.length) return json({ error: "Choose which trades to delete." }, 400);
      let sel = db.from("viko_auto_positions").select("id").eq("status", "closed");
      if (!b2.all) sel = sel.in("id", ids);
      const { data: rows } = await sel;
      const del = (rows ?? []).map((r) => r.id);
      if (del.length) {
        await db.from("viko_auto_events").delete().in("position_id", del);
        await db.from("viko_auto_positions").delete().in("id", del);
      }
      return json({ ok: true, deleted: del.length });
    }
    if (rt === "limits") {
      if (req.method === "POST") {
        const L2 = readLimits(await req.json().catch(() => ({})));
        await db.from("viko_settings").upsert({ k: "limits", v: L2, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
      }
      const L = await getLimits(db);
      return json({ limits: L, today: { demo: await usage(db, "demo", L), live: await usage(db, "live", L) } });
    }
    if (rt === "history") {
      const { data } = await db.from("viko_auto_positions").select("id,plan_id,broker,mode,symbol,label,tf,dir,stake,leverage,entry,pnl,close_reason,opened_at,closed_at,score,below_bar").eq("status", "closed").order("closed_at", { ascending: false }).limit(2e3);
      return json({ rows: data });
    }
    if (rt === "connect") {
      const q = url.searchParams.get("broker") ?? "binance";
      const broker = ["binance", "deriv", "bybit", "mt5"].includes(q) ? q : "binance";
      const mode = url.searchParams.get("mode") === "live" ? "live" : "demo";
      if (broker === "bybit") return json({ ok: true, broker, mode, balance: r2(await brokerBalance("bybit", mode, null)), currency: "USDT" });
      if (broker === "mt5") {
        const a = await mt(mode, "GET", "/account-information");
        const n = (await mtSymbols(mode)).length;
        return json({ ok: true, broker, mode, balance: r2(Number(a.freeMargin ?? a.balance ?? 0)), currency: a.currency ?? "USD", account: `${a.broker ?? ""} ${a.server ?? ""} \xB7 ${a.leverage ? `1:${a.leverage}` : ""} \xB7 ${n} symbols`.trim() });
      }
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
    if (rt === "preview" || rt === "start" || rt === "start-pending") {
      const cfg = readCfg(b);
      const needDeriv = allow(cfg, "deriv");
      let d = null;
      if (needDeriv) d = Deriv.connected() ? await Deriv.open(cfg.mode).catch(async (e) => {
        if (rt !== "preview") throw e;
        return await Deriv.publicSession().catch(() => null);
      }) : rt === "preview" ? await Deriv.publicSession().catch(() => null) : null;
      try {
        const { data: openAll } = await db.from("viko_auto_positions").select("symbol").eq("status", "open").eq("mode", cfg.mode);
        const exclude = new Set((openAll ?? []).map((x) => String(x.symbol)));
        if (rt === "preview") {
          const pv2 = await preview(db, cfg, exclude, cfg.count, d);
          return json({ ...pv2, connected: { binance: !!bnCreds(cfg.mode), deriv: Deriv.connected(), bybit: !!byCreds(cfg.mode), mt5: !!mtCreds(cfg.mode) }, trades: pv2.trades.map(({ _z, _rules, ...t }) => t) });
        }
        const usable = usableBrokers(cfg);
        if (!usable.length) throw new UserError(`${brokerName(cfg.broker)} is not connected for ${cfg.mode} yet. Open Brokers and follow the steps.`);
        const eff = { ...cfg, allowed: usable };
        const pv = await preview(db, eff, exclude, cfg.count, d);
        const need = {};
        for (const t of pv.trades) need[t.broker] = (need[t.broker] ?? 0) + t.money;
        for (const [br, amt] of Object.entries(need)) {
          const bal = await brokerBalance(br, cfg.mode, d);
          if (bal < amt) throw new UserError(`Your ${brokerName(br)} ${cfg.mode} balance is ${r2(bal)}, but these trades need ${r2(amt)}. Lower the amount or top up.`);
        }
        if (cfg.picks && !pv.trades.length) throw new UserError(pv.skipped[0] ?? "None of these setups can be placed right now.");
        const hzH = cfg.picks ? pickHours(cfg.picks) : HORIZONS[cfg.horizon].h;
        const now = Date.now();
        const { data: plan } = await db.from("viko_auto_plans").insert({ broker: cfg.broker, mode: cfg.mode, amount: cfg.amount, count: cfg.count, horizon: cfg.horizon, strict: cfg.strict, risk: cfg.risk, alloc: cfg.alloc, custom: cfg.custom, fallback: cfg.fallback, total: totalOf(cfg), ends_at: new Date(now + hzH * 36e5).toISOString(), enter_until: new Date(cfg.picks ? now : now + hzH * 36e5 / 2).toISOString() }).select().single();
        if (cfg.picks) await event(db, plan.id, null, `You chose ${pv.trades.length} trade${pv.trades.length > 1 ? "s" : ""} on ${usable.map(brokerName).join(" + ")} (${cfg.mode}), ${r2(totalOf(cfg))} in total. Viko manages the stop-loss and profits and closes anything still open by ${new Date(now + hzH * 36e5).toUTCString().slice(0, 16)}.`);
        else await event(db, plan.id, null, `Plan started on ${usable.map(brokerName).join(" + ")} (${cfg.mode}): up to ${cfg.count} trade${cfg.count > 1 ? "s" : ""}, ${r2(totalOf(cfg))} in total, ${HORIZONS[cfg.horizon]?.name ?? ""}, ${cfg.strict}%+${cfg.fallback ? " (empty slots may use the best setups below the bar)" : " only"}.`);
        let placed = 0;
        for (const t of pv.trades) {
          try {
            await place(db, eff, plan.id, t, d);
            placed++;
          } catch (e) {
            await event(db, plan.id, null, e.message);
          }
        }
        if (placed < cfg.count && !cfg.picks) await event(db, plan.id, null, `${placed ? `${placed} placed now.` : "Nothing qualifies right now."} Viko keeps checking every 5 minutes and fills the rest until ${new Date(Date.parse(plan.enter_until)).toUTCString().slice(0, 22)} UTC.`);
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
export {
  manageBinance,
  manageBybit,
  manageDeriv,
  manageMt5
};
