import { useEffect, useState } from "react";
import QRCode from "qrcode";

const APP = "https://onjikoochuot.github.io/";
/** Puts this browser's app key on a phone: a QR code to scan, or a link to send yourself. The key rides in the #fragment, which browsers never send to a server. */
export const setupLink = (key: string) => `${APP}#setup=${encodeURIComponent(key)}`;

/** On load: a #setup=<key> link saves the key on this device and is wiped from the address bar. */
export function takeSetupKey(): string | null {
  const m = location.hash.match(/^#setup=(.+)$/);
  if (!m) return null;
  history.replaceState(null, "", `${location.pathname}#analyse`);
  try { return decodeURIComponent(m[1]).trim() || null; } catch { return null; }
}

export default function PhoneSetup({ appKey }: { appKey: string }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState("");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState("");
  useEffect(() => { if (open && appKey) QRCode.toDataURL(setupLink(appKey), { margin: 1, width: 240 }).then(setQr).catch(() => setQr("")); }, [open, appKey]);
  if (!appKey) return null;
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 2500); } catch { setCopied("Copy failed: select the text and copy it by hand."); } };
  return (
    <div className="phone-setup">
      {!open ? <button className="btn" onClick={() => setOpen(true)}>Set up my phone</button> : (
        <>
          <p className="sub">Scan this with your phone's camera. Viko opens with your key already saved; then install it (Chrome ⋮ → Install app). Anyone who scans it can use your account, so don't share it.</p>
          {qr && <img className="phone-qr" src={qr} alt="QR code that opens Viko on your phone with your key" width={240} height={240} />}
          <div className="rt-actions phone-btns">
            <button className="btn" onClick={() => copy("Link copied. Send it to yourself (for example on WhatsApp) and open it on the phone.", setupLink(appKey))}>Copy setup link</button>
            <button className="btn" onClick={() => setShow(!show)}>{show ? "Hide key" : "Show key"}</button>
            {show && <button className="btn" onClick={() => copy("Key copied.", appKey)}>Copy key</button>}
            <button className="link" onClick={() => { setOpen(false); setShow(false); }}>Close</button>
          </div>
          {show && <p className="mono phone-key">{appKey}</p>}
          {copied && <p className="sub pos-c">{copied}</p>}
        </>
      )}
    </div>
  );
}
