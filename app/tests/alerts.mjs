import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4326);
const settings = { events: { open: true, t1: true, close: true, limit: true }, accounts: { live: true, demo: true, paper: false }, push: { on: true, devices: [] }, telegram: { on: false, token: "", chat: "" }, whatsapp: { on: false, phone: "", apikey: "" }, email: { on: false, to: "", key: "" }, ntfy: { on: false, topic: "" }, discord: { on: false, url: "" }, slack: { on: false, url: "" } };
let limits = { on: false, money: null, trades: null, loss: null, closeOnLoss: false, applies: "live", tz: "Africa/Nairobi" };
const usage = { applies: true, money: 40, trades: 2, pnl: -12.5, lossHit: false, moneyLeft: 60, tradesLeft: 3 };
const sent = [];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem("viko:jkey", JSON.stringify("test-key")));
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errs.push(e.message));
await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
await pg.route(/supabase\.co/, (route) => {
  const u = new URL(route.request().url()), body = route.request().postData();
  const json = (x) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
  if (u.pathname.endsWith("viko-notify/settings")) { if (body) { sent.push(["save", JSON.parse(body)]); Object.assign(settings.telegram, JSON.parse(body).telegram ?? {}); } return json({ settings, recent: [{ id: 1, at: new Date().toISOString(), kind: "close", mode: "live", title: "Real money: KO closed +4.20 USDT", sent_at: new Date().toISOString(), result: { push: "sent to 1 device", telegram: "sent" } }], pushKey: "BJ62s904lyO0COcMJcSy3GQP-Cvws_TU_g4NNu9A8TAwvAooXYV_tAxAvEuwK5Ya-ex2Im_FvFiN2UU3w6NMzjM" }); }
  if (u.pathname.endsWith("viko-notify/test")) { sent.push(["test", JSON.parse(body)]); return json({ ok: true, results: { telegram: "sent" } }); }
  if (u.pathname.endsWith("viko-auto/limits")) { if (body) { limits = JSON.parse(body); sent.push(["limits", limits]); } return json({ limits, today: { demo: usage, live: usage } }); }
  if (u.pathname.endsWith("viko-auto/preview")) { sent.push(["preview-broker", JSON.parse(body).broker]); return json({ trades: [], skipped: [], total: 100, horizon: "48 hours", connected: { binance: false, deriv: false, bybit: false, mt5: false }, diag: { quality: 0, time: 0, broker: 0, news: 0, opinionDropped: 0, near: 0, examples: [] } }); }
  if (u.pathname.endsWith("viko-auto/markets")) return json({ total: 372, binance_live: 246, binance_demo: 122, deriv: 18, bybit: 88 });
  return json({ ok: true, rows: [], quotes: {}, candles: [] });
});
await pg.goto("http://localhost:4326/#alerts"); await pg.waitForTimeout(1200);
await pg.locator(".alert-card").filter({ hasText: "Telegram" }).locator("input[type=checkbox]").check();
await pg.getByLabel("Bot token").fill("123456:ABCDEF");
await pg.screenshot({ path: "/tmp/alerts.png", fullPage: true });
await pg.locator(".alert-card").filter({ hasText: "Telegram" }).getByRole("button", { name: "Send test" }).click(); await pg.waitForTimeout(600);
console.log("telegram result:", await pg.locator(".alert-card").filter({ hasText: "Telegram" }).locator(".pos-c").innerText().catch(() => "none"));
await pg.goto("http://localhost:4326/#auto"); await pg.evaluate(() => localStorage.setItem("viko:autoTab", JSON.stringify("start"))); await pg.reload(); await pg.waitForTimeout(1200);
const opts = await pg.locator(".auto-select option").allInnerTexts();
console.log("broker options:", opts.join(" | "));
await pg.locator(".auto-select").selectOption("mt5"); await pg.waitForTimeout(900);
await pg.getByRole("button", { name: "Set daily limits" }).click();
await pg.getByLabel("Use daily limits").check();
await pg.getByLabel("Most money to put into new trades per day").fill("100");
await pg.getByLabel("Stop for the day after losing").fill("30");
await pg.getByRole("button", { name: "Save limits" }).click(); await pg.waitForTimeout(500);
console.log("limits line:", (await pg.locator(".limits-head").innerText()).replace(/\s+/g, " "));
await pg.screenshot({ path: "/tmp/auto-limits.png" });
await pg.goto("http://localhost:4326/#brokers"); await pg.waitForTimeout(800);
await pg.getByRole("tab", { name: /MT5/ }).click(); await pg.waitForTimeout(400);
await pg.screenshot({ path: "/tmp/brokers-mt5.png" });
console.log("calls:", JSON.stringify(sent.map(([k, v]) => [k, k === "save" ? { telegram: v.telegram } : v])));
console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
await b.close(); srv.close();
