import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4334);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const base = { tf: "1h", dir: "long", score: 84, name: "Wave 3", stop: 97, target1: 106, target2: 110, wait_for: "price", min_score: 80, close_after_hours: null, note: null, created_at: iso(now - 3e6), expires_at: iso(now + 50 * 3600e3), done_at: null, start_price: 100, ask_minutes: 60, no_answer: "wait" };
const list = [
  { ...base, id: "a1", kind: "paper", symbol: "crypto:SOLUSDT", label: "SOL/USDT", level: 101, amount: 300, cfg: null, status: "asking", ask_first: true, ask_until: iso(now + 42 * 60e3), ask_price: 101.05, last_price: 101.2, ask_levels: { stop: 97, target1: 106, target2: 110, score: 84, name: "Wave 3" } },
  { ...base, id: "a2", kind: "real", symbol: "crypto:ETHUSDT", label: "ETH/USDT", level: 1700, amount: null, cfg: { broker: "bybit", mode: "live", amount: 40 }, stop: 1650, target1: 1800, target2: 1850, status: "asking", ask_first: true, ask_until: iso(now + 12 * 60e3), ask_price: 1701, last_price: 1702, ask_levels: { stop: 1650, target1: 1800, target2: 1850, score: 82, name: "Wave 3" } },
  { ...base, id: "w1", kind: "paper", symbol: "crypto:XRPUSDT", label: "XRP/USDT", level: 0.5, amount: 200, cfg: null, stop: 0.48, target1: 0.55, target2: 0.6, status: "waiting", ask_first: false, ask_until: null, ask_price: null, last_price: 0.51, ask_levels: null },
];
const calls = [];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
await ctx.addInitScript(() => { localStorage.setItem("viko:jkey", JSON.stringify("test-key")); localStorage.setItem("viko:hpFilters", JSON.stringify({ readyOnly: false })); });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errs.push(e.message));
await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
await pg.route(/supabase\.co/, (route) => {
  const u = new URL(route.request().url());
  const json = (x, s = 200) => route.fulfill({ status: s, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
  const body = () => JSON.parse(route.request().postData() || "{}");
  if (u.pathname.endsWith("viko-paper/state")) return json({ account: { balance: 10000, risk_pct: 1, starting_balance: 10000, auto_tfs: [], watchlist: [] }, open: [], closed: [], events: [], now });
  if (u.pathname.endsWith("viko-paper/pending-list")) return json({ waiting: list.filter((o) => ["waiting", "asking"].includes(o.status)), recent: list.filter((o) => !["waiting", "asking"].includes(o.status)) });
  if (u.pathname.endsWith("viko-paper/pending-approve")) { const x = body(); calls.push(["approve", x]); const o = list.find((o) => o.id === x.id); o.status = "opened"; o.note = `Approved by you. Opened at 101.2 with $${x.amount}.`; o.done_at = iso(Date.now()); return json({ ok: true, note: `Entry reached: opened at 101.20 with $${Number(x.amount).toFixed(2)}.` }); }
  if (u.pathname.endsWith("viko-paper/pending-skip")) { const x = body(); calls.push(["skip", x]); const o = list.find((o) => o.id === x.id); o.status = "skipped"; o.note = "Skipped by you, nothing traded."; o.done_at = iso(Date.now()); return json({ ok: true }); }
  if (u.pathname.endsWith("viko-paper/pending-edit")) { const x = body(); calls.push(["edit", x]); const o = list.find((o) => o.id === x.id); if (x.amount) o.amount = x.amount; if (x.askFirst !== undefined) o.ask_first = x.askFirst; return json({ pending: o }); }
  return json({ ok: true, rows: [], quotes: {}, candles: [], plans: [], positions: [], events: [] });
});
await pg.goto("http://localhost:4334/#analyse"); await pg.waitForTimeout(1500);
console.log("banner:", await pg.locator(".ask-banner").innerText());
await pg.locator(".ask-banner button").click(); await pg.waitForTimeout(1200);
console.log("view:", await pg.evaluate(() => location.hash));
const card = pg.locator(".ask-card", { hasText: "SOL/USDT" });
await card.locator("input[aria-label='Amount to trade']").fill("450"); await pg.waitForTimeout(200);
console.log("figures at $450:", (await card.locator(".ask-figs").innerText()).replace(/\s+/g, " "));
await pg.locator(".waiting").screenshot({ path: "/tmp/ask-paper.png" });
await card.getByRole("button", { name: /Approve/ }).click(); await pg.waitForTimeout(500);
console.log("approved:", await card.locator(".ok-msg").innerText());
// change the waiting XRP order's amount and switch on ask-first
const row = pg.locator(".wait-list li", { hasText: "XRP/USDT" });
await row.getByRole("button", { name: "Change" }).click();
await row.locator("input[aria-label='New amount']").fill("125");
await row.getByRole("button", { name: "Save" }).click(); await pg.waitForTimeout(500);
await pg.locator(".wait-list li", { hasText: "XRP/USDT" }).locator("input[type=checkbox]").check(); await pg.waitForTimeout(500);
console.log("xrp row:", (await pg.locator(".wait-list li", { hasText: "XRP/USDT" }).locator(".wait-ctl").innerText()).replace(/\s+/g, " "));
// Real money card on My trades: approve needs the risk tick
await pg.goto("http://localhost:4334/#trades"); await pg.waitForTimeout(1500);
const eth = pg.locator(".ask-card", { hasText: "ETH/USDT" });
const appr = eth.getByRole("button", { name: /Approve/ });
console.log("live approve disabled before tick:", await appr.isDisabled());
await eth.locator("input[aria-label='Amount to trade']").fill("25");
await eth.locator(".bn-agree input").check();
console.log("enabled after tick:", !(await appr.isDisabled()), "| label:", await appr.innerText());
await eth.screenshot({ path: "/tmp/ask-real.png" });
await eth.getByRole("button", { name: "Skip" }).click(); await pg.waitForTimeout(500);
console.log("calls:", JSON.stringify(calls));
// phone
await pg.setViewportSize({ width: 390, height: 844 });
await pg.goto("http://localhost:4334/#paper"); await pg.waitForTimeout(1200);
await pg.screenshot({ path: "/tmp/ask-phone.png", fullPage: false });
console.log("page errors:", errs.length ? errs : "none");
await b.close(); srv.close();
