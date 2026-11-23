import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4328);
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const errs = [];
const route = (pg) => pg.route(/supabase\.co|fonts\.|binance\.vision/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }));
// laptop
const lap = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
await lap.addInitScript(() => localStorage.setItem("viko:jkey", JSON.stringify("laptop-secret-key-123")));
lap.on("pageerror", (e) => errs.push(e.message)); await route(lap);
await lap.goto("http://localhost:4328/#analyse"); await lap.waitForTimeout(800);
await lap.getByRole("button", { name: "Settings" }).click();
await lap.getByRole("button", { name: "Set up my phone" }).click(); await lap.waitForTimeout(600);
console.log("QR shown:", await lap.locator(".phone-qr").isVisible());
await lap.getByRole("button", { name: "Show key" }).click();
console.log("key shown:", await lap.locator(".phone-key").innerText());
await lap.screenshot({ path: "/tmp/phone-setup.png" });
// phone opening the setup link
const ph = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
ph.on("pageerror", (e) => errs.push(e.message)); await route(ph);
await ph.goto("http://localhost:4328/#setup=" + encodeURIComponent("laptop-secret-key-123")); await ph.waitForTimeout(900);
console.log("phone saved key:", await ph.evaluate(() => localStorage.getItem("viko:jkey")), "| address now:", new URL(ph.url()).hash);
console.log("banner:", await ph.locator(".setup-note").innerText().catch(() => "none"));
console.log(errs.length ? "ERRORS " + errs.join(" | ") : "no page errors");
await b.close(); srv.close();
