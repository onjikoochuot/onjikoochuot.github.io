// Viko -> Binance USD-M Futures (margin trading with leverage).
// Keys live in Supabase secrets, never in the app:
//   BINANCE_DEMO_KEY / BINANCE_DEMO_SECRET  (demo.binance.com, fake money)
//   BINANCE_LIVE_KEY / BINANCE_LIVE_SECRET  (real money; trading only, withdrawals OFF)
// All routes need header x-viko-key (your app key). Body/query field `mode` = "demo" | "live".
// GET  /viko-binance/status?mode=   reachability, account balance, open positions and protective orders
// POST /viko-binance/order  {mode, symbol, dir, margin, leverage, stop, target1, target2, label, setup, score}
// POST /viko-binance/close  {mode, symbol}   cancel its TP/SL and close the position at market
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const MAX_LEVERAGE = 10;
type Mode = "demo" | "live";
const BASE: Record<Mode, string> = { demo: "https://demo-fapi.binance.com", live: "https://fapi.binance.com" };

class BinanceError extends Error { constructor(public code: number, msg: string, public http = 400) { super(msg); } }

function creds(mode: Mode) {
  const k = Deno.env.get(mode === "live" ? "BINANCE_LIVE_KEY" : "BINANCE_DEMO_KEY");
  const s = Deno.env.get(mode === "live" ? "BINANCE_LIVE_SECRET" : "BINANCE_DEMO_SECRET");
  return k && s ? { k, s } : null;
}
async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function explain(http: number, code: number, msg: string) {
  if (http === 451 || /restricted location/i.test(msg)) return "Binance refused this server's location. Open Settings > Binance and pick another server region, then test again.";
  if (code === -2015 || code === -2014) return "Binance rejected the API key. Check it was copied fully, that 'Enable Futures' is ticked, and (for demo) that it was made on demo.binance.com.";
  if (code === -2019) return "Not enough margin in your Binance futures wallet for this order.";
  if (code === -4164 || code === -1013) return "The order is smaller than Binance's minimum for this market. Put in a bit more margin.";
  if (code === -2010) return "Binance rejected the order: " + msg;
  return `Binance said: ${msg} (code ${code}).`;
}
async function call(mode: Mode, method: string, path: string, params: Record<string, string | number | boolean> = {}, signed = true) {
  const c = creds(mode);
  if (signed && !c) throw new BinanceError(0, mode === "live" ? "Live trading is not connected yet: the BINANCE_LIVE_KEY and BINANCE_LIVE_SECRET secrets are missing." : "Demo trading is not connected yet: the BINANCE_DEMO_KEY and BINANCE_DEMO_SECRET secrets are missing.", 412);
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  if (signed) { q.set("recvWindow", "5000"); q.set("timestamp", String(Date.now())); q.set("signature", await hmac(c!.s, q.toString())); }
  const r = await fetch(`${BASE[mode]}${path}?${q}`, { method, headers: signed ? { "X-MBX-APIKEY": c!.k } : {} });
  const text = await r.text();
  let j: any; try { j = JSON.parse(text); } catch { j = { msg: text.slice(0, 200) }; }
  if (!r.ok || (j && typeof j.code === "number" && j.code < 0)) throw new BinanceError(j?.code ?? r.status, explain(r.status, j?.code ?? 0, j?.msg ?? text), r.status);
  return j;
}

// ---- symbol rules (tick size, step size, minimums) ----
const infoCache: Partial<Record<Mode, { at: number; syms: Map<string, any> }>> = {};
async function rules(mode: Mode, symbol: string) {
  let c = infoCache[mode];
  if (!c || Date.now() - c.at > 3600000) {
    const j = await call(mode, "GET", "/fapi/v1/exchangeInfo", {}, false);
    c = { at: Date.now(), syms: new Map(j.symbols.filter((s: any) => s.status === "TRADING").map((s: any) => [s.symbol, s])) };
    infoCache[mode] = c;
  }
  // Viko's crypto ids are spot pairs (e.g. PEPEUSDT). Some futures contracts trade per 1000 coins.
  for (const [sym, scale] of [[symbol, 1], [`1000${symbol}`, 1000]] as [string, number][]) {
    const s = c.syms.get(sym);
    if (!s) continue;
    const f = (t: string) => s.filters.find((x: any) => x.filterType === t) ?? {};
    return { sym, scale, tick: Number(f("PRICE_FILTER").tickSize), step: Number(f("MARKET_LOT_SIZE").stepSize ?? f("LOT_SIZE").stepSize) || Number(f("LOT_SIZE").stepSize), minQty: Number(f("LOT_SIZE").minQty), minNotional: Number(f("MIN_NOTIONAL").notional ?? 5) };
  }
  throw new BinanceError(0, `${symbol} has no USD-M futures contract on Binance, so Viko can't trade it there.`);
}
const decimals = (x: number) => { const s = String(x); return s.includes("e-") ? Number(s.split("e-")[1]) : (s.split(".")[1] ?? "").replace(/0+$/, "").length; };
const floorTo = (x: number, step: number) => (Math.floor(x / step + 1e-9) * step).toFixed(decimals(step));
const roundTo = (x: number, tick: number) => (Math.round(x / tick) * tick).toFixed(decimals(tick));

async function authed(req: Request, db: ReturnType<typeof createClient>) {
  const given = req.headers.get("x-viko-key");
  if (!given) return false;
  const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(given)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const { data } = await db.from("viko_config").select("v").eq("k", "journal_key");
  return (data ?? []).some((r: any) => r.v === h);
}

async function status(mode: Mode) {
  const out: any = { mode, region: Deno.env.get("SB_REGION") ?? null, connected: false, keysSet: !!creds(mode), liveKeysSet: !!creds("live") };
  try { await call(mode, "GET", "/fapi/v1/time", {}, false); out.reachable = true; }
  catch (e) { out.reachable = false; out.error = (e as Error).message; return out; }
  if (!out.keysSet) return out;
  try {
    const acc = await call(mode, "GET", "/fapi/v3/account");
    out.connected = true;
    out.balance = Number(acc.totalWalletBalance); out.available = Number(acc.availableBalance); out.unrealized = Number(acc.totalUnrealizedProfit);
    const pos = (await call(mode, "GET", "/fapi/v3/positionRisk")).filter((p: any) => Number(p.positionAmt) !== 0);
    const algos = await call(mode, "GET", "/fapi/v1/openAlgoOrders").catch(() => []);
    out.positions = pos.map((p: any) => ({
      symbol: p.symbol, qty: Number(p.positionAmt), entry: Number(p.entryPrice), mark: Number(p.markPrice), pnl: Number(p.unRealizedProfit),
      liq: Number(p.liquidationPrice), leverage: Number(p.leverage ?? 0), margin: Number(p.isolatedMargin ?? p.initialMargin ?? 0),
      orders: (algos as any[]).filter((o) => o.symbol === p.symbol).map((o) => ({ type: o.orderType, trigger: Number(o.triggerPrice), qty: Number(o.quantity ?? 0), close: !!o.closePosition })),
    }));
  } catch (e) { out.error = (e as Error).message; }
  return out;
}

async function order(mode: Mode, b: any, db: ReturnType<typeof createClient>) {
  const dir = b.dir === "short" ? "short" : "long";
  const lev = Math.round(Number(b.leverage));
  const margin = Number(b.margin);
  if (!(lev >= 1 && lev <= MAX_LEVERAGE)) throw new BinanceError(0, `Leverage must be between 1x and ${MAX_LEVERAGE}x.`);
  if (!(margin > 0)) throw new BinanceError(0, "Enter how much USDT to put in.");
  const base = String(b.symbol ?? "").replace(/^crypto:/, "").toUpperCase();
  if (!/^[A-Z0-9]{2,20}USDT$/.test(base)) throw new BinanceError(0, "Only crypto pairs priced in USDT can be traded on Binance futures.");
  const r = await rules(mode, base);
  const [stop, t1, t2] = [b.stop, b.target1, b.target2 ?? b.target1].map((x: unknown) => Number(x) * r.scale);
  const mark = Number((await call(mode, "GET", "/fapi/v1/premiumIndex", { symbol: r.sym }, false)).markPrice);
  const long = dir === "long";
  if (!(long ? stop < mark && t1 > mark : stop > mark && t1 < mark)) throw new BinanceError(0, `The price is now ${mark}, so the stop-loss or target is on the wrong side. Re-check the setup in Viko first.`);
  const stopFrac = Math.abs(mark - stop) / mark;
  if (stopFrac * lev >= 0.8) throw new BinanceError(0, `At ${lev}x, a move to your stop-loss would wipe out ${Math.round(stopFrac * lev * 100)}% of the margin, and Binance would liquidate you first. Use ${Math.max(1, Math.floor(0.7 / stopFrac))}x or less.`);

  const qty = floorTo(margin * lev / mark, r.step);
  if (Number(qty) < r.minQty || Number(qty) * mark < r.minNotional) throw new BinanceError(-4164, explain(400, -4164, ""));

  await call(mode, "POST", "/fapi/v1/marginType", { symbol: r.sym, marginType: "ISOLATED" }).catch((e) => { if (!(e instanceof BinanceError) || e.code !== -4046) throw e; });
  await call(mode, "POST", "/fapi/v1/leverage", { symbol: r.sym, leverage: lev });

  const side = long ? "BUY" : "SELL", exit = long ? "SELL" : "BUY";
  const filled = await call(mode, "POST", "/fapi/v1/order", { symbol: r.sym, side, type: "MARKET", quantity: qty, newOrderRespType: "RESULT" });
  const entry = Number(filled.avgPrice) || mark;
  const notes: string[] = [];

  // The stop-loss is mandatory. If Binance won't take it, close the position straight away.
  try {
    await call(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: r.sym, side: exit, type: "STOP_MARKET", triggerPrice: roundTo(stop, r.tick), closePosition: true, workingType: "MARK_PRICE", priceProtect: true });
  } catch (e) {
    await call(mode, "POST", "/fapi/v1/order", { symbol: r.sym, side: exit, type: "MARKET", quantity: qty, reduceOnly: true }).catch(() => {});
    await log(db, mode, { symbol: r.sym, dir, qty, entry, lev, margin, stop, t1, t2, status: "aborted", note: (e as Error).message, label: b.label, setup: b.setup, score: b.score });
    throw new BinanceError(0, `Binance would not accept the stop-loss, so Viko closed the position again right away. ${(e as Error).message}`);
  }
  const half = floorTo(Number(qty) / 2, r.step);
  try {
    if (Number(half) >= r.minQty && Number(half) * t1 >= r.minNotional) {
      await call(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: r.sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t1, r.tick), quantity: half, reduceOnly: true, workingType: "MARK_PRICE" });
      await call(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: r.sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t2, r.tick), closePosition: true, workingType: "MARK_PRICE" });
    } else {
      await call(mode, "POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: r.sym, side: exit, type: "TAKE_PROFIT_MARKET", triggerPrice: roundTo(t1, r.tick), closePosition: true, workingType: "MARK_PRICE" });
      notes.push("The position is too small to split, so all of it closes at target 1.");
    }
  } catch (e) { notes.push(`The stop-loss is in place, but a take-profit order failed: ${(e as Error).message} Set the targets in the Binance app.`); }

  await log(db, mode, { symbol: r.sym, dir, qty, entry, lev, margin, stop, t1, t2, status: "open", note: notes.join(" "), label: b.label, setup: b.setup, score: b.score });
  return { ok: true, mode, symbol: r.sym, dir, qty: Number(qty), entry, leverage: lev, margin, stop: Number(roundTo(stop, r.tick)), target1: Number(roundTo(t1, r.tick)), target2: Number(roundTo(t2, r.tick)), notes };
}

async function close(mode: Mode, b: any, db: ReturnType<typeof createClient>) {
  const sym = String(b.symbol ?? "").toUpperCase();
  if (!/^[A-Z0-9]{2,24}$/.test(sym)) throw new BinanceError(0, "Bad symbol.");
  await call(mode, "DELETE", "/fapi/v1/algoOpenOrders", { symbol: sym }).catch(() => {});
  await call(mode, "DELETE", "/fapi/v1/allOpenOrders", { symbol: sym }).catch(() => {});
  const p = (await call(mode, "GET", "/fapi/v3/positionRisk", { symbol: sym })).find((x: any) => Number(x.positionAmt) !== 0);
  if (!p) return { ok: true, note: "No open position on that market." };
  const amt = Number(p.positionAmt);
  const res = await call(mode, "POST", "/fapi/v1/order", { symbol: sym, side: amt > 0 ? "SELL" : "BUY", type: "MARKET", quantity: String(Math.abs(amt)), reduceOnly: true, newOrderRespType: "RESULT" });
  await log(db, mode, { symbol: sym, dir: amt > 0 ? "long" : "short", qty: String(Math.abs(amt)), entry: Number(p.entryPrice), lev: Number(p.leverage ?? 0), margin: 0, stop: 0, t1: 0, t2: 0, status: "closed", note: `Closed by you at ${res.avgPrice}, P/L about ${Number(p.unRealizedProfit).toFixed(2)} USDT.` });
  return { ok: true, exit: Number(res.avgPrice), pnl: Number(p.unRealizedProfit) };
}

async function log(db: ReturnType<typeof createClient>, mode: Mode, x: any) {
  await db.from("viko_live_orders").insert({ mode, symbol: x.symbol, dir: x.dir, qty: Number(x.qty), entry: x.entry, leverage: x.lev, margin: x.margin, stop: x.stop, target1: x.t1, target2: x.t2, status: x.status, note: x.note ?? null, label: x.label ?? null, setup: x.setup ?? null, score: x.score ?? null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop();
  if (route === "ping") return json({ region: Deno.env.get("SB_REGION") ?? null, ...(await status("demo").then((s) => ({ demoReachable: s.reachable, demoError: s.error ?? null }))), live: await call("live", "GET", "/fapi/v1/time", {}, false).then(() => "reachable", (e) => (e as Error).message) });
  if (!(await authed(req, db))) return json({ error: "Your app key is missing or wrong. Add it in Settings." }, 401);
  try {
    if (route === "status") return json(await status(url.searchParams.get("mode") === "live" ? "live" : "demo"));
    if (route === "history") { const { data } = await db.from("viko_live_orders").select("*").order("at", { ascending: false }).limit(50); return json({ rows: data }); }
    if (req.method !== "POST") return json({ error: "use POST" }, 405);
    const b = await req.json().catch(() => ({}));
    const mode: Mode = b.mode === "live" ? "live" : "demo";
    if (route === "order") return json(await order(mode, b, db));
    if (route === "close") return json(await close(mode, b, db));
    return json({ error: "not found" }, 404);
  } catch (e) {
    const be = e instanceof BinanceError ? e : null;
    return json({ error: (e as Error).message, code: be?.code ?? null }, be?.http === 412 ? 412 : 400);
  }
});
