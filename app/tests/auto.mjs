import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4323);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const preview = { horizon: "48 hours", money: 50, skipped: [], trades: [
  { symbol: "crypto:SOLUSDT", label: "SOL/USDT", market: "Crypto", tf: "1h", dir: "long", score: 88, agree: 3, against: 0, opinion: "Headlines lean positive; no big releases soon. The chart and the news agree, so a careful buyer can go ahead with the stop in place.", stance: "bullish", setup: "Wave 3 entry (Minor degree)", entry: 140.1, stop: 137.2, target1: 146.7, target2: 151, money: 50, leverage: 9, loss: 9.31, profit1: 10.6, profit2: 27.5, hours: [3.6, 9.6] },
  { symbol: "crypto:ETHUSDT", label: "ETH/USDT", market: "Crypto", tf: "2h", dir: "short", score: 86, agree: 1, against: 1, opinion: "Mixed news, leaning slightly negative.", stance: "neutral", setup: "Correction complete (Intermediate degree)", entry: 3100, stop: 3170, target1: 2950, target2: 2880, money: 50, leverage: 8, loss: 9.03, profit1: 9.68, profit2: 23.5, hours: [8, 21] }] };
const plan = { id: "p1", created_at: iso(now - 5 * 3600e3), broker: "binance", mode: "demo", amount: 100, count: 2, horizon: "48h", strict: 85, risk: "balanced", status: "active", ends_at: iso(now + 43 * 3600e3), enter_until: iso(now + 19 * 3600e3), closed_at: null };
const positions = [
  { id: "x1", plan_id: "p1", broker: "binance", mode: "demo", symbol: "crypto:SOLUSDT", label: "SOL/USDT", tf: "1h", dir: "long", setup: "", score: 88, opinion: null, stake: 50, leverage: 9, entry: 140.1, stop: 140.1, initial_stop: 137.2, target1: 146.7, target2: 151, t1_hit: true, status: "open", opened_at: iso(now - 5 * 3600e3), closed_at: null, pnl: null, close_reason: null, last_price: 148.2, last_pnl: 22.4 },
  { id: "x2", plan_id: "p1", broker: "binance", mode: "demo", symbol: "crypto:ETHUSDT", label: "ETH/USDT", tf: "2h", dir: "short", setup: "", score: 86, opinion: null, stake: 50, leverage: 8, entry: 3100, stop: 3170, initial_stop: 3170, target1: 2950, target2: 2880, t1_hit: false, status: "closed", opened_at: iso(now - 5 * 3600e3), closed_at: iso(now - 3600e3), pnl: -9.2, close_reason: "stop", last_price: 3171, last_pnl: -9.2 }];
const events = [{ id: 3, at: iso(now - 2 * 3600e3), plan_id: "p1", message: "SOL/USDT: target 1 hit, half taken as profit. Stop moved to the entry price, so the rest can't lose." }, { id: 2, at: iso(now - 3600e3), plan_id: "p1", message: "ETH/USDT closed (stop). Result: -9.2 USDT." }];
const hist = []; for (let i = 0; i < 14; i++) hist.push({ id: "h" + i, plan_id: "p0", broker: i % 3 ? "binance" : "deriv", mode: "demo", symbol: "crypto:BTCUSDT", label: ["BTC/USDT", "EUR/USD", "Gold"][i % 3], tf: "1h", dir: i % 2 ? "long" : "short", stake: 50, leverage: 5, entry: 1, pnl: [12.4, -6.1, 18.9, 4.2, -9.8, 22.1, 7.7][i % 7], close_reason: ["target 2", "stop", "target 1"][i % 3], opened_at: iso(now - (i + 1) * 3 * 86400e3), closed_at: iso(now - i * 3 * 86400e3), score: 85 });
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem("viko:jkey", JSON.stringify("test-key")));
const pg = await ctx.newPage();
pg.on("pageerror", (e) => console.log("pageerror:", e.message));
let started = null;
await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
await pg.route(/supabase\.co/, (route) => {
  const u = new URL(route.request().url());
  const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  if (u.pathname.endsWith("viko-auto/preview")) return json(preview);
  if (u.pathname.endsWith("viko-auto/start")) { started = JSON.parse(route.request().postData()); return json({ ok: true, plan_id: "p1", placed: 2, skipped: [] }); }
  if (u.pathname.endsWith("viko-auto/state")) return json({ plans: [plan], positions, events, now });
  if (u.pathname.endsWith("viko-auto/history")) return json({ rows: hist });
  return json({ ok: true, candles: [], rows: [] });
});
for (const t of ["start", "running", "results", "connect"]) {
  await pg.goto("http://localhost:4323/#auto"); await pg.evaluate((t) => localStorage.setItem("viko:autoTab", JSON.stringify(t)), t);
  await pg.reload(); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `/home/claude/shots/auto-${t}.png`, fullPage: true });
}
await pg.evaluate(() => localStorage.setItem("viko:autoTab", JSON.stringify("start"))); await pg.reload(); await pg.waitForTimeout(1200);
await pg.locator(".auto-btn").click(); await pg.waitForTimeout(600);
console.log("started with:", JSON.stringify(started), "|", await pg.locator(".ok-msg").innerText().catch(() => "no msg"));
await b.close(); srv.close();
