import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4327);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const mk = (symbol, label, market, tf, dir, score, e) => { const st = dir === "long" ? e * 0.97 : e * 1.03, t1 = dir === "long" ? e * 1.06 : e * 0.94, t2 = dir === "long" ? e * 1.1 : e * 0.9;
  return { symbol, label, market, tf, price: e, candle_t: Math.floor(now / 1000) - 300, scanned_at: iso(now - 4 * 60e3), verdict: "APPROVED", dir, score, hard_fail: false, triggered: true, rr1: 2, news_warn: null,
    setup: { name: "Wave 3 entry", degree: "Minor", dir, entry: e, stop: st, invalidation: st, target1: t1, target2: t2, score, verdict: "APPROVED", hardFail: false, triggered: true, rr1: 2, rr2: 3.3, expectBars: 6, edge: { ok: !String(symbol).endsWith("=X") && !String(symbol).startsWith("crypto:"), why: "test" } } }; };
const rows = [mk("yahoo:TGT", "TGT", "Stocks", "30m", "long", 93, 168.78), mk("yahoo:HD", "HD", "Stocks", "1d", "long", 87, 405.2), mk("yahoo:GC=F", "Gold", "Commodities", "1d", "long", 85, 4012.5)];
const opened = [];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
await ctx.addInitScript(() => { localStorage.setItem("viko:jkey", JSON.stringify("test-key")); localStorage.setItem("viko:picksBar", "80"); localStorage.setItem("viko:picksTab", JSON.stringify("top")); });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errs.push(e.message));
await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
await pg.route(/supabase\.co/, (route) => {
  const u = new URL(route.request().url());
  const json = (x) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
  if (u.pathname.endsWith("viko-picks/list")) return json({ rows, now });
  if (u.pathname.endsWith("viko-paper/state")) return json({ account: { balance: 10123.45, risk_pct: 1 }, open: [], closed: [], events: [], now });
  if (u.pathname.endsWith("viko-paper/open")) { const b = JSON.parse(route.request().postData()); opened.push(`${b.label}:${b.amount}`); return json({ trade: { id: "x" } }); }
  return json({ ok: true, rows: [], quotes: {}, candles: [] });
});
// 1. High performers: one row
await pg.goto("http://localhost:4327/#top"); await pg.waitForTimeout(1200);
await pg.locator(".opp").first().getByRole("button", { name: "Paper" }).click(); await pg.waitForTimeout(500);
await pg.locator(".rt-ticket input[aria-label=Amount]").fill("250"); await pg.waitForTimeout(200);
console.log("single ticket totals:", (await pg.locator(".rt-ticket .day-sum").innerText()).replace(/\s+/g, " "));
await pg.screenshot({ path: "/tmp/paper-ticket.png" });
await pg.locator(".rt-ticket .rt-actions .btn.primary").click(); await pg.waitForTimeout(600);
console.log("after OK:", await pg.locator(".rt-ticket .ok-msg").innerText());
await pg.locator(".rt-ticket .rt-actions .btn").first().click();
// 2. High performers: select all three, paper trade all, split equally
for (const i of [0, 1, 2]) await pg.locator(".opp-sel input").nth(i).check();
await pg.getByRole("button", { name: "Paper trade all" }).click(); await pg.waitForTimeout(500);
await pg.locator(".rt-ticket input[aria-label=Amount]").fill("300");
await pg.getByRole("radio", { name: "Split it equally" }).click();
await pg.locator(".rt-ticket .rt-actions .btn.primary").click(); await pg.waitForTimeout(800);
await pg.locator(".rt-ticket .rt-actions .btn").first().click();
// 3. Today's picks card
await pg.goto("http://localhost:4327/#picks"); await pg.waitForTimeout(1200);
await pg.locator(".card.pick").first().getByRole("button", { name: "Paper trade" }).click(); await pg.waitForTimeout(400);
console.log("picks ticket title:", await pg.locator("#pt-h").innerText());
console.log("opened on server:", opened.join(", "));
console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
await b.close(); srv.close();
