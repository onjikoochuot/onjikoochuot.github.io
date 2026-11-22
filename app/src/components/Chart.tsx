import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, HistogramSeries, LineSeries, LineStyle, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { Analysis, Candle, Setup } from "../engine/types";

const C = { abyss: "#0E1A21", rule: "#223843", foam: "#DDE7E4", mist: "#7F989A", brass: "#C9A45C", kelp: "#5FB389", anemone: "#D95F6E", tide: "#6E9FB8" };

type Props = { candles: Candle[]; analysis: Analysis | null; setup: Setup | null; showEma: boolean };

export default function Chart({ candles, analysis, setup, showEma }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: C.abyss }, textColor: C.mist, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "rgba(39,64,77,.35)" }, horzLines: { color: "rgba(39,64,77,.35)" } },
      rightPriceScale: { borderColor: C.rule },
      timeScale: { borderColor: C.rule, rightOffset: 8 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: C.mist, labelBackgroundColor: "#27404D" }, horzLine: { color: C.mist, labelBackgroundColor: "#27404D" } },
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;
    const T = (i: number) => candles[Math.min(Math.max(i, 0), candles.length - 1)].t as UTCTimestamp;
    const added: ReturnType<IChartApi["addSeries"]>[] = [];
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    vol.setData(candles.map((k) => ({ time: k.t as UTCTimestamp, value: k.v, color: k.c >= k.o ? "rgba(95,179,137,.28)" : "rgba(217,95,110,.28)" })));
    added.push(vol);
    const cs = chart.addSeries(CandlestickSeries, { upColor: C.kelp, downColor: C.anemone, borderVisible: false, wickUpColor: C.kelp, wickDownColor: C.anemone, priceLineColor: C.mist });
    cs.setData(candles.map((k) => ({ time: k.t as UTCTimestamp, open: k.o, high: k.h, low: k.l, close: k.c })));
    added.push(cs);

    if (analysis && showEma) {
      for (const [arr, color] of [[analysis.ind.ema50, "rgba(110,159,184,.7)"], [analysis.ind.ema200, "rgba(201,164,92,.55)"]] as const) {
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        s.setData(arr.map((v, i) => ({ time: T(i), value: v })).filter((p) => Number.isFinite(p.value)));
        added.push(s);
      }
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
      const line = chart.addSeries(LineSeries, { color: C.brass, lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      const uniq = [...pts, last].filter((p, i, a) => i === 0 || (p.time as number) > (a[i - 1].time as number));
      line.setData(uniq);
      added.push(line);
      const levels: [number, string, string, LineStyle][] = [
        [setup.entry, "Entry", C.foam, LineStyle.Solid], [setup.stop, "Stop", C.anemone, LineStyle.Dashed],
        [setup.target1, "Target 1", C.kelp, LineStyle.Dashed], [setup.target2, "Target 2", C.kelp, LineStyle.Dotted],
      ];
      for (const [price, title, color, lineStyle] of levels) cs.createPriceLine({ price, title, color, lineStyle, lineWidth: 1, axisLabelVisible: true });
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
    const n = candles.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 260), to: n + 8 });
    return () => {
      if (chartRef.current !== chart) return; // chart already destroyed on unmount
      for (const s of added) { try { chart.removeSeries(s); } catch { /* already gone */ } }
    };
  }, [candles, analysis, setup, showEma]);

  return <div className="chart" ref={el} role="img" aria-label="Price chart with Elliott wave count and trade levels" />;
}
