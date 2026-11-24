import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4333);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const mk = (symbol, label, market, tf, dir, score, e, trig) => { const st = e * 0.97, t1 = e * 1.06, t2 = e * 1.1, entry = trig ? e : e * 1.01;
  return { symbol, label, market, tf, price: e, candle_t: Math.floor(now / 1000) - 300, scanned_at: iso(now - 4 * 60e3), verdict: trig ? "APPROVED" : "WATCH", dir, score, hard_fail: false, triggered: trig, rr1: 2, news_warn: null,
    setup: { name: "Wave 3 entry", degree: "Minor", dir, entry, stop: st, invalidation: st, target1: t1, target2: t2, score, verdict: trig ? "APPROVED" : "WATCH", hardFail: false, triggered: trig, rr1: 2, rr2: 3.3, expectBars: 6 } }; };
const rows = [mk("crypto:SOLUSDT", "SOL/USDT", "Crypto", "1h", "long", 86, 100, false), mk("yahoo:GC=F", "Gold", "Commodities", "1h", "long", 88, 4000, true)];
const sent = [];
const pending = [];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
await ctx.addInitScript(() => { localStorage.setItem("viko:jkey", JSON.stringify("test-key")); localStorage.setItem("viko:picksBar", "80"); localStorage.setItem("viko:hpFilters", JSON.stringify({ readyOnly: false })); localStorage.setItem("viko:realTrade", JSON.stringify({ broker: "binance", mode: "demo", amount: 40 })); });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errs.push(e.message));
await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
await pg.route(/supabase\.co/, (route) => {
  const u = new URL(route.request().url());
  const json = (x, s = 200) => route.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
  if (u.pathname.endsWith("viko-picks/list")) return json({ rows, now });
  if (u.pathname.endsWith("viko-paper/state")) return json({ account: { balance: 10000, risk_pct: 1, starting_balance: 10000, auto_tfs: [], watchlist: [] }, open: [], closed: [], events: [], now });
  if (u.pathname.endsWith("viko-paper/pending-add")) { const b = JSON.parse(route.request().postData()); sent.push(b);
    pending.push({ id: "w" + pending.length, kind: b.kind, symbol: b.pick.symbol, label: b.pick.label, tf: b.pick.tf, dir: b.pick.dir, score: b.pick.score, name: b.pick.name, stop: b.pick.stop, target1: b.pick.target1, target2: b.pick.target2, wait_for: b.waitFor, level: b.level, start_price: 100, min_score: 80, amount: b.amount ?? null, close_after_hours: null, cfg: b.cfg ?? null, status: "waiting", note: null, created_at: iso(now), expires_at: iso(now + b.hours * 3600e3), done_at: null, last_price: 100 });
    return json({ pending: {} }); }
  if (u.pathname.endsWith("viko-paper/pending-list")) return json({ waiting: pending.filter((p) => p.status === "waiting"), recent: [{ ...pending[0] ?? {}, id: "old", label: "ETH/USDT", status: "cancelled", note: "The price reached the stop-loss level before the entry, so nothing was traded.", done_at: iso(now - 3e6) }] });
  if (u.pathname.endsWith("viko-paper/pending-cancel")) { const id = JSON.parse(route.request().postData()).id; pending.find((p) => p.id === id).status = "cancelled"; return json({ ok: true }); }
  if (u.pathname.endsWith("viko-auto/preview")) return json({ trades: [], skipped: [], connected: { binance: true, deriv: false, bybit: false, mt5: false }, limits: null, closeBy: null });
  return json({ ok: true, rows: [], quotes: {}, candles: [], plans: [], positions: [], events: [] });
});
await pg.goto("http://localhost:4333/#top"); await pg.waitForTimeout(1500);
const solRow = pg.locator(".opp", { hasText: "SOL/USDT" });
console.log("SOL buttons:", await solRow.locator(".opp-act").innerText());
await solRow.getByRole("button", { name: "Paper (wait)" }).click(); await pg.waitForTimeout(400);
console.log("default mode:", await pg.locator(".wto [role=radio][aria-checked=true]").first().innerText(), "| level:", await pg.locator(".wto input[aria-label='Entry price to wait for']").inputValue());
console.log("hint:", await pg.locator(".wto small").first().innerText());
await pg.locator(".rt-ticket input[aria-label=Amount]").fill("300");
await pg.screenshot({ path: "/tmp/wait-paper.png" });
await pg.locator(".rt-ticket .rt-actions .btn.primary").click(); await pg.waitForTimeout(500);
console.log("paper done:", await pg.locator(".rt-ticket .ok-msg").innerText());
await pg.locator(".rt-ticket .rt-actions .btn").first().click();
// Real money, 'when Viko confirms'
await solRow.getByRole("button", { name: "Real (wait)" }).click(); await pg.waitForTimeout(800);
await pg.locator(".wto").getByRole("radio", { name: "When Viko confirms" }).click();
await pg.locator(".wto").getByRole("radio", { name: "1 week" }).click();
await pg.locator(".wto").screenshot({ path: "/tmp/wait-real.png" });
await pg.locator(".rt-ticket .rt-actions .btn.primary").click(); await pg.waitForTimeout(500);
console.log("real done:", (await pg.locator(".rt-ticket .ok-msg").innerText()).slice(0, 160));
console.log("sent:", JSON.stringify(sent.map((s) => ({ kind: s.kind, waitFor: s.waitFor, level: s.level, hours: s.hours, amount: s.amount, cfg: s.cfg && { broker: s.cfg.broker, mode: s.cfg.mode, amount: s.cfg.amount } }))));
await pg.locator(".rt-ticket .rt-actions .btn").first().click();
// Gold is ready: its ticket defaults to Now
await pg.locator(".opp", { hasText: "Gold" }).getByRole("button", { name: "Paper", exact: true }).click(); await pg.waitForTimeout(300);
console.log("gold default:", await pg.locator(".wto [role=radio][aria-checked=true]").first().innerText());
await pg.keyboard.press("Escape");
// Lists
await pg.goto("http://localhost:4333/#trades"); await pg.waitForTimeout(1200);
console.log("my trades waiting:", (await pg.locator(".waiting").innerText()).replace(/\s+/g, " ").slice(0, 260));
await pg.locator(".waiting").getByRole("button", { name: "Cancel" }).click(); await pg.waitForTimeout(600);
console.log("after cancel, real waiting orders shown:", await pg.locator(".waiting .wait-top").count());
await pg.goto("http://localhost:4333/#paper"); await pg.waitForTimeout(1200);
await pg.locator(".waiting").screenshot({ path: "/tmp/wait-list.png" });
console.log("paper waiting:", (await pg.locator(".waiting").innerText()).replace(/\s+/g, " ").slice(0, 200));
console.log("page errors:", errs.length ? errs : "none");
await b.close(); srv.close();
