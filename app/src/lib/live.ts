import { useEffect, useRef, useState } from "react";
import type { Candle, Tf } from "../engine/types";
import { getCandles, getQuotes, type Quote } from "./api";

const WS = "wss://data-stream.binance.vision";
export type LiveStatus = "live" | "polling" | "offline";

/**
 * Keeps a candle series live. Crypto streams every trade through Binance's public
 * WebSocket; other markets re-poll the data feed every 30 seconds.
 * `onCandleClose` fires when a candle finishes, so the analysis can re-run.
 */
export function useLiveCandles(symbol: string, tf: Tf, base: Candle[], onCandleClose: () => void) {
  const [candles, setCandles] = useState<Candle[]>(base);
  const [status, setStatus] = useState<LiveStatus>("offline");
  const [tickAt, setTickAt] = useState<number>(0);
  const closeRef = useRef(onCandleClose);
  closeRef.current = onCandleClose;
  useEffect(() => setCandles(base), [base]);

  useEffect(() => {
    if (!base.length) return;
    let stop = false;
    if (symbol.startsWith("crypto:")) {
      let ws: WebSocket | null = null;
      let retry: number | undefined;
      const connect = () => {
        try { ws = new WebSocket(`${WS}/ws/${symbol.slice(7).toLowerCase()}@kline_${tf}`); } catch { setStatus("offline"); return; }
        ws.onopen = () => setStatus("live");
        ws.onclose = () => { setStatus("offline"); if (!stop) retry = window.setTimeout(connect, 4000); };
        ws.onerror = () => ws?.close();
        ws.onmessage = (ev) => {
          const k = JSON.parse(ev.data).k;
          if (!k) return;
          const bar: Candle = { t: Math.floor(k.t / 1000), o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
          setCandles((prev) => {
            if (!prev.length) return prev;
            const last = prev[prev.length - 1];
            if (bar.t === last.t) return [...prev.slice(0, -1), bar];
            if (bar.t > last.t) return [...prev.slice(1), bar];
            return prev;
          });
          setTickAt(Date.now());
          if (k.x) closeRef.current();
        };
      };
      connect();
      return () => { stop = true; clearTimeout(retry); ws?.close(); };
    }
    setStatus("polling");
    const id = window.setInterval(async () => {
      try {
        const fresh = await getCandles(symbol, tf, true);
        if (stop) return;
        setCandles((prev) => {
          const closed = prev.length && fresh.length && fresh[fresh.length - 1].t !== prev[prev.length - 1].t;
          if (closed) setTimeout(() => closeRef.current(), 0);
          return fresh;
        });
        setTickAt(Date.now());
      } catch { /* keep last data */ }
    }, 30_000);
    return () => { stop = true; clearInterval(id); };
  }, [symbol, tf, base]);

  return { candles, status, tickAt };
}

/** Live prices for a list of markets: Binance stream for crypto, 30-second polling for the rest. */
export function useQuotes(ids: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const key = ids.join(",");
  useEffect(() => {
    if (!ids.length) return;
    let stop = false;
    const poll = async () => { try { const q = await getQuotes(ids); if (!stop) setQuotes((p) => ({ ...p, ...q })); } catch { /* offline */ } };
    poll();
    const id = window.setInterval(poll, 30_000);
    const crypto = ids.filter((i) => i.startsWith("crypto:")).map((i) => i.slice(7).toLowerCase());
    let ws: WebSocket | null = null;
    if (crypto.length) {
      try {
        ws = new WebSocket(`${WS}/stream?streams=${crypto.map((s) => `${s}@miniTicker`).join("/")}`);
        ws.onmessage = (ev) => {
          const d = JSON.parse(ev.data).data;
          if (!d?.s) return;
          const c = +d.c, o = +d.o;
          setQuotes((p) => ({ ...p, [`crypto:${d.s}`]: { price: c, change: o ? (c / o - 1) * 100 : 0 } }));
        };
      } catch { /* polling covers it */ }
    }
    return () => { stop = true; clearInterval(id); ws?.close(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return quotes;
}
