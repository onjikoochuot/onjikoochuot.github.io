# Viko

A personal trading-analysis app built on two books:

- **Glenn Neely, *Mastering Elliott Wave*** (NEoWave): wave counting and the primary engine.
- **Rubén Villahermosa, *The Wyckoff Methodology in Depth***: context, volume and entry triggers.

Pick a market and a timeframe. Viko counts waves at three degrees, tests four Elliott setups in both directions,
checks every candidate against the books' rules and gives one verdict: **Approved**, **Watch** or **No trade**.

## The 80% gate

A setup is approved only when:

1. no "must pass" rule is broken (e.g. wave 2 retracing 100% of wave 1),
2. at least **80%** of the weighted book rules agree,
3. the entry trigger has fired (a significant reversal bar, Wyckoff ch. 27), and
4. reward to target 1 is at least 2× the risk.

The 80% is *rule confluence*, not a promise of profit. Neither book publishes win rates, so the **Backtest** tab
replays the engine over each market's history (no look-ahead) and reports the real hit rate of approved setups.

## Structure

```
app/                     React + Vite + TypeScript front end (GitHub Pages)
  src/engine/            pure analysis engine, no UI code
    waves.ts             monowave detection by degree
    analyze.ts           Neely rule checks, setups, scoring, the gate
    wyckoff.ts           phases A-E, climaxes, springs/UTADs, tests, SOS/SOW, LPS/LPSY
    backtest.ts          walk-forward replay
  tests/engine.test.ts   unit tests (run in CI before every deploy)
supabase/functions/viko-market/   edge function: candles (Binance, Yahoo), symbol search, journal
```

## Data

- Crypto: Binance public market data. Stocks, forex, commodities: Yahoo Finance chart API.
- Forex has no centralised volume, so volume rules are marked "not applicable" there (as Villahermosa advises).
- The journal lives in the Supabase table `viko_signals` (RLS on, no public policies). The edge function writes it
  only when the request carries your journal key.

Informational analysis only, not financial advice.
