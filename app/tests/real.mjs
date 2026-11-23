import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4324);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const row = (symbol, label, market, tf, dir, score, e, st, t1, t2) => ({ symbol, label, market, tf, price: e, candle_t: Math.floor(now / 1000) - 600, scanned_at: iso(now - 5 * 60e3), verdict: "APPROVED", dir, score, hard_fail: false, triggered: true, rr1: 2.4, news_warn: null,
  setup: { name: "Wave 3 entry", degree: "Minor", dir, entry: e, stop: st, invalidation: st, target1: t1, target2: t2, score, verdict: "APPROVED", hardFail: false, triggered: true, rr1: 2.4, rr2: 4, expectBars: 6 } });
const rows = [row("yahoo:KO", "KO", "Stocks", "1h", "long", 96, 70, 68.6, 73.4, 75.1), row("yahoo:GC=F", "Gold", "Commodities", "1h", "long", 95, 3670, 3630, 3760, 3810), row("crypto:SOLUSDT", "SOL/USDT", "Crypto", "15m", "short", 97, 140, 142, 136, 133)];
const trade = (r, broker, sym, money, lev) => ({ symbol: r.symbol, label: r.label, market: r.market, tf: r.tf, dir: r.dir, score: r.score, agree: 0, against: 0, opinion: "", stance: "neutral", setup: "Wave 3 entry (Minor), 1h", broker, brokerSymbol: sym, below: false, entry: r.setup.entry, stop: r.setup.stop, target1: r.setup.target1, target2: r.setup.target2, money, leverage: lev, loss: 9.8, profit1: 12.4, profit2: 31.1, hours: [3.6, 9.6], newsAgainst: r.symbol === "yahoo:GC=F" });
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = [];
let sent = [];
for (const [name, vp] of [["desk", { width: 1400, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.addInitScript(() => { localStorage.setItem("viko:jkey", JSON.stringify("test-key")); localStorage.setItem("viko:picksBar", "95"); localStorage.setItem("viko:picksTab", JSON.stringify("top")); });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
  await pg.route(/supabase\.co/, (route) => {
    const u = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (u.pathname.endsWith("viko-picks/list")) return json({ rows, now });
    if (u.pathname.endsWith("viko-auto/preview") || u.pathname.endsWith("viko-auto/start")) {
      const c = JSON.parse(route.request().postData()); sent.push({ route: u.pathname.split("/").pop(), picks: c.picks?.map((p) => p.label), amount: c.amount, alloc: c.alloc, mode: c.mode });
      if (u.pathname.endsWith("start")) return json({ ok: true, plan_id: "p9", placed: c.picks.length, skipped: [] });
      const per = c.alloc === "each" ? c.amount : c.amount / c.picks.length;
      const ts = c.picks.map((p) => trade(rows.find((r) => r.symbol === p.symbol), p.market === "Crypto" ? "binance" : "binance", p.label.replace("/", ""), per, 5));
      return json({ trades: ts, skipped: [], total: c.amount, horizon: "until the targets or stop are hit", closeBy: now + 2 * 86400e3, connected: { binance: true, deriv: false } });
    }
    return json({ ok: true, candles: [], rows: [], quotes: {} });
  });
  await pg.goto("http://localhost:4324/#picks"); await pg.waitForTimeout(1500);
  await pg.locator(".pick-sel input").nth(0).check(); await pg.locator(".pick-sel input").nth(1).check();
  await pg.screenshot({ path: `/tmp/rt-${name}-picks.png` });
  await pg.locator(".sel-bar .btn.primary").click(); await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `/tmp/rt-${name}-ticket.png` });
  if (name === "desk") {
    await pg.locator(".rt-ticket input[aria-label=Amount]").fill("200"); await pg.waitForTimeout(1200);
    await pg.locator(".rt-ticket .bn-agree input").check();
    await pg.locator(".rt-actions .btn.primary").click(); await pg.waitForTimeout(800);
    await pg.screenshot({ path: `/tmp/rt-desk-done.png` });
    console.log("done text:", await pg.locator(".rt-ticket .ok-msg").innerText());
  }
  await ctx.close();
}
console.log("requests:", JSON.stringify(sent.slice(-3)));
console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
await b.close(); srv.close();
