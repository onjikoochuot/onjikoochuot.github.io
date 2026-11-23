import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4322);
const now = Date.now();
const row = (symbol, label, market, tf, dir, score, entry, stop, t1, t2) => ({ symbol, tf, label, market, price: entry, candle_t: Math.floor(now / 1000) - 60, scanned_at: new Date(now - 120000).toISOString(), verdict: "APPROVED", dir, score, hard_fail: false, triggered: true, rr1: Math.abs(t1 - entry) / Math.abs(entry - stop), news_warn: null,
  setup: { name: "Wave 3 entry", degree: "Minor degree", dir, entry, stop, invalidation: stop, target1: t1, target2: t2, score, verdict: "APPROVED", hardFail: false, triggered: true, rr1: 2.4, rr2: 3.8, expectBars: 6 } });
const rows = [row("crypto:SOLUSDT", "SOL/USDT", "Crypto", "15m", "long", 88, 140, 137.2, 146.7, 151)];
let sent = null;
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { localStorage.setItem("viko:jkey", JSON.stringify("test-key")); localStorage.setItem("viko:picksBar", "80"); });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => console.log("pageerror:", e.message));
await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
await pg.route(/supabase\.co/, (route) => {
  const u = new URL(route.request().url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  if (u.pathname.includes("viko-picks")) return json({ rows, now });
  if (u.pathname.endsWith("viko-binance/order")) { sent = { region: u.searchParams.get("forceFunctionRegion"), ...JSON.parse(route.request().postData()) }; return json({ ok: true, mode: "demo", symbol: "SOLUSDT", dir: "long", qty: 0.71, entry: 140.05, leverage: sent.leverage, margin: sent.margin, stop: 137.2, target1: 146.7, target2: 151, notes: [] }); }
  if (u.pathname.endsWith("/quotes")) return json({ quotes: { "crypto:SOLUSDT": { price: 140.1, change: 1 } } });
  return json({ ok: true, candles: [] });
});
await pg.goto("http://localhost:4322/#picks"); await pg.waitForTimeout(1500);
console.log("binance buttons:", await pg.locator(".bn-btn").count());
await pg.locator(".bn-btn").first().click(); await pg.waitForTimeout(400);
console.log("leverage:", await pg.locator(".bn-lev button").evaluateAll((bs) => bs.map((b) => b.textContent + (b.disabled ? "(off)" : ""))));
await pg.screenshot({ path: "/home/claude/shots/bn-ticket.png" });
await pg.locator(".bn-lev button", { hasText: "3x" }).click();
await pg.locator(".bn-ticket .btn.primary").click(); await pg.waitForTimeout(500);
console.log("sent:", JSON.stringify(sent));
console.log("result:", (await pg.locator(".bn-ticket").innerText()).slice(0, 160).replace(/\n/g, " | "));
await pg.screenshot({ path: "/home/claude/shots/bn-done.png" });
await b.close(); srv.close();
