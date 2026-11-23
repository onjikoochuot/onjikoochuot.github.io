# Viko

**Live app:** https://onjikoochuot.github.io/ (install it on your phone: open the link, then "Add to Home Screen")

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

## What's inside

- **Analyse**: live chart (crypto streams tick by tick, everything else refreshes every 30 s), Elliott wave count, Wyckoff events, a plain-English tip, the verdict dial and the rule-by-rule checklist.
- **Markets**: 77 markets across crypto, stocks (incl. JSE), indices, forex (incl. USD/KES) and commodities, with live prices. Search finds thousands more.
- **Paper trading**: $10,000 of pretend money. Place a trade from any tip, or let the **autopilot** do it. The autopilot runs on Supabase every 15 minutes (pg_cron), so it works with the app closed. Half closes at target 1, the stop moves to entry, the rest closes at target 2 or the stop.
- **Scan, Backtest, Journal, How it decides.**

## Structure

```
app/                     React + Vite + TypeScript front end (GitHub Pages)
  src/engine/            pure analysis engine, no UI code
    waves.ts             monowave detection by degree
    analyze.ts           Neely rule checks, setups, scoring, the gate
    wyckoff.ts           phases A-E, climaxes, springs/UTADs, tests, SOS/SOW, LPS/LPSY
    backtest.ts          walk-forward replay
  tests/engine.test.ts   unit tests (run in CI before every deploy)
supabase/functions/viko-market/   edge function: candles, live quotes, symbol search, journal
supabase/functions/viko-paper/    edge function: paper account, trades, autopilot (runs the same engine, bundled)
supabase/functions/_shared/       market-data code shared by both (scripts/build-functions.sh copies it in)
```

## Data

- Crypto: Binance public market data. Stocks, forex, commodities: Yahoo Finance chart API.
- Forex has no centralised volume, so volume rules are marked "not applicable" there (as Villahermosa advises).
- The journal lives in the Supabase table `viko_signals` (RLS on, no public policies). The edge function writes it
  only when the request carries your journal key.

Informational analysis only, not financial advice.
