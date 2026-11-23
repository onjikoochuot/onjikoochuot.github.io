import { useEffect, useState } from "react";
import { notify, type NotifySettings, type SentAlert } from "../lib/api";

type Ch = "telegram" | "whatsapp" | "email" | "ntfy" | "discord" | "slack";
const keyBytes = (b64: string) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
const device = () => { const u = navigator.userAgent; return `${/iPhone|iPad/.test(u) ? "iPhone/iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "Computer"} · ${/Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "browser"}`; };

/** Where trade alerts go: this phone or computer, Telegram, WhatsApp, email, ntfy, Discord, Slack. */
export default function Alerts({ appKey, onNeedKey }: { appKey: string; onNeedKey: () => void }) {
  const [s, setS] = useState<NotifySettings | null>(null);
  const [recent, setRecent] = useState<SentAlert[]>([]);
  const [pushKey, setPushKey] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const load = () => notify.get(appKey).then((j) => { setS(j.settings); setRecent(j.recent ?? []); setPushKey(j.pushKey); setDirty(false); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { if (appKey) load(); }, [appKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!appKey) return <section className="view"><header className="view-head"><div><h2>Alerts</h2></div></header><p className="err">Add your app key in Settings first. <button className="link" onClick={onNeedKey}>Open Settings</button></p></section>;
  if (!s) return <section className="view"><header className="view-head"><div><h2>Alerts</h2></div></header>{err ? <p className="err">{err}</p> : <p className="muted">Loading…</p>}</section>;

  const set = <K extends keyof NotifySettings>(k: K, v: Partial<NotifySettings[K]>) => { setS({ ...s, [k]: { ...s[k], ...v } }); setDirty(true); };
  const say = (k: string, v: string) => setNote((n) => ({ ...n, [k]: v }));
  const save = async () => { setBusy("save"); setErr(""); try { const { push: _p, ...rest } = s; const j = await notify.save(appKey, { ...rest, push: { on: s.push.on } }); setS(j.settings); setDirty(false); say("save", "Saved."); } catch (e) { setErr((e as Error).message); } setBusy(""); };
  const test = async (ch: string) => {
    setBusy(ch); say(ch, "Sending…");
    try { if (dirty) await save(); const j = await notify.test(appKey, ch); say(ch, j.results[ch] ?? "sent"); } catch (e) { say(ch, (e as Error).message); }
    setBusy("");
  };
  const pushOn = async () => {
    setBusy("push"); say("push", "");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error(/iPhone|iPad/.test(navigator.userAgent) ? "On iPhone, first add Viko to your Home Screen (Share → Add to Home Screen), open it from there, then try again." : "This browser can't receive notifications. Try Chrome, Edge or Firefox.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifications are blocked for Viko. Allow them in your browser's site settings, then try again.");
      if (!pushKey) throw new Error("The server's notification key isn't ready yet.");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) });
      await notify.subscribe(appKey, sub.toJSON(), device());
      await load();
      say("push", "This device will now get trade alerts. Sending a test…");
      const j = await notify.test(appKey, "push"); say("push", j.results.push ?? "sent");
    } catch (e) { say("push", (e as Error).message); }
    setBusy("");
  };
  const findTelegram = async () => {
    setBusy("tg"); say("telegram", "");
    try { if (dirty) await save(); const j = await notify.telegramFind(appKey, s.telegram.token); setS(j.settings); say("telegram", `Found your chat (${j.who}). Now press Send test.`); } catch (e) { say("telegram", (e as Error).message); }
    setBusy("");
  };
  const result = (k: string) => note[k] ? <p className={`sub ${/^(sent|Found|Saved|This device)/.test(note[k]) ? "pos-c" : /Sending/.test(note[k]) ? "" : "neg"}`}>{note[k]}</p> : null;
  const Toggle = ({ ch, label }: { ch: Ch | "push"; label: string }) => <label className="check alert-on"><input type="checkbox" checked={s[ch].on} onChange={(e) => set(ch, { on: e.target.checked } as never)} /> {label}</label>;
  const field = (ch: Ch, f: string, label: string, ph = "", type = "text") => (
    <label className="alert-field">{label}<input type={type} value={(s[ch] as Record<string, string | boolean>)[f] as string} placeholder={ph} autoComplete="off" spellCheck={false} onChange={(e) => set(ch, { [f]: e.target.value } as never)} /></label>
  );
  const card = (ch: Ch, title: string, intro: string, steps: React.ReactNode[], fields: React.ReactNode, extra?: React.ReactNode) => (
    <article className={`card alert-card ${s[ch].on ? "on" : ""}`}>
      <div className="alert-top"><h3>{title}</h3><Toggle ch={ch} label="On" /></div>
      <p className="sub">{intro}</p>
      <details><summary>How to set it up</summary><ol className="install-steps">{steps.map((x, i) => <li key={i}>{x}</li>)}</ol></details>
      <div className="alert-fields">{fields}</div>
      <div className="rt-actions">{extra}<button className="btn" disabled={!!busy} onClick={() => test(ch)}>{busy === ch ? "Sending…" : "Send test"}</button></div>
      {result(ch)}
    </article>
  );

  return (
    <section className="view alerts">
      <header className="view-head">
        <div><h2>Alerts</h2><p>Get a message when a trade opens, hits target 1 or closes, with the profit or loss, and when your daily loss limit is reached. Pick any mix of places below; each is optional.</p></div>
      </header>
      {err && <p className="err">{err}</p>}

      <div className="card alert-what">
        <div className="auto-field"><span className="auto-label">Tell me when</span>
          <div className="opp-checks">
            {([["open", "A trade opens"], ["t1", "Target 1 is hit"], ["close", "A trade closes (profit or loss)"], ["limit", "The daily loss limit is reached"]] as const).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={s.events[k]} onChange={(e) => set("events", { [k]: e.target.checked })} /> {l}</label>)}
          </div>
        </div>
        <div className="auto-field"><span className="auto-label">For</span>
          <div className="opp-checks">
            {([["live", "Real money"], ["demo", "Demo accounts"], ["paper", "Paper trades"]] as const).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={s.accounts[k]} onChange={(e) => set("accounts", { [k]: e.target.checked })} /> {l}</label>)}
          </div>
        </div>
      </div>

      <article className={`card alert-card ${s.push.on ? "on" : ""}`}>
        <div className="alert-top"><h3>This phone or computer</h3><Toggle ch="push" label="On" /></div>
        <p className="sub">A pop-up notification, even when Viko is closed. Turn it on separately on every phone and computer you use.</p>
        {s.push.devices.length > 0 && <ul className="alert-devices">{s.push.devices.map((d) => <li key={d.endpoint}><span>{d.ua || "Device"}{d.added ? `, added ${when(d.added)}` : ""}</span><button className="link" onClick={() => notify.unsubscribe(appKey, d.endpoint).then(load)}>Remove</button></li>)}</ul>}
        <div className="rt-actions"><button className="btn primary" disabled={!!busy} onClick={pushOn}>{busy === "push" ? "Setting up…" : "Turn on for this device"}</button>{s.push.devices.length > 0 && <button className="btn" disabled={!!busy} onClick={() => test("push")}>Send test</button>}</div>
        <p className="sub">iPhone: add Viko to your Home Screen first and open it from there (iOS 16.4 or newer).</p>
        {result("push")}
      </article>

      <div className="alert-grid">
        {card("telegram", "Telegram", "Free and instant. You make your own private bot in two minutes.", [
          <>In Telegram, open <b>@BotFather</b>, send <code>/newbot</code>, pick any name. It replies with a <b>token</b>: copy it.</>,
          <>Open the link BotFather gives you to your new bot and press <b>Start</b> (or send it "hi").</>,
          <>Paste the token below and press <b>Find my chat</b>. Then <b>Send test</b>.</>,
        ], <>{field("telegram", "token", "Bot token", "123456:ABC…")}{field("telegram", "chat", "Chat id (filled in for you)", "Press Find my chat")}</>,
          <button className="btn" disabled={!!busy} onClick={findTelegram}>{busy === "tg" ? "Looking…" : "Find my chat"}</button>)}

        {card("whatsapp", "WhatsApp", "Through CallMeBot, a free service for personal alerts. It's run by a third party and can be slow at busy times.", [
          <>Open <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">CallMeBot's WhatsApp page</a> and save the phone number it shows to your contacts.</>,
          <>From your WhatsApp, send that contact: <code>I allow callmebot to send me messages</code></>,
          <>It replies with your <b>API key</b>. Enter your number with country code (for example +2547…) and the key below.</>,
        ], <>{field("whatsapp", "phone", "Your WhatsApp number", "+2547…", "tel")}{field("whatsapp", "apikey", "CallMeBot API key", "123456")}</>)}

        {card("email", "Email", "Through Resend (free for up to 100 emails a day).", [
          <>Sign up at <a href="https://resend.com" target="_blank" rel="noreferrer">resend.com</a> with the email you want alerts at.</>,
          <>Go to <b>API Keys</b> → <b>Create API key</b> (Sending access) and copy it.</>,
          <>Enter that key and the same email address below. Without your own domain, Resend only delivers to the address you signed up with.</>,
        ], <>{field("email", "to", "Send alerts to", "you@example.com", "email")}{field("email", "key", "Resend API key", "re_…")}</>)}

        {card("ntfy", "ntfy (phone app)", "Free push notifications through the ntfy app, no account needed.", [
          <>Install <b>ntfy</b> from the Play Store or App Store.</>,
          <>Press <b>Make a topic for me</b> below (or invent a long, hard-to-guess name), then <b>+</b> in the ntfy app → subscribe to that same topic.</>,
          <>Anyone who knows the topic name can read it, so keep it private.</>,
        ], <>{field("ntfy", "topic", "Topic", "viko-…")}</>,
          <button className="btn" onClick={() => set("ntfy", { topic: `viko-${crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 14)}` })}>Make a topic for me</button>)}

        {card("discord", "Discord", "Posts into a channel on your Discord server.", [
          <>In Discord: <b>Server settings</b> → <b>Integrations</b> → <b>Webhooks</b> → <b>New webhook</b>, pick the channel.</>,
          <>Press <b>Copy webhook URL</b> and paste it below.</>,
        ], <>{field("discord", "url", "Webhook link", "https://discord.com/api/webhooks/…")}</>)}

        {card("slack", "Slack", "Posts into a Slack channel.", [
          <>Create an <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">incoming webhook</a> for your workspace and pick the channel.</>,
          <>Copy the webhook URL and paste it below.</>,
        ], <>{field("slack", "url", "Webhook link", "https://hooks.slack.com/…")}</>)}
      </div>

      <div className={`alert-save ${dirty ? "show" : ""}`}><span>{dirty ? "You have unsaved changes." : note.save ?? ""}</span><button className="btn primary" disabled={!!busy || !dirty} onClick={save}>{busy === "save" ? "Saving…" : "Save alert settings"}</button></div>

      <div className="card">
        <h3>Recent alerts</h3>
        {recent.length === 0 ? <p className="sub">None yet. They appear here as trades open and close.</p> : (
          <ul className="alert-recent">{recent.map((a) => <li key={a.id}><span className="sub">{when(a.at)}</span> <b>{a.title}</b>{a.result && <span className="sub"> → {Object.entries(a.result).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>}</li>)}</ul>
        )}
        <p className="sub">Saved keys and tokens are kept on Viko's server and shown here only as their last 4 characters.</p>
      </div>
    </section>
  );
}
