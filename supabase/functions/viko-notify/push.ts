// Web Push encryption (RFC 8291, aes128gcm) and VAPID signing (RFC 8292), with WebCrypto only.
export type Sub = { endpoint: string; keys: { p256dh: string; auth: string }; ua?: string; added?: string };
type Bytes = Uint8Array<ArrayBuffer>;
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string): Bytes => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...a: Uint8Array[]): Bytes => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
export const te = { encode: (x: string): Bytes => new TextEncoder().encode(x) as Bytes };
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, len: number): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
export type Keys = { pub: string; jwk: string };
/** Viko's own push signing keys: from env (tests) or from the loader given (the private settings table). */
let vapid: Keys | null = null;
export async function vapidKeysFrom(load?: () => Promise<Keys | null>) {
  if (vapid) return vapid;
  if (Deno.env.get("VAPID_PUBLIC")) return (vapid = { pub: Deno.env.get("VAPID_PUBLIC")!, jwk: Deno.env.get("VAPID_PRIVATE_JWK") ?? "{}" });
  if (load) vapid = await load();
  return vapid;
}
export async function vapidHeader(endpoint: string, load?: () => Promise<Keys | null>) {
  const keys = await vapidKeysFrom(load);
  const jwk = JSON.parse(keys?.jwk ?? "{}");
  const pub = keys?.pub ?? "";
  if (!jwk.d || !pub) throw new Error("Push keys are not set on the server.");
  const key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:alerts@viko.app" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}
/** RFC 8291 aes128gcm body for one subscription. Exported for the round-trip test. */
export async function encryptPush(sub: Sub, payload: string): Promise<Bytes> {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(te.encode("WebPush: info\0"), ua, asPub), 32);
  const salt: Bytes = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, cat(te.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
