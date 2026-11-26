import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4325);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const mk = (symbol, label, market, tf, dir, score, e, verdict = "APPROVED", triggered = true) => { const st = dir === "long" ? e * 0.98 : e * 1.02, t1 = dir === "long" ? e * 1.05 : e * 0.95, t2 = dir === "long" ? e * 1.08 : e * 0.92;
  return { symbol, label, market, tf, price: e, candle_t: Math.floor(now / 1000) - 300, scanned_at: iso(now - 4 * 60e3), verdict, dir, score, hard_fail: false, triggered, rr1: 2.5, news_warn: symbol === "yahoo:EURUSD=X" ? `CPI (USD) is due ${iso(now + 2 * 3600e3)}` : null,
    setup: { name: "Wave 3 entry", degree: "Minor", dir, entry: e, stop: st, invalidation: st, target1: t1, target2: t2, score, verdict, hardFail: false, triggered, rr1: 2.5, rr2: 4, expectBars: 6, edge: { ok: !String(symbol).endsWith("=X") && !String(symbol).startsWith("crypto:"), why: "test" } } }; };
const rows = [mk("yahoo:KO", "KO", "Stocks", "1h", "long", 96, 70), mk("yahoo:KO", "KO", "Stocks", "4h", "long", 88, 70), mk("yahoo:GC=F", "Gold", "Commodities", "4h", "long", 92, 3670), mk("crypto:SOLUSDT", "SOL/USDT", "Crypto", "15m", "short", 84, 140),
  mk("yahoo:EURUSD=X", "EUR/USD", "Forex", "1h", "short", 81, 1.09), mk("yahoo:NVDA", "NVDA", "Stocks", "1d", "long", 78, 165, "WATCH"), mk("crypto:ETHUSDT", "ETH/USDT", "Crypto", "2h", "long", 90, 1775, "WATCH", false), mk("yahoo:SPY", "SPY", "Indices", "1w", "long", 74, 723, "WATCH")];
// synthetic candles for the live scan
const candles = []; let p = 100; for (let i = 0; i < 400; i++) { const o = p; p = p * (1 + Math.sin(i / 9) * 0.01 + 0.001); candles.push({ t: 1.7e9 + i * 3600, o, h: Math.max(o, p) * 1.003, l: Math.min(o, p) * 0.997, c: p, v: 1000 + (i % 7) * 100 }); }
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = []; const reals = [];
for (const [name, vp] of [["desk", { width: 1400, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.addInitScript(() => localStorage.setItem("viko:jkey", JSON.stringify("test-key")));
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
  await pg.route(/supabase\.co/, (route) => {
    const u = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (u.pathname.endsWith("viko-picks/list")) return json({ rows, now });
    if (u.pathname.endsWith("/candles")) return json({ candles });
    if (u.pathname.endsWith("viko-auto/preview")) { const c = JSON.parse(route.request().postData()); reals.push(c.picks.map((x) => `${x.label} ${x.tf}`)); return json({ trades: [], skipped: ["(mock)"], total: 0, horizon: "", connected: { binance: false, deriv: false } }); }
    return json({ ok: true, rows: [], quotes: {} });
  });
  await pg.goto("http://localhost:4325/#top"); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `/tmp/hp-${name}.png`, fullPage: name === "desk" });
  if (name === "desk") {
    console.log("rows at 80%+ ready, best per market:", await pg.locator(".opp").count());
    await pg.getByRole("radio", { name: "70%+" }).click(); await pg.locator(".opp-checks input").first().uncheck(); await pg.waitForTimeout(300);
    console.log("rows at 70%+ incl. waiting:", await pg.locator(".opp").count());
    await pg.getByRole("radio", { name: /^Stocks/ }).click(); await pg.waitForTimeout(300);
    console.log("stocks rows:", await pg.locator(".opp").count());
    await pg.getByRole("radio", { name: /^All/ }).first().click(); await pg.locator(".opp-checks input").first().check();
    await pg.locator(".opp-sel input").nth(0).check(); await pg.locator(".opp-sel input").nth(1).check(); await pg.waitForTimeout(200);
    await pg.screenshot({ path: `/tmp/hp-desk-sel.png` });
    await pg.locator(".sel-bar .btn.primary").click(); await pg.waitForTimeout(1200);
    console.log("real-money ticket opened for:", JSON.stringify(reals.at(-1)));
    await pg.goto("http://localhost:4325/#scan"); await pg.waitForTimeout(800);
    await pg.getByRole("button", { name: "Scan now" }).click(); await pg.waitForTimeout(4000);
    console.log("scan summary:", await pg.locator(".scan-sum").innerText());
    await pg.screenshot({ path: `/tmp/scan-desk.png` });
  }
  await ctx.close();
}
console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
await b.close(); srv.close();
