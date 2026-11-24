import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4331);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
// Finished paper trades across score bands
const syms = [["crypto:BTCUSDT", "BTC/USDT"], ["crypto:WIFUSDT", "WIF/USDT"], ["yahoo:GC=F", "Gold"], ["yahoo:EURUSD=X", "EUR/USD"]];
const reasons = ["target2", "trailing", "stop", "time", "stop"];
const trades = Array.from({ length: 23 }, (_, i) => { const [symbol, label] = syms[i % 4]; const score = [92, 85, 81, 74, 66][i % 5]; const realized = [12.4, 7.1, -9.8, 2.2, -10.4][i % 5];
  return { id: "p" + i, symbol, label, tf: ["15m", "1h"][i % 2], dir: "long", setup: "x", score, source: "manual", opened_at: iso(now - 9e7), closed_at: iso(now - i * 3e6), entry: 100, initial_stop: 97, qty: 3.33, realized, fees: 0.41, close_reason: reasons[i % 5] }; });
// Synthetic price history for the history test
function series(seed) { let p = 100, s = seed, c = []; const t0 = Math.floor(now / 1000) - 1000 * 3600; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1000; i++) { const o = p; p *= 1 + (rnd() - 0.48) * 0.02 + Math.sin(i / 40) * 0.004; c.push({ t: t0 + i * 3600, o, h: Math.max(o, p) * (1 + rnd() * 0.004), l: Math.min(o, p) * (1 - rnd() * 0.004), c: p, v: 1000 }); } return c; }
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = [];
for (const vp of [{ width: 1300, height: 950, name: "desk" }, { width: 390, height: 844, name: "phone" }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.addInitScript(() => { localStorage.setItem("viko:jkey", JSON.stringify("test-key")); });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision|wss?:/, (r) => r.abort());
  let seed = 7;
  await pg.route(/supabase\.co/, (route) => {
    const u = new URL(route.request().url());
    const json = (x) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(x) });
    if (u.pathname.endsWith("viko-paper/report")) return json({ trades, since: iso(now - 9e8) });
    if (u.pathname.endsWith("viko-auto/history")) return json({ rows: [{ id: "a", plan_id: "x", broker: "binance", mode: "demo", symbol: "crypto:BTCUSDT", label: "BTC/USDT", tf: "1h", dir: "long", stake: 50, leverage: 3, entry: 1, pnl: 4.2, close_reason: "target2", opened_at: iso(now - 9e6), closed_at: iso(now - 1e6), score: 84 }] });
    if (u.pathname.endsWith("/candles")) return json({ candles: series(seed++) });
    return json({ ok: true, rows: [], quotes: {}, candles: [] });
  });
  await pg.goto("http://localhost:4331/#record"); await pg.waitForTimeout(1500);
  if (vp.name === "desk") {
    console.log("summary:", (await pg.locator(".stats").first().innerText()).replace(/\s+/g, " "));
    console.log("bands:", (await pg.locator(".tr-table").first().innerText()).replace(/\t/g, " | ").split("\n").slice(0, 6).join("\n  "));
  }
  await pg.screenshot({ path: `/tmp/record-${vp.name}.png`, fullPage: true });
  if (vp.name === "desk") {
    await pg.getByRole("radio", { name: "Real money" }).click(); await pg.waitForTimeout(300);
    console.log("real:", (await pg.locator(".stats").first().innerText()).replace(/\s+/g, " "));
    await pg.getByRole("radio", { name: "Paper" }).click();
    const t0 = Date.now();
    await pg.getByRole("button", { name: "Run history test" }).click();
    await pg.waitForSelector(".tr-section:nth-of-type(2) .stats", { timeout: 120000 }).catch(() => {});
    await pg.waitForFunction(() => !document.body.innerText.includes("Testing…"), null, { timeout: 120000 });
    console.log(`history test took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const sec = pg.locator("section.card", { hasText: "History test:" }).first();
    console.log("history:", (await sec.locator(".stats").innerText()).replace(/\s+/g, " "));
    console.log("note:", await sec.locator(".ctx-note").innerText());
    await sec.screenshot({ path: "/tmp/record-history.png" });
  }
  await ctx.close();
}
console.log("page errors:", errs.length ? errs : "none");
await b.close(); srv.close();
