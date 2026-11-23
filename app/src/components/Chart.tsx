import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, HistogramSeries, LineSeries, LineStyle, type IChartApi, type MouseEventParams, type UTCTimestamp } from "lightweight-charts";
import type { Analysis, Candle, Setup } from "../engine/types";
import { fmt } from "../engine/analyze";

const DARK = { abyss: "#0E1A21", rule: "#223843", foam: "#DDE7E4", mist: "#7F989A", brass: "#C9A45C", kelp: "#5FB389", anemone: "#D95F6E", tide: "#6E9FB8", grid: "rgba(39,64,77,.35)", label: "#27404D", volUp: "rgba(95,179,137,.28)", volDn: "rgba(217,95,110,.28)" };
const LIGHT = { abyss: "#FFFFFF", rule: "#D0DBDA", foam: "#13232B", mist: "#4D686B", brass: "#9A7424", kelp: "#23794F", anemone: "#B3364A", tide: "#2E6C88", grid: "rgba(19,35,43,.06)", label: "#4D686B", volUp: "rgba(35,121,79,.22)", volDn: "rgba(179,54,74,.22)" };
export type Indicators = { ema: boolean; bb: boolean; rsi: boolean };

type Props = { candles: Candle[]; analysis: Analysis | null; setup: Setup | null; ind: Indicators; theme: "light" | "dark" };

export default function Chart({ candles, analysis, setup, ind, theme }: Props) {
  const C = theme === "light" ? LIGHT : DARK;
  const el = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<Candle[]>(candles);
  candlesRef.current = candles;

  const showBar = (k: Candle | undefined, prev?: Candle) => {
    if (!legend.current || !k) return;
    const ch = prev ? (k.c / prev.c - 1) * 100 : 0;
    legend.current.innerHTML = `<span>O <b>${fmt(k.o)}</b></span><span>H <b>${fmt(k.h)}</b></span><span>L <b>${fmt(k.l)}</b></span><span>C <b class="${k.c >= k.o ? "bull" : "bear"}">${fmt(k.c)}</b></span><span class="${ch >= 0 ? "bull" : "bear"}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</span><span>Vol <b>${k.v >= 1e6 ? (k.v / 1e6).toFixed(2) + "M" : k.v >= 1e3 ? (k.v / 1e3).toFixed(1) + "K" : k.v.toFixed(0)}</b></span>`;
  };

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: C.abyss }, textColor: C.mist, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, attributionLogo: false, panes: { separatorColor: C.rule } },
      grid: { vertLines: { color: "rgba(39,64,77,.35)" }, horzLines: { color: "rgba(39,64,77,.35)" } },
      rightPriceScale: { borderColor: C.rule },
      timeScale: { borderColor: C.rule, rightOffset: 8, timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: C.mist, labelBackgroundColor: "#27404D" }, horzLine: { color: C.mist, labelBackgroundColor: "#27404D" } },
    });
    chartRef.current = chart;
    const onMove = (p: MouseEventParams) => {
      const cs = candlesRef.current;
      if (!p.time) { showBar(cs[cs.length - 1], cs[cs.length - 2]); return; }
      const i = cs.findIndex((k) => k.t === (p.time as number));
      if (i >= 0) showBar(cs[i], cs[i - 1]);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => { chart.unsubscribeCrosshairMove(onMove); chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { background: { type: ColorType.Solid, color: C.abyss }, textColor: C.mist, panes: { separatorColor: C.rule } },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.rule }, timeScale: { borderColor: C.rule },
      crosshair: { vertLine: { color: C.mist, labelBackgroundColor: C.label }, horzLine: { color: C.mist, labelBackgroundColor: C.label } },
    });
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the readout on the latest bar while live ticks arrive.
  useEffect(() => { showBar(candles[candles.length - 1], candles[candles.length - 2]); }, [candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;
    const T = (i: number) => candles[Math.min(Math.max(i, 0), candles.length - 1)].t as UTCTimestamp;
    const added: ReturnType<IChartApi["addSeries"]>[] = [];
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    vol.setData(candles.map((k) => ({ time: k.t as UTCTimestamp, value: k.v, color: k.c >= k.o ? C.volUp : C.volDn })));
    added.push(vol);
    const cs = chart.addSeries(CandlestickSeries, { upColor: C.kelp, downColor: C.anemone, borderVisible: false, wickUpColor: C.kelp, wickDownColor: C.anemone, priceLineColor: C.mist });
    cs.setData(candles.map((k) => ({ time: k.t as UTCTimestamp, open: k.o, high: k.h, low: k.l, close: k.c })));
    added.push(cs);

    const line = (arr: number[], color: string, width: 1 | 2 = 1, style = LineStyle.Solid, pane = 0) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }, pane);
      s.setData(arr.map((v, i) => ({ time: T(i), value: v })).filter((p) => Number.isFinite(p.value)));
      added.push(s);
      return s;
    };
    if (analysis && ind.ema) { line(analysis.ind.ema50, "rgba(110,159,184,.7)"); line(analysis.ind.ema200, "rgba(201,164,92,.55)"); }
    if (analysis && ind.bb) { line(analysis.ind.bbU, "rgba(143,167,168,.45)", 1, LineStyle.Dashed); line(analysis.ind.bbM, "rgba(143,167,168,.3)"); line(analysis.ind.bbL, "rgba(143,167,168,.45)", 1, LineStyle.Dashed); }
    if (analysis && ind.rsi) {
      const r = line(analysis.ind.rsi, C.tide, 1, LineStyle.Solid, 1);
      r.createPriceLine({ price: 70, color: "rgba(217,95,110,.5)", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" });
      r.createPriceLine({ price: 30, color: "rgba(95,179,137,.5)", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" });
      try { chart.panes()[1]?.setHeight(110); } catch { /* older API */ }
    }

    const wy = analysis?.wyckoff;
    if (wy?.kind && wy.startI !== null && wy.top !== null && wy.bottom !== null) {
      for (const [price, label] of [[wy.top, wy.kind === "accumulation" ? "Creek" : "Range high"], [wy.bottom, wy.kind === "accumulation" ? "Range low" : "Ice"]] as const) {
        const s = chart.addSeries(LineSeries, { color: "rgba(110,159,184,.75)", lineWidth: 1, lineStyle: LineStyle.Dotted, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, title: label });
        s.setData([{ time: T(wy.startI), value: price }, { time: T(candles.length - 1), value: price }]);
        added.push(s);
      }
    }

    if (setup) {
      const pts = setup.labels.map((l) => ({ time: T(l.i), value: l.p }));
      const last = { time: T(candles.length - 1), value: candles[candles.length - 1].c };
      const wl = chart.addSeries(LineSeries, { color: C.brass, lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      wl.setData([...pts, last].filter((p, i, a) => i === 0 || (p.time as number) > (a[i - 1].time as number)));
      added.push(wl);
      if (!setup.hardFail) {
        const levels: [number, string, string, LineStyle][] = [
          [setup.entry, setup.triggered ? "Entry" : "Trigger", C.foam, LineStyle.Solid], [setup.stop, "Stop", C.anemone, LineStyle.Dashed],
          [setup.target1, "Target 1", C.kelp, LineStyle.Dashed], [setup.target2, "Target 2", C.kelp, LineStyle.Dotted],
        ];
        for (const [price, title, color, lineStyle] of levels) cs.createPriceLine({ price, title, color, lineStyle, lineWidth: 1, axisLabelVisible: true });
      }
    }
    const markers = [
      ...(setup?.labels ?? []).map((l) => {
        const isHigh = candles[l.i] && Math.abs(candles[l.i].h - l.p) <= Math.abs(candles[l.i].l - l.p);
        return { time: T(l.i), position: (isHigh ? "aboveBar" : "belowBar") as "aboveBar" | "belowBar", color: C.brass, shape: "circle" as const, text: l.text, size: 1 };
      }),
      ...(wy?.events ?? []).map((e) => {
        const isHigh = candles[e.i] && Math.abs(candles[e.i].h - e.p) <= Math.abs(candles[e.i].l - e.p);
        return { time: T(e.i), position: (isHigh ? "aboveBar" : "belowBar") as "aboveBar" | "belowBar", color: C.tide, shape: "square" as const, text: e.code, size: 0.6 };
      }),
    ].sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(cs, markers);
    return () => {
      if (chartRef.current !== chart) return;
      for (const s of added) { try { chart.removeSeries(s); } catch { /* gone */ } }
      try { if (chart.panes().length > 1) chart.removePane(1); } catch { /* none */ }
    };
  }, [candles, analysis, setup, ind, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frame the latest ~260 bars only when the market or timeframe changes, not on every live tick.
  const first = candles[0]?.t;
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 260), to: candles.length + 8 });
  }, [first]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="chart-box">
      <div className="ohlc mono" ref={legend} aria-live="off" />
      <div className="chart" ref={el} role="img" aria-label="Price chart with Elliott wave count and trade levels" />
    </div>
  );
}
