// supabase/functions/viko-notify/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// supabase/functions/viko-notify/push.ts
var b64u = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
var unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
var cat = (...a) => {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) {
    o.set(x, i);
    i += x.length;
  }
  return o;
};
var te = { encode: (x) => new TextEncoder().encode(x) };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
var vapid = null;
async function vapidKeysFrom(load2) {
  if (vapid) return vapid;
  if (Deno.env.get("VAPID_PUBLIC")) return vapid = { pub: Deno.env.get("VAPID_PUBLIC"), jwk: Deno.env.get("VAPID_PRIVATE_JWK") ?? "{}" };
  if (load2) vapid = await load2();
  return vapid;
}
async function vapidHeader(endpoint, load2) {
  const keys = await vapidKeysFrom(load2);
  const jwk = JSON.parse(keys?.jwk ?? "{}");
  const pub = keys?.pub ?? "";
  if (!jwk.d || !pub) throw new Error("Push keys are not set on the server.");
  const key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1e3) + 12 * 3600, sub: "mailto:alerts@viko.app" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}
async function encryptPush(sub, payload) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(te.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, cat(te.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// supabase/functions/viko-notify/index.ts
var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
var json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
var APP_URL = "https://onjikoochuot.github.io/";
var DEFAULTS = {
  events: { open: true, t1: true, close: true, limit: true },
  accounts: { live: true, demo: true, paper: false },
  push: { on: true, subs: [] },
  telegram: { on: false, token: "", chat: "" },
  whatsapp: { on: false, phone: "", apikey: "" },
  email: { on: false, to: "", key: "" },
  ntfy: { on: false, topic: "" },
  discord: { on: false, url: "" },
  slack: { on: false, url: "" }
};
var SECRET_FIELDS = [["telegram", "token"], ["whatsapp", "apikey"], ["email", "key"], ["discord", "url"], ["slack", "url"]];
var MASK = "\u2022\u2022\u2022\u2022";
async function load(db) {
  const { data } = await db.from("viko_settings").select("v").eq("k", "notify").maybeSingle();
  const v = data?.v ?? {};
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = { ...DEFAULTS[k], ...v[k] ?? {} };
  return out;
}
var save = (db, s) => db.from("viko_settings").upsert({ k: "notify", v: s, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
function masked(s) {
  const c = structuredClone(s);
  for (const [ch, f] of SECRET_FIELDS) {
    const v = String(c[ch][f] ?? "");
    c[ch][f] = v ? MASK + v.slice(-4) : "";
  }
  c.push = { on: s.push.on, devices: s.push.subs.map((x) => ({ endpoint: x.endpoint, ua: x.ua ?? "", added: x.added ?? "" })) };
  return c;
}
function merge(old, b) {
  const s = structuredClone(old);
  const str = (x, n = 500) => String(x ?? "").trim().slice(0, n);
  for (const k of ["events", "accounts"]) for (const e of Object.keys(s[k])) if (b?.[k] && e in b[k]) s[k][e] = !!b[k][e];
  for (const ch of ["push", "telegram", "whatsapp", "email", "ntfy", "discord", "slack"]) if (b?.[ch] && "on" in b[ch]) s[ch].on = !!b[ch].on;
  const set = (ch, f) => {
    if (!b?.[ch] || !(f in b[ch])) return;
    const v = str(b[ch][f]);
    if (!v.startsWith(MASK)) s[ch][f] = v;
  };
  set("telegram", "token");
  set("telegram", "chat");
  set("whatsapp", "phone");
  set("whatsapp", "apikey");
  set("email", "to");
  set("email", "key");
  set("ntfy", "topic");
  set("discord", "url");
  set("slack", "url");
  if (s.discord.url && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(s.discord.url)) throw new Error("That isn't a Discord webhook link (it starts with https://discord.com/api/webhooks/).");
  if (s.slack.url && !/^https:\/\/hooks\.slack\.com\//.test(s.slack.url)) throw new Error("That isn't a Slack webhook link (it starts with https://hooks.slack.com/).");
  if (s.ntfy.topic && !/^[A-Za-z0-9_-]{6,64}$/.test(s.ntfy.topic)) throw new Error("ntfy topic: 6 to 64 letters, numbers, - or _. Make it hard to guess.");
  if (s.whatsapp.phone) s.whatsapp.phone = s.whatsapp.phone.replace(/[^\d+]/g, "");
  return s;
}
var keysFromDb = (db) => async () => {
  const { data } = await db.from("viko_settings").select("v").eq("k", "vapid").maybeSingle();
  return data?.v?.pub ? { pub: String(data.v.pub), jwk: String(data.v.jwk) } : null;
};
async function webPush(sub, payload, db) {
  const body = await encryptPush(sub, payload);
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: await vapidHeader(sub.endpoint, keysFromDb(db)), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high" }, body });
  return { status: r.status, text: r.ok ? "" : (await r.text()).slice(0, 200) };
}
var emoji = (m) => m.kind === "close" ? Number(m.pnl) >= 0 ? "\u2705" : "\u{1F53B}" : m.kind === "open" ? "\u{1F4C8}" : m.kind === "t1" ? "\u{1F3AF}" : m.kind === "limit" ? "\u26D4" : "\u{1F514}";
var plain = (m) => `${emoji(m)} ${m.title}
${m.body}`;
async function ok(r, what) {
  if (!r.ok) throw new Error(`${what}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return "sent";
}
async function deliver(db, s, m, only) {
  const res = {};
  const want = (ch) => only ? only === ch : s[ch].on;
  const run = async (ch, f) => {
    try {
      res[ch] = await f();
    } catch (e) {
      res[ch] = `error: ${e.message}`;
    }
  };
  const jobs = [];
  if (want("push")) jobs.push(run("push", async () => {
    if (!s.push.subs.length) throw new Error("no phone or browser has switched on notifications yet");
    const dead = [];
    let sent = 0;
    const errs = [];
    await Promise.all(s.push.subs.map(async (sub) => {
      try {
        const r = await webPush(sub, JSON.stringify({ title: `${emoji(m)} ${m.title}`, body: m.body, url: `${APP_URL}#auto`, tag: `viko-${m.kind}-${Date.now()}` }), db);
        if (r.status === 404 || r.status === 410) dead.push(sub.endpoint);
        else if (r.status >= 300) errs.push(`${r.status} ${r.text}`);
        else sent++;
      } catch (e) {
        errs.push(e.message);
      }
    }));
    if (dead.length) {
      const fresh = await load(db);
      fresh.push.subs = fresh.push.subs.filter((x) => !dead.includes(x.endpoint));
      await save(db, fresh);
    }
    if (!sent) throw new Error(errs[0] ?? (dead.length ? "this device's notification permission has expired; switch it on again" : "not sent"));
    return `sent to ${sent} device${sent > 1 ? "s" : ""}`;
  }));
  if (want("telegram")) jobs.push(run("telegram", async () => {
    if (!s.telegram.token || !s.telegram.chat) throw new Error("add your bot token and chat id");
    return ok(await fetch(`https://api.telegram.org/bot${s.telegram.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: s.telegram.chat, text: plain(m), disable_web_page_preview: true }) }), "Telegram");
  }));
  if (want("whatsapp")) jobs.push(run("whatsapp", async () => {
    if (!s.whatsapp.phone || !s.whatsapp.apikey) throw new Error("add your WhatsApp number and CallMeBot key");
    const r = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(s.whatsapp.phone)}&text=${encodeURIComponent(plain(m))}&apikey=${encodeURIComponent(s.whatsapp.apikey)}`);
    const t = await r.text();
    if (!r.ok || /error|invalid|not/i.test(t.slice(0, 300)) && !/queued|sent/i.test(t)) throw new Error(`CallMeBot: ${t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)}`);
    return "sent";
  }));
  if (want("email")) jobs.push(run("email", async () => {
    if (!s.email.to || !s.email.key) throw new Error("add your email and Resend API key");
    return ok(await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.email.key}` }, body: JSON.stringify({ from: "Viko alerts <onboarding@resend.dev>", to: [s.email.to], subject: `${emoji(m)} ${m.title}`, text: `${m.body}

Open Viko: ${APP_URL}#auto` }) }), "Resend");
  }));
  if (want("ntfy")) jobs.push(run("ntfy", async () => {
    if (!s.ntfy.topic) throw new Error("add your ntfy topic");
    return ok(await fetch("https://ntfy.sh/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: s.ntfy.topic, title: `${emoji(m)} ${m.title}`, message: m.body, click: `${APP_URL}#auto`, priority: m.kind === "limit" || m.kind === "close" ? 4 : 3 }) }), "ntfy");
  }));
  if (want("discord")) jobs.push(run("discord", async () => {
    if (!s.discord.url) throw new Error("add your Discord webhook link");
    return ok(await fetch(s.discord.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: `**${emoji(m)} ${m.title}**
${m.body}` }) }), "Discord");
  }));
  if (want("slack")) jobs.push(run("slack", async () => {
    if (!s.slack.url) throw new Error("add your Slack webhook link");
    return ok(await fetch(s.slack.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `*${emoji(m)} ${m.title}*
${m.body}` }) }), "Slack");
  }));
  await Promise.all(jobs);
  return res;
}
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", te.encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function keyOk(req, db, k) {
  const given = req.headers.get("x-viko-key");
  if (!given) return false;
  const h = await sha(given);
  const { data } = await db.from("viko_config").select("v").eq("k", k);
  return (data ?? []).some((r) => r.v === h);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const rt = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  try {
    if (rt === "public-key") return json({ key: (await vapidKeysFrom(keysFromDb(db)))?.pub ?? "" });
    if (rt === "send") {
      if (!await keyOk(req, db, "cron_key")) return json({ error: "unauthorised" }, 401);
      const { data: rows, error } = await db.rpc("viko_claim_alerts", { n: 25 });
      if (error) throw error;
      if (!rows?.length) return json({ ok: true, sent: 0 });
      const s = await load(db);
      let sent = 0;
      for (const a of rows) {
        const wanted = s.events[a.kind] !== false && s.accounts[a.mode] !== false;
        const result = wanted ? await deliver(db, s, { title: a.title, body: a.body, kind: a.kind, pnl: a.pnl }) : { skipped: "switched off in your alert settings" };
        if (wanted) sent++;
        await db.from("viko_alerts").update({ sent_at: (/* @__PURE__ */ new Date()).toISOString(), result }).eq("id", a.id);
      }
      return json({ ok: true, sent });
    }
    if (!await keyOk(req, db, "journal_key")) return json({ error: "Your app key is missing or wrong. Add it in Settings." }, 401);
    if (rt === "settings" && req.method === "GET") {
      const { data: recent } = await db.from("viko_alerts").select("id,at,kind,mode,title,sent_at,result").order("id", { ascending: false }).limit(15);
      return json({ settings: masked(await load(db)), recent, pushKey: (await vapidKeysFrom(keysFromDb(db)))?.pub ?? "" });
    }
    if (req.method !== "POST") return json({ error: "use POST" }, 405);
    const b = await req.json().catch(() => ({}));
    if (rt === "settings") {
      const s = merge(await load(db), b);
      await save(db, s);
      return json({ ok: true, settings: masked(s) });
    }
    if (rt === "subscribe") {
      const sub = b.sub;
      if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "That device didn't give a valid push subscription." }, 400);
      const s = await load(db);
      s.push.subs = [...s.push.subs.filter((x) => x.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ua: String(b.ua ?? "").slice(0, 80), added: (/* @__PURE__ */ new Date()).toISOString() }].slice(-10);
      s.push.on = true;
      await save(db, s);
      return json({ ok: true, devices: s.push.subs.length });
    }
    if (rt === "unsubscribe") {
      const s = await load(db);
      s.push.subs = s.push.subs.filter((x) => x.endpoint !== b.endpoint);
      await save(db, s);
      return json({ ok: true });
    }
    if (rt === "test") {
      const s = await load(db);
      const only = b.channel ? String(b.channel) : void 0;
      const res = await deliver(db, s, { kind: "close", pnl: 12.5, title: "Test from Viko: EUR/USD closed +12.50 USD", body: "This is what a closing alert looks like: the market, the profit or loss, and why it closed (target 2)." }, only);
      if (!Object.keys(res).length) return json({ error: "Switch on at least one channel first." }, 400);
      return json({ ok: true, results: res });
    }
    if (rt === "telegram-find") {
      const s = await load(db);
      const token = b.token && !String(b.token).startsWith(MASK) ? String(b.token).trim() : s.telegram.token;
      if (!token) return json({ error: "Paste your bot token first." }, 400);
      const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
      const j = await r.json().catch(() => ({}));
      if (!j.ok) return json({ error: `Telegram said: ${j.description ?? r.status}. Check the bot token.` }, 400);
      const chats = /* @__PURE__ */ new Map();
      for (const u of j.result ?? []) {
        const c = u.message?.chat ?? u.channel_post?.chat;
        if (c) chats.set(String(c.id), c.username ? `@${c.username}` : c.title ?? c.first_name ?? String(c.id));
      }
      if (!chats.size) return json({ error: "No messages yet. Open your bot in Telegram, press Start (or send it any message), then try again." }, 400);
      const [chat, who] = [...chats.entries()].pop();
      s.telegram.token = token;
      s.telegram.chat = chat;
      s.telegram.on = true;
      await save(db, s);
      return json({ ok: true, chat, who, settings: masked(s) });
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
});
