// End-to-end checks of trade management: the real manager code for every broker and for paper,
// run against fake brokers that record every order. One price path per broker:
//   halfway to T1 → 80% of T1 → T1 filled → 60% of the way to T2 → broker closes on the trailing stop (or at T2).
// Long trade: entry 100, stop 95, T1 110, T2 120. Expected stops: 97.5 → 100 → 105.5 → 110.
// Run: deno test --allow-env --import-map=supabase/functions/tests/import_map.json supabase/functions/tests/managers.test.ts
// deno-lint-ignore-file no-explicit-any
function assert(ok: unknown, msg = "assertion failed"): asserts ok { if (!ok) throw new Error(msg); }
function assertEquals(a: unknown, b: unknown, msg = "") { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ? msg + ": " : ""}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertAlmostEquals(a: number, b: number, eps = 1e-7) { if (Math.abs(a - b) > eps) throw new Error(`expected ${b}, got ${a}`); }

Deno.env.set("BINANCE_DEMO_KEY", "k"); Deno.env.set("BINANCE_DEMO_SECRET", "s");
Deno.env.set("BYBIT_DEMO_KEY", "k"); Deno.env.set("BYBIT_DEMO_SECRET", "s");
Deno.env.set("METAAPI_TOKEN", "t"); Deno.env.set("METAAPI_ACCOUNT_DEMO", "acc");
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown() {} });
const auto: any = await import("../viko-auto/index.ts");
const paper: any = await import("../viko-paper/index.ts");

const J = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
function fakeDb(rows: Record<string, any> = {}) {
  const writes: any[] = [];
  const from = (table: string) => {
    const q: any = { table, op: "select", value: null, single: false };
    const b: any = {};
    for (const m of ["select", "eq", "in", "or", "gte", "lte", "neq", "order", "limit", "is"]) b[m] = () => b;
    b.maybeSingle = b.single = () => { q.single = true; return b; };
    for (const op of ["update", "insert", "upsert", "delete"]) b[op] = (v: any) => { q.op = op; q.value = v; writes.push(q); return b; };
    b.then = (r: any, j: any) => Promise.resolve({ data: q.op === "select" ? (q.single ? rows[table] ?? null : rows[`${table}[]`] ?? []) : q.op === "insert" ? { id: "new", ...(Array.isArray(q.value) ? {} : q.value) } : null, error: null, count: 0 }).then(r, j);
    return b;
  };
  return { from, writes, rpc: () => Promise.resolve({ data: [], error: null }) };
}
/** Apply the manager's updates to the position, like the database would. */
const apply = (db: any, p: any, table = "viko_auto_positions") => { for (const w of db.writes.splice(0)) if (w.table === table && w.op === "update") Object.assign(p, w.value); };
const alerts = (db: any) => db.writes.filter((w: any) => w.table === "viko_alerts").map((w: any) => w.value.kind);
const base = () => ({ id: "p1", plan_id: "plan", mode: "demo", label: "TEST", dir: "long", entry: 100, stop: 95, initial_stop: 95, target1: 110, target2: 120, qty: 10, stake: 100, t1_hit: false, peak: 100, leverage: 10, opened_at: new Date(Date.now() - 3600e3).toISOString(), status: "open", last_price: 100, last_pnl: 0 });

// ---------------------------------------------------------------- Binance
function binance(final: "stop" | "t2") {
  let id = 3;
  const w: any = { amt: 10, mark: 100, algos: [{ algoId: 1, orderType: "STOP_MARKET", triggerPrice: "95" }, { algoId: 2, orderType: "TAKE_PROFIT", triggerPrice: "110" }, { algoId: 3, orderType: "TAKE_PROFIT_MARKET", triggerPrice: "120" }], trades: [] as any[], log: [] as string[] };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(url), m = init?.method ?? "GET", q = u.searchParams;
    w.log.push(`${m} ${u.pathname}`);
    if (u.pathname === "/fapi/v3/positionRisk") return J(w.amt ? [{ positionAmt: String(w.amt), markPrice: String(w.mark), unRealizedProfit: String((w.mark - 100) * w.amt) }] : []);
    if (u.pathname === "/fapi/v1/openAlgoOrders") return J(w.algos);
    if (u.pathname === "/fapi/v1/algoOrder" && m === "DELETE") { w.algos = w.algos.filter((a: any) => String(a.algoId) !== q.get("algoId")); return J({}); }
    if (u.pathname === "/fapi/v1/algoOrder" && m === "POST") { w.algos.push({ algoId: ++id, orderType: q.get("type"), triggerPrice: q.get("triggerPrice") }); return J({ algoId: id }); }
    if (u.pathname === "/fapi/v1/algoOpenOrders") { w.algos = []; return J({}); }
    if (u.pathname === "/fapi/v1/userTrades") return J(w.trades);
    return J({});
  }) as typeof fetch;
  return { w, finish: () => {
    w.amt = 0;
    if (final === "stop") { w.algos = w.algos.filter((a: any) => a.orderType !== "STOP_MARKET"); w.trades = [{ time: 1, realizedPnl: "50", price: "110", commission: "0", commissionAsset: "USDT" }, { time: 2, realizedPnl: "50", price: "110", commission: "0", commissionAsset: "USDT" }]; w.mark = 125; /* last seen price misleads on purpose */ }
    else { w.algos = w.algos.filter((a: any) => a.orderType !== "TAKE_PROFIT_MARKET"); w.trades = [{ time: 1, realizedPnl: "50", price: "110", commission: "0", commissionAsset: "USDT" }, { time: 2, realizedPnl: "100", price: "120", commission: "0", commissionAsset: "USDT" }]; }
  } };
}
const bnStop = (w: any) => Number(w.algos.find((a: any) => a.orderType === "STOP_MARKET")?.triggerPrice);

Deno.test("Binance: stop trails 97.5 → 100 → 105.5 → 110, take-profit orders are kept, closes as trailing stop", async () => {
  const { w, finish } = binance("stop");
  const db = fakeDb(), p: any = { ...base(), broker: "binance", broker_symbol: "TESTUSDT", refs: { scale: 1, tick: 0.01 } };
  const step = async (mark: number) => { w.mark = mark; await auto.manageBinance(db, p, false); apply(db, p); };
  await step(105); assertEquals(bnStop(w), 97.5); assertEquals(p.stop, 97.5);
  assert(w.algos.some((a: any) => a.orderType === "TAKE_PROFIT_MARKET"), "target-2 order must stay");
  await step(108); assertEquals(bnStop(w), 100);
  w.amt = 5; w.algos = w.algos.filter((a: any) => a.algoId !== 2); // target 1 filled on Binance
  await step(111); assertEquals(p.t1_hit, true); assertEquals(bnStop(w), 105.5);
  await step(116); assertEquals(bnStop(w), 110);
  await step(114); assertEquals(bnStop(w), 110, "never moves backwards");
  assertEquals(w.algos.filter((a: any) => a.orderType === "STOP_MARKET").length, 1, "exactly one stop order at a time");
  await step(118); // last price Viko sees is near target 2, then the market reverses onto the stop
  finish(); await auto.manageBinance(db, p, false); apply(db, p);
  assertEquals(p.status, "closed"); assertEquals(p.close_reason, "trailing stop (profit locked)"); assertEquals(p.pnl, 100);
});

Deno.test("Binance: a run to target 2 is labelled target 2", async () => {
  const { w, finish } = binance("t2");
  const db = fakeDb(), p: any = { ...base(), broker: "binance", broker_symbol: "TESTUSDT", refs: { scale: 1, tick: 0.01 }, t1_hit: true, stop: 110, peak: 116, qty: 10 };
  w.amt = 5; w.mark = 118; await auto.manageBinance(db, p, false); apply(db, p);
  finish(); await auto.manageBinance(db, p, false); apply(db, p);
  assertEquals(p.close_reason, "target 2"); assertEquals(p.pnl, 150);
});

// ---------------------------------------------------------------- Bybit
function bybit(final: "stop" | "t2") {
  const w: any = { size: 10, mark: 100, stopLoss: 95, orders: ["tp1", "tp2"], closed: [] as any[], log: [] as string[] };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(url), m = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    w.log.push(`${m} ${u.pathname}`);
    const R = (result: unknown) => J({ retCode: 0, retMsg: "OK", result });
    if (u.pathname === "/v5/position/list") return R({ list: w.size ? [{ size: String(w.size), side: "Buy", avgPrice: "100", markPrice: String(w.mark), unrealisedPnl: String((w.mark - 100) * w.size), stopLoss: String(w.stopLoss) }] : [] });
    if (u.pathname === "/v5/position/trading-stop") { w.stopLoss = Number(body.stopLoss); return R({}); }
    if (u.pathname === "/v5/position/closed-pnl") return R({ list: w.closed });
    if (u.pathname === "/v5/order/realtime") return R({ list: w.orders.map((o: string) => ({ orderId: o, reduceOnly: true })) });
    return R({ list: [] });
  }) as typeof fetch;
  return { w, finish: () => {
    w.size = 0;
    // Bybit lists closed P/L newest first.
    if (final === "stop") w.closed = [{ closedPnl: "50", avgExitPrice: "110" }, { closedPnl: "50", avgExitPrice: "110" }];
    else w.closed = [{ closedPnl: "100", avgExitPrice: "120" }, { closedPnl: "50", avgExitPrice: "110" }];
  } };
}
Deno.test("Bybit: stop trails 97.5 → 100 → 105.5 → 110 and closes as trailing stop", async () => {
  const { w, finish } = bybit("stop");
  const db = fakeDb(), p: any = { ...base(), broker: "bybit", broker_symbol: "TESTUSDT", refs: { tick: 0.01, step: 0.001, opened_ms: Date.now() - 3600e3 } };
  const step = async (mark: number) => { w.mark = mark; await auto.manageBybit(db, p, false); apply(db, p); };
  await step(105); assertEquals(w.stopLoss, 97.5);
  await step(108); assertEquals(w.stopLoss, 100);
  w.size = 5; await step(111); assertEquals(p.t1_hit, true); assertEquals(w.stopLoss, 105.5);
  await step(116); assertEquals(w.stopLoss, 110);
  await step(118);
  finish(); await auto.manageBybit(db, p, false); apply(db, p);
  assertEquals(p.status, "closed"); assertEquals(p.close_reason, "trailing stop (profit locked)"); assertEquals(p.pnl, 100);
});
Deno.test("Bybit: a run to target 2 is labelled target 2", async () => {
  const { w, finish } = bybit("t2");
  const db = fakeDb(), p: any = { ...base(), broker: "bybit", broker_symbol: "TESTUSDT", refs: { tick: 0.01, opened_ms: Date.now() - 3600e3 }, t1_hit: true, stop: 110, peak: 116 };
  w.size = 5; w.mark = 118; await auto.manageBybit(db, p, false); apply(db, p);
  finish(); await auto.manageBybit(db, p, false); apply(db, p);
  assertEquals(p.close_reason, "target 2"); assertEquals(p.pnl, 150);
});

// ---------------------------------------------------------------- MT5 (MetaApi)
function mt5(final: "stop" | "t2") {
  const w: any = { mark: 100, legs: { A: { open: true, sl: 95, tp: 110, profit: 0, deals: [] as any[] }, B: { open: true, sl: 95, tp: 120, profit: 0, deals: [] as any[] } }, log: [] as string[] };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(url), m = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    w.log.push(`${m} ${u.pathname.split("/acc")[1]}`);
    if (u.pathname.endsWith("/positions")) return J(Object.entries(w.legs).filter(([, l]: any) => l.open).map(([id, l]: any) => ({ id, type: "POSITION_TYPE_BUY", volume: 0.5, openPrice: 100, currentPrice: w.mark, profit: (w.mark - 100) * 5, stopLoss: l.sl, takeProfit: l.tp })));
    if (u.pathname.endsWith("/trade")) { if (body.actionType === "POSITION_MODIFY") w.legs[body.positionId].sl = body.stopLoss; return J({ stringCode: "TRADE_RETCODE_DONE", numericCode: 10009 }); }
    const d = u.pathname.match(/history-deals\/position\/(\w+)$/);
    if (d) return J(w.legs[d[1]].deals);
    return J({});
  }) as typeof fetch;
  return { w, fillT1: () => { w.legs.A.open = false; w.legs.A.deals = [{ entryType: "DEAL_ENTRY_IN", price: 100, profit: 0 }, { entryType: "DEAL_ENTRY_OUT", price: 110, profit: 50 }]; },
    finish: () => { w.legs.B.open = false; w.legs.B.deals = final === "stop" ? [{ entryType: "DEAL_ENTRY_IN", price: 100, profit: 0 }, { entryType: "DEAL_ENTRY_OUT", price: 110, profit: 50 }] : [{ entryType: "DEAL_ENTRY_IN", price: 100, profit: 0 }, { entryType: "DEAL_ENTRY_OUT", price: 120, profit: 100 }]; } };
}
Deno.test("MT5: both legs trail 97.5 → 100, then the open leg 105.5 → 110, closes as trailing stop", async () => {
  const { w, fillT1, finish } = mt5("stop");
  const db = fakeDb(), p: any = { ...base(), broker: "mt5", broker_symbol: "EURUSDm", refs: { positions: [{ id: "A", role: "t1", vol: 0.5 }, { id: "B", role: "t2", vol: 0.5 }], digits: 2, opened_ms: Date.now() - 3600e3 } };
  const step = async (mark: number) => { w.mark = mark; await auto.manageMt5(db, p, false); apply(db, p); };
  await step(105); assertEquals([w.legs.A.sl, w.legs.B.sl], [97.5, 97.5]);
  await step(108); assertEquals([w.legs.A.sl, w.legs.B.sl], [100, 100]);
  fillT1(); await step(111); assertEquals(p.t1_hit, true); assertEquals(w.legs.B.sl, 105.5); assertEquals(w.legs.B.tp, 120, "target 2 kept");
  await step(116); assertEquals(w.legs.B.sl, 110);
  await step(118);
  finish(); await auto.manageMt5(db, p, false); apply(db, p);
  assertEquals(p.status, "closed"); assertEquals(p.close_reason, "trailing stop (profit locked)"); assertEquals(p.pnl, 100);
});
Deno.test("MT5: a run to target 2 is labelled target 2", async () => {
  const { w, fillT1, finish } = mt5("t2");
  const db = fakeDb(), p: any = { ...base(), broker: "mt5", broker_symbol: "EURUSDm", refs: { positions: [{ id: "A", role: "t1", vol: 0.5 }, { id: "B", role: "t2", vol: 0.5 }], digits: 2 }, t1_hit: true, stop: 110, peak: 116 };
  fillT1(); w.mark = 118; await auto.manageMt5(db, p, false); apply(db, p);
  finish(); await auto.manageMt5(db, p, false); apply(db, p);
  assertEquals(p.close_reason, "target 2"); assertEquals(p.pnl, 150);
});

// ---------------------------------------------------------------- Deriv (multipliers)
function deriv() {
  const w: any = { spot: 100, c: { 1: { sold: false, profit: 0, sl: 25, exit: 0 }, 2: { sold: false, profit: 0, sl: 25, exit: 0 } }, updates: [] as number[], sells: [] as number[] };
  const d = {
    poc: async (id: number) => { const c = w.c[id]; return { is_sold: c.sold ? 1 : 0, profit: c.sold ? c.profit : (w.spot - 100) * 5, current_spot: w.spot, exit_tick: c.sold ? c.exit : undefined, sell_spot: c.sold ? c.exit : undefined, multiplier: 10, buy_price: 50 }; },
    send: async (msg: any) => {
      if (msg.contract_update) { w.c[msg.contract_id].sl = msg.limit_order.stop_loss; w.updates.push(msg.limit_order.stop_loss); return {}; }
      if (msg.sell) { const c = w.c[msg.sell]; c.sold = true; c.exit = w.spot; c.profit = (w.spot - 100) * 5; w.sells.push(msg.sell); return {}; }
      return {};
    },
  };
  return { w, d };
}
Deno.test("Deriv: stop amount tightens, break-even, then Viko closes when price falls back to the locked level", async () => {
  const { w, d } = deriv();
  const db = fakeDb(), p: any = { ...base(), broker: "deriv", broker_symbol: "frxEURUSD", stake: 100, leverage: 10, refs: { contracts: [{ id: 1, role: "t1", stake: 50 }, { id: 2, role: "t2", stake: 50 }] } };
  const step = async (spot: number) => { w.spot = spot; await auto.manageDeriv(db, p, d, false); apply(db, p); };
  await step(105); assertEquals(p.stop, 97.5); assertEquals(w.c[1].sl, 12.5); assertEquals(w.c[2].sl, 12.5); // 50 × 10 × 2.5%
  await step(108); assertEquals(p.stop, 100); assertEquals(w.c[2].sl, 1);   // smallest Deriv loss (2% of the stake)
  w.c[1].sold = true; w.c[1].profit = 50; w.c[1].exit = 110;                // target 1 taken by Deriv
  await step(111); assertEquals(p.t1_hit, true); assertEquals(p.stop, 105.5);
  await step(116); assertEquals(p.stop, 110);
  await step(112); assertEquals(p.status, "open", "still above the locked stop");
  await step(109.5); assertEquals(w.sells, [2], "Viko sells the second contract itself");
  assertEquals(p.status, "closed"); assertEquals(p.close_reason, "trailing stop (profit locked)");
  assert(p.pnl > 0, `locked profit, got ${p.pnl}`);
});

// ---------------------------------------------------------------- Paper (hourly candles)
Deno.test("Paper: stop trails on 15-minute candles, half closes at target 1, the rest at the trailing stop", async () => {
  const open = Math.floor(Date.now() / 900e3) * 900 - 10 * 900 - 37; // opened mid-candle
  const first = Math.ceil(open / 900) * 900;
  const bars = [[99, 98, 99], [105, 101, 104.5], [108, 103, 107.5], [111, 106, 110.5], [116, 110.5, 115.5], [114, 109, 109.5]].map(([h, l, c], i) => [(first - 900 + i * 900) * 1000, l, h, l, c, 1000].map(String)); // the first candle started before the trade opened and must be skipped
  globalThis.fetch = (async (url: string) => (String(url).includes("/klines") ? J(bars) : J({}))) as typeof fetch;
  const db = fakeDb({ viko_paper_account: { id: "main", balance: 10000 } });
  const t: any = { id: "t1", symbol: "crypto:TESTUSDT", label: "TEST", tf: "15m", dir: "long", entry: 100, stop: 95, initial_stop: 95, target1: 110, target2: 120, qty: 5, qty_open: 5, t1_hit: false, realized: 0, status: "open", opened_at: new Date(open * 1000).toISOString(), last_checked: open, peak: 100 };
  await paper.manage(db, [t]);
  const stops = db.writes.filter((x: any) => x.table === "viko_paper_trades" && x.op === "update" && x.value.stop !== undefined && x.value.peak !== undefined).map((x: any) => x.value.stop);
  assertEquals(stops.slice(0, 4), [97.5, 100, 105.5, 110]);
  const closes = db.writes.filter((x: any) => x.table === "viko_paper_events" && x.op === "insert").map((x: any) => x.value.kind);
  assert(closes.includes("target1"), "half closed at target 1");
  assert(closes.includes("trailing"), "rest closed by the trailing stop");
  assertEquals(t.status, "closed");
  // Half at the 110 target (limit, no slippage) and half at the 110 stop (market order: 0.08% slippage), each minus the 0.05% fee.
  const stopFill = 110 * (1 - 0.0008);
  assertAlmostEquals(Number(t.realized), 2.5 * 10 - 2.5 * 110 * 0.0005 + 2.5 * (stopFill - 100) - 2.5 * stopFill * 0.0005, 1e-9);
  assert(Number(t.fees) > 0, "fees recorded");
});

Deno.test("Shorts mirror exactly (Binance)", async () => {
  const { w } = binance("stop");
  w.algos[0].triggerPrice = "105";
  const db = fakeDb(), p: any = { ...base(), broker: "binance", broker_symbol: "TESTUSDT", refs: { scale: 1, tick: 0.01 }, dir: "short", stop: 105, initial_stop: 105, target1: 90, target2: 80 };
  w.amt = -10;
  for (const [mark, want] of [[95, 102.5], [92, 100]] as const) { w.mark = mark; await auto.manageBinance(db, p, false); apply(db, p); assertEquals(bnStop(w), want); }
});

// ---------------------------------------------------------------- Waiting orders ("open when…")
function pendingWorld(price: number) {
  const w: any = { price, autoCalls: [] as any[] };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/ticker/24hr")) return J([{ symbol: "TESTUSDT", lastPrice: String(w.price), openPrice: "100" }]);
    if (u.includes("/klines")) return J([]);
    if (u.includes("viko-auto/start-pending")) { w.autoCalls.push({ key: (init?.headers as any)["x-viko-key"], body: JSON.parse(String(init?.body)) }); return J({ ok: true, placed: 1 }); }
    return J({});
  }) as typeof fetch;
  return w;
}
const waitRow = (o: any = {}) => ({ id: "w1", kind: "paper", symbol: "crypto:TESTUSDT", label: "TEST", market: "Crypto", tf: "1h", dir: "long", score: 82, name: "Wave 3", stop: 95, target1: 110, target2: 120, expect_bars: 4, wait_for: "price", level: 98, start_price: 101, min_score: 80, amount: 500, close_after_hours: 72, cfg: null, tip: "", status: "waiting", expires_at: new Date(Date.now() + 3600e3).toISOString(), ...o });
const pendingStatus = (db: any) => db.writes.filter((x: any) => x.table === "viko_pending" && x.value?.status).map((x: any) => x.value.status);

Deno.test("Waiting order: keeps waiting until the price dips to the chosen entry, then opens a paper trade", async () => {
  const w = pendingWorld(100);
  let db = fakeDb({ "viko_pending[]": [waitRow()], viko_paper_account: { id: "main", balance: 10000, risk_pct: 1 } });
  await paper.checkPending(db, "k");
  assertEquals(pendingStatus(db), [], "still waiting at 100");
  w.price = 97.9;
  db = fakeDb({ "viko_pending[]": [waitRow()], viko_paper_account: { id: "main", balance: 10000, risk_pct: 1 } });
  await paper.checkPending(db, "k");
  const ins = db.writes.find((x: any) => x.table === "viko_paper_trades" && x.op === "insert");
  assert(ins, "paper trade opened");
  assertEquals([ins.value.stop, ins.value.target1, ins.value.close_by !== null], [95, 110, true]);
  assertAlmostEquals(ins.value.qty * ins.value.entry, 500, 1e-6);
  assertEquals(pendingStatus(db), ["opened"]);
});

Deno.test("Waiting order: breakout entry above the price opens when the price rises to it", async () => {
  pendingWorld(102.5);
  const db = fakeDb({ "viko_pending[]": [waitRow({ level: 102, start_price: 100 })], viko_paper_account: { id: "main", balance: 10000, risk_pct: 1 } });
  await paper.checkPending(db, "k");
  assertEquals(pendingStatus(db), ["opened"]);
});

Deno.test("Waiting order: cancelled if the stop-loss is hit first, expired when time runs out", async () => {
  pendingWorld(94.9);
  let db = fakeDb({ "viko_pending[]": [waitRow()] });
  await paper.checkPending(db, "k");
  assertEquals(pendingStatus(db), ["cancelled"]);
  assert(!db.writes.some((x: any) => x.table === "viko_paper_trades"), "no trade");
  pendingWorld(100);
  db = fakeDb({ "viko_pending[]": [waitRow({ expires_at: new Date(Date.now() - 1000).toISOString() })] });
  await paper.checkPending(db, "k");
  assertEquals(pendingStatus(db), ["expired"]);
});

Deno.test("Waiting order: 'when Viko confirms' waits for an approved setup and uses its fresh stop and targets", async () => {
  pendingWorld(100);
  const row = waitRow({ wait_for: "confirm", level: null });
  (globalThis as any).__analyze = () => ({ setups: [{ dir: "long", hardFail: false, triggered: false, rr1: 2.5, verdict: "WATCH", score: 84, stop: 96, target1: 112, target2: 125, name: "Wave 3", degree: "Minor" }] });
  let db = fakeDb({ "viko_pending[]": [row], viko_paper_account: { id: "main", balance: 10000, risk_pct: 1 } });
  await paper.checkPending(db, "k");
  assertEquals(pendingStatus(db), [], "trigger not fired yet: keep waiting");
  (globalThis as any).__analyze = () => ({ setups: [{ dir: "long", hardFail: false, triggered: true, rr1: 2.5, verdict: "APPROVED", score: 84, stop: 96, target1: 112, target2: 125, name: "Wave 3", degree: "Minor" }] });
  db = fakeDb({ "viko_pending[]": [row], viko_paper_account: { id: "main", balance: 10000, risk_pct: 1 } });
  await paper.checkPending(db, "k");
  const ins = db.writes.find((x: any) => x.table === "viko_paper_trades" && x.op === "insert");
  assertEquals([ins?.value.stop, ins?.value.target1, ins?.value.score], [96, 112, 84]);
  (globalThis as any).__analyze = undefined;
});

Deno.test("Waiting order (real money): when the entry comes, the order goes to the broker through Auto-trade", async () => {
  const w = pendingWorld(97.5);
  const db = fakeDb({ "viko_pending[]": [waitRow({ kind: "real", amount: null, cfg: { broker: "binance", mode: "demo", amount: 50, risk: "balanced", alloc: "equal", horizon: "48h", strict: 65, custom: null, fallback: false } })] });
  await paper.checkPending(db, "cron-key");
  assertEquals(w.autoCalls.length, 1);
  assertEquals([w.autoCalls[0].key, w.autoCalls[0].body.broker, w.autoCalls[0].body.picks[0].stop, w.autoCalls[0].body.count], ["cron-key", "binance", 95, 1]);
  assertEquals(pendingStatus(db), ["opened"]);
});
