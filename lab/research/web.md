# Web research notes: making the EW + Wyckoff app profitable

Scope note. /home/claude/research/google.txt contains only titles, snippets and links for 66 Google results (no article bodies). Many are duplicates (the EWF guide appears 3x, the 7-step method 3x, "How do you personally use Elliot waves" 5x). I fetched what could be fetched. Failed or blocked fetches: Investopedia (blocked), Vantage (client error), both Medium posts (client error), Hudson & Urquhart full text (bot wall). Evidence strength: strong = replicated, peer-reviewed or large multi-decade out-of-sample; moderate = single good paper or caveated; weak = blog, in-sample, or short sample.

---------------------------------------------------------------------------

## 1. Article rules (Part A)

Headline finding: none of the ~10 EW articles gives a backtested win rate. The ones that give numeric trade rules agree on one setup (enter wave 3 at the end of wave 2, stop beyond the wave-1 origin, first target 1.618 x wave 1). Fibonacci ranges vary by author, which is itself a sign they are tendencies, not laws. Several sources state outright that the ratios have "wide error bars".

### A1. Fibonacci ranges per wave (EWF guide, "Elliott Wave Theory: Rules, Charts & Patterns")
- Wave 2: 50, 61.8, 76.4 or 85.4% of wave 1.
- Wave 3: 161.8, 200, 261.8 or 323.6% of waves 1-2 (the text elsewhere says about 1.618 x wave 1).
- Wave 4: 14.6, 23.6 or 38.2% of wave 3, "no more than 50%".
- Wave 5: 123.6-161.8% of wave 4 inverse, or equal to wave 1, or 61.8% of waves 1-3. After a triangle wave 4, wave 5 is about the width of the triangle's widest part.
- Zigzag: B = 50/61.8/76.4/85.4% of A; C = 61.8/100/123.6% of A; C at 161.8% of A may really be a wave 3.
- Regular flat: B about 90% of A; C = 61.8/100/123.6% of AB. Expanded flat: B 123.6% of A; C 123.6-161.8% of AB. Running flat: B 123.6% of A; C 61.8-100% of AB.
- Double three: X = 50-85.4% of W; Y = 61.8/100/123.6% of W and not beyond 161.8%.
- Confirmations: wave 5 and flat-wave C need momentum divergence. A break of the lower trendline confirms the end of an ending diagonal.
- Code: `w2 = (p1 - p2)/(p1 - p0); valid_w2 = w2 in [0.50, 0.854]; t3_min = p2 + 1.618*(p1-p0); t3_ext = p2 + 2.618*(p1-p0); w4_ret = (p3-p4)/(p3-p2); valid_w4 = 0.146 <= w4_ret <= 0.50; w5_conf = price_high5 > price_high3 and rsi_or_macd5 < rsi_or_macd3`
- Source: https://elliottwave-forecast.com/elliott-wave-theory
- Internal conflict: the same page says wave 4 "typically retraces less than 38.2%" in one section and "no more than 50%" in another. Use 38.2% as the typical case and 50% as the hard cap.

### A2. Complete trade setup with numbers (ChartingLens, "What Elliott Wave Actually Claims")
- Entry: end of wave 2 after a 50-61.8% retracement of wave 1 (sometimes 78.6%), AND a reversal trigger has fired (break of structure, or reversal candle at the 61.8% level).
- Stop: just beyond the wave-1 origin (the invalidation price).
- Target 1: 1.618 x wave 1 (2.618 if wave 3 is extended).
- Alternation: sharp wave 2 implies shallow, sideways wave 4, and vice versa.
- Channel: wave 5 tends to end near a line drawn parallel to the 2-4 line through the wave-3 peak.
- Equality: with an extended wave 3, waves 1 and 5 trend toward equal length or time.
- Volume: expands in wave 3, contracts in wave 4; wave 5 on lower volume than wave 3 is "normal and healthy".
- Wave 5 handling: trade it small, take profit early, cut risk on completion. Do not trade wave 5 like wave 3.
- 7-step method: (1) count on the highest relevant timeframe (weekly for position trades, daily for swings); (2) pick the most obvious impulse, not the one that supports your position; (3) check the 3 hard rules; (4) write a primary and one alternate count; (5) the invalidation price is your stop; (6) wait for a conventional trigger; (7) size the position from the stop distance.
- Mistakes: labelling every wiggle; relabelling a count to justify holding; single count with no alternate; entering on the count alone with no trigger.
- Code: `long_entry = (0.50 <= w2_ret <= 0.618 (0.786 allowed)) and trigger_fired; stop = p0 - buffer; tp1 = p2 + 1.618*(p1-p0); risk_R = (entry-stop); size = risk_budget / risk_R`
- Source: https://chartinglens.com/blog/elliott-wave-theory-guide
- Caveat: the article itself says it gives no accuracy data and calls the claim "most of the money from EW comes from this setup" unsupported.

### A3. Worked trade with R multiples (audacity.capital)
- EURUSD example: wave 1 from 1.0800 to 1.0950, wave 2 low 1.0880. Entry 1.0905, stop 1.0875 (30 pips = 1R), T1 = 2R, T2 = 4R. Invalidation of the whole count at 1.0800.
- If the count's invalidation is far away, reduce position size; do not widen risk.
- Checklist: 3 hard rules pass; sub-waves split 5 vs 3; alternation checked; momentum confirm (RSI/MACD, no thresholds given); alternate count documented.
- Pitfalls: switching timeframes mid-count; relabelling after every candle; treating diagonals as impulses.
- Code: `R = entry - tight_stop; T1 = entry + 2R; T2 = entry + 4R; if invalidation_distance > k*R: size *= R/invalidation_distance`
- Source: https://audacity.capital/trading-guides/elliott-wave-theory/

### A4. Wave-3 entry with stop levels (capital.com)
- Wave 3 entry when wave 2 appears complete; stop below the start of wave 1; target 161.8% extension zone. Wave 5 idea is invalidated below the wave-4 low.
- Prefers structural levels over arbitrary percentage stops. Confirmations: Fib level holding, momentum divergence, higher-timeframe wave alignment.
- Source: https://capital.com/en-gb/learn/technical-analysis/elliott-wave-theory

### A5. LiteFinance guide
- Wave 2 retracement is "most often" 61.8% or 76.4%; wave 3 about 161.8% of wave 1. No stops, entries or targets with numbers; the author calls the ratios statistical observations but shows no data.
- Source: https://www.litefinance.org/blog/for-beginners/elliott-wave-theory

### A6. Elliott Wave Oscillator (LuxAlgo "5/35 Oscillator"; also the "Take the Confusion Out of Elliott Wave Counts" post, which gives the 100-150 bar chart-size tip)
- Formula: Osc = SMA5(median price (H+L)/2) - SMA35(median price). Zero cross = SMA5 crossing SMA35.
- Wave 3 = the largest histogram extreme in the sequence. If a later push prints a bigger reading, it is still wave 3.
- Wave 4: a pullback that barely dents the reading means wave 3 is still extending.
- Wave 5: new price extreme with a lower oscillator peak = divergence; if absent, the count may be early.
- Chart sizing: the suspected impulse should span about 100-150 bars.
- Code: `ewo = sma(hl2,5)-sma(hl2,35); w5_done = high5 > high3 and ewo_peak5 < ewo_peak3; w3_confirmed = abs(ewo_at_w3) == max(abs(ewo) over w1..w4)`
- Sources: https://www.luxalgo.com/library/concept/5-35-oscillator/ ; Damodaran (NYU) notes the same 5/35 construction: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/articles/elliottwave.html

### A7. Mistakes list (EWF "Elliott Wave Analysis Mistakes" + h0r3x crypto academy ch.6 + TradingView "Keep It Simple")
- 13 mistakes, the codeable ones: use at least 2-3 timeframes (higher for trend, lower for entry); use only 2-3 indicators; define risk before entry; wait for confirmation instead of trading incomplete patterns; prefer common patterns (zigzag, flat) over rare ones (truncation, running flat) to force a count.
- Do not label a wave mid-swing; wait for completion or clear invalidation. Check that sub-waves split 5 vs 3. Keep a primary and an alternate count.
- TradingView tip: start counting at a major high or low; in commodities wave 5 is more often extended; avoid cycling through timeframes.
- Code: `skip if wave_label_unconfirmed; skip if count relies on truncation/running-flat; require subwave_structure in (5,3,5 | 3,3,5)`
- Sources: https://elliottwave-forecast.com/trading/elliott-wave-analysis-mistakes/ ; https://h0r3x.github.io/wave-crypto-insights/elliott-wave-academy/chapter-6.html ; https://it.tradingview.com/chart/EURUSD/P8bKZwXD-Tips-on-Counting-Waves-Keep-It-Simple

### A8. BullWaves course page
- Wave 2: 0.382/0.5/0.618 of wave 1. Wave 3: 1.618 or 2.618 of wave 1. Wave 4: 0.382/0.5 of wave 3. Wave 5: 0.382/0.5/0.618/1.00 of wave 1. Extended wave 5 about 161.8% of wave 1; trend ends when wave 5 shows its own internal five-wave pattern. No entry or stop numbers on the page.
- Source: https://bullwaves.org/elliott-wave-theory-course

### A9. Critical readings (use these to calibrate expectations)
- Damodaran (NYU): EW predictive value depends on an accurate count, which "can be extremely subjective". After the 1987 crash many practitioners revised counts. No profitability data given.
- TurtleTrader "Elliott Wave Junk": says two practitioners will usually produce different counts; no empirical basis for Fibonacci targets; missed forecasts get reinterpreted. Author sells trend-following, so treat as advocacy. https://www.turtletrader.com/wavejunk/
- A 2017 paper claims EW forecast USD/EUR with "great accuracy" over 2009-2015 (abstract only, no figures): https://ideas.repec.org/a/ibn/ibrjnl/v10y2017i6p1-18.html . Treat as weak: hindsight counting, no out-of-sample trading test.

### Net rules from Part A that are worth coding (beyond textbook)
1. Wave-2 entry only if retracement is in [0.50, 0.786] AND a trigger candle/structure break fires (not on touching the level).
2. Stop = wave-1 origin; compute R from the real stop; size from R; skip if R > X x ATR (the wave-1 origin is often too far on 15m).
3. T1 = 1.618 x wave 1 projected from the wave-2 low; half off there. Also record 2R and 4R for comparison.
4. Wave 5: smaller size, earlier exit, require EWO divergence.
5. Require sub-wave structure check and a stored alternate count; invalidate immediately on a hard-rule break.
6. Multi-timeframe: count on higher TF, enter on lower TF.

---------------------------------------------------------------------------

## 2. Evidence-backed methods (Part B)

### B1. Time-series momentum (trend following) works across asset classes. Strength: STRONG
- Claim: past 1-12 month return predicts the next month's return in 58 futures/forwards (equity indices, bonds, commodities, currencies). Diversified TSMOM Sharpe is above 1; the 12-month lookback/1-month hold has the highest alpha t-stat (6.61); the 1-month lookback is t=4.34. Returns reverse partially beyond about 12 months. All 58 instruments had positive 12-month TSMOM returns, 52 significant at 5%. Positions were sized to 40%/EWMA vol (60-day centre of mass).
- Source: Moskowitz, Ooi, Pedersen, "Time Series Momentum", JFE 2012. https://fairmodel.econ.yale.edu/ec439/jpde.pdf ; https://papers.ssrn.com/abstract=2089463
- Century of evidence: AQR combines 1-, 3- and 12-month signals over 67 markets (29 commodities, 11 equity indices, 15 bonds, 12 currencies), profitable back to 1880, average Sharpe about 0.4 per market, 0.76 net combined. Drawdowns up to 25% over extended periods; weak for about 4 years after a global financial crisis (SG CTA Trend index -0.8% annualized Jan 2009-Jun 2013). Source: Hurst, Ooi, Pedersen, https://www.aqr.com/insights/research/journal-article/a-century-of-evidence-on-trend-following-investing ; summary with numbers https://alphaarchitect.com/time-series-momentum-aka-trend-following-the-historical-evidence/
- Implication: strong evidence is for daily-to-monthly horizons, not 15m.

### B2. MA crossover = TSMOM; ensembles of lookbacks add little. Strength: MODERATE-STRONG
- Levine & Pedersen (FAJ 2016): MA crossover and TSMOM are "equivalent representations in their most general forms"; some common MA rules have inverted information decay. Source: https://alphaarchitect.com/2015/05/daily-academic-alpha-which-trend-if-your-friend/
- Single-EMA backtest on 70 futures: Sharpe vs EMA length fits a theoretical curve with optimum near 112 days; EMAs of different lengths are highly correlated (ARP(80) vs ARP(150) correlation 0.96), so ensembles add little diversification. Single backtest, no true out-of-sample. Source: https://arxiv.org/html/2504.10914v3 (moderate-weak)

### B3. Volatility estimator and trading rule for TSMOM (turnover control). Strength: MODERATE
- Baltas & Kosowski (75 futures, 1975-2013): Sharpe of 12-month SIGN rule about 1.04 pre-cost. Using a range estimator (Yang-Zhang) cuts turnover about 8-17% with unchanged Sharpe. A "statistically significant trend" rule (TREND) cut turnover 24-66% with Sharpe 0.99-1.11 vs SIGN 1.04-1.15 (not significantly different). Post-2009 Sharpe about 0.01-0.14 (0.29 with correlation adjustment); after 50 bps cost the post-crisis Sharpe is about 0.05-0.14. Costs at default settings about 163 bps per year (about 10% of gross returns).
- Sources: https://spiral.imperial.ac.uk/bitstream/10044/1/41472/4/SSRN-id2140091.pdf ; https://www.cmegroup.com/education/files/demystifiing-time-series-momentum-strategies.pdf
- Implication: turnover and costs matter a lot; a trend-strength gate that trades less often loses almost no Sharpe.

### B4. Crypto: time-series momentum at weekly horizon. Strength: MODERATE
- Liu & Tsyvinski (RFS 2021): "strong time-series momentum" in BTC, ETH, XRP. Weekly BTC: coefficient on this week's return 0.19 (t=3.73) for next week, 0.22 (t=4.52) 2 weeks ahead, 0.21 at 3 weeks, 0.09 (t=1.72) at 4 weeks. Quintile sort spread 8.6-11.3% per week at 1-3 week horizons; effect "somewhat smaller" post-2013 (spreads 3-8%) and out of sample (2.4-8.2%). Daily BTC effect does not survive bootstrap at lag 1 (bootstrapped t=1.22). ETH daily momentum is weaker and flips sign at 5 days.
- Source: https://www.nber.org/system/files/working_papers/w24877/w24877.pdf
- Implication: the horizon where crypto momentum is well-supported is 1-3 weeks, not hours.

### B5. Crypto: intraday returns mean-revert at 1-4h and are conditional. Strength: MODERATE
- De Nicola (2021): significant negative first-order autocorrelation in BTC returns at 1, 2 and 4 hour intervals ("systematic mean reversion"); bigger moves are followed by stronger reversals; explanations: overreaction, excess volatility, cascading liquidations.  https://ledger.pitt.edu/ojs/ledger/article/view/213
- Wen, Bouri, Xu, Zhao (2022): BTC 2013-2020 shows both intraday momentum and intraday reversal; the sign depends on large price jumps, FOMC releases, liquidity, COVID. Reversal is described as unique to crypto. Timing based on predictors beat buy-and-hold. https://ideas.repec.org:443/a/eee/ecofin/v62y2022ics1062940822000833.html
- Birmingham/Financial Review 2022: BTC first half-hour positively predicts last half-hour; strongest in the highest-volume/volatility sessions; driven by liquidity provision. https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/
- Hurst exponent for short-interval BTC returns about 0.42 (2019-20), about 0.49 (2021-22): slightly mean-reverting, approaching random walk. https://arxiv.org/abs/2402.11930v2
- Short-horizon "momentum" trades in a 15m system are therefore on the wrong side of a documented reversal tendency unless a regime filter selects trending conditions.

### B6. Small, illiquid coins reverse at the daily horizon; only the most liquid coins show momentum. Strength: MODERATE
- Zaremba et al. (2021, 3,600+ coins): daily short-term reversal; the most-traded coins show daily momentum, the rest reverse; effect is tied to illiquidity. No magnitudes in the abstract. https://ideas.repec.org/a/eee/finana/v78y2021ics1057521921002349.html
- Implication: "small-cap crypto" is exactly the segment where breakout/momentum entries are most likely to get faded and stopped. Trend systems that work in the literature restrict to liquid coins (see B7).

### B7. Crypto trend following (Donchian) with volatility targeting. Strength: MODERATE (author is a practitioner/paper partly paywalled)
- Zarattini, Pagani, Barbon (2025, "Catching Crypto Trends"): Donchian breakout on daily closes with ensemble of lookbacks 5, 10, 20, 30, 60, 90, 150, 250, 360 days; trailing stop = higher of previous stop and midpoint of max/min close over the lookback; size = 25%/90-day annualized vol, leverage cap 200%. Universe: up to the top 20 most liquid coins (median 30-day volume at least $2M), survivorship-free. Jan 2015-Mar 2025: about 18% net CAGR at 0.10% costs, 11% alpha vs BTC buy-and-hold; abstract: Sharpe above 1.5 net, alpha 10.8%.
- Sources: https://www.cxoadvisory.com/technical-trading/crypto-asset-trend-following-strategies/ ; https://ideas.repec.org/p/chf/rpseri/rp2580.html
- Trading range breakout is also the strongest of 7 trend rules on BTC 2010-2019, adding the most value in strongly trending markets (Gerritsen et al. 2020; cost treatment unclear): https://ideas.repec.org/a/eee/finlet/v34y2020ics1544612319303770.html
- BTC price/MA ratio predicts daily returns in and out of sample; SMA(5..100) timing 2010-2017 gave Sharpe 2.2-2.6 vs 2.0 buy-and-hold with max drawdown -66 to -70% vs -89.5%; gross of costs, breakeven friction only 1.1% (5-day) to 4.5% (100-day); data-snooping caveat. https://ideas.repec.org/a/bla/finmgt/v50y2021i1p107-137.html ; https://www.cxoadvisory.com/currency-trading/timing-bitcoin-with-smas/
- Note: the breakeven friction numbers show short MAs are cost-fragile, long MAs robust.

### B8. ATR trailing stop width. Strength: WEAK-MODERATE (single recent preprint, 2022-2024 crypto sample, internal inconsistencies noted)
- AdaptiveTrend (arXiv 2602.11708): Sharpe surface is flat for ATR multiplier in [2.0, 3.5], centred near 2.5; removing the dynamic ATR trailing stop dropped Sharpe 2.41 to 1.68 and worsened drawdown to -22.4%, the largest single-component effect. 6-hour bars. Reported figures do not fully reconcile. https://arxiv.org/html/2602.11708v1
- Kaminski & Lo (2014): analytic framework; empirically at longer sampling frequencies certain stop-loss policies can raise expected return and cut volatility (under momentum), but stops cost return under a random walk. https://ideas.repec.org/a/eee/finmar/v18y2014icp234-254.html (abstract only)
- Osler (NY Fed): stop-loss orders cluster just beyond round numbers; currency trends accelerate after crossing round numbers; take-profit orders cluster at round numbers and rates often reverse there. Significant over hours, mostly not days (1996-98 minute data). https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr150.html . Implication: do not put stops/targets exactly on round numbers; place stops 0.2-0.5 ATR beyond them.
- I did NOT find a rigorous study of how ATR multiple changes win rate. Mechanically, a tighter stop raises stop-out frequency in noisy markets. Treat win-rate vs ATR-multiple claims as untested; run it as your own parameter sweep.

### B9. Volatility-scaled sizing / volatility targeting. Strength: STRONG for equities/credit and momentum factors; NEGLIGIBLE Sharpe effect for bonds/currencies/commodities (but lowers tails)
- Moreira & Muir (JF 2017): scaling factor exposure inversely to recent variance gives large alphas and higher Sharpe for market, value, momentum, profitability, ROE, investment factors and FX carry. https://www.nber.org/papers/w22208
- Harvey et al. (Man AHL, 2018, 60+ assets, daily from 1926): volatility targeting improves Sharpe for risk assets (equities, credit), negligible for bonds, currencies and commodities; reduces tail risk and left-tail severity across all assets (large losses occur in high-vol periods when exposure is already cut). https://www.man.com/insights/the-impact-of-volatility-targeting
- Daniel & Moskowitz (momentum crashes): dynamically scaled momentum has Sharpe about 0.65 vs 0.28-0.60 unscaled for US equity momentum, constant-vol scaling about 0.52; the worst unscaled month was -74% (Aug 1932). https://www.nber.org/system/files/working_papers/w20439/w20439.pdf
- Implication: for a stop-out-heavy system the first-order benefit is fewer catastrophic trades, not a magic boost to win rate.

### B10. Intraday trend-following with a volatility "noise area" filter. Strength: MODERATE (in-sample, iteratively built)
- Zarattini, Aziz, Barbon (2024) on SPY, May 2007-Apr 2024: bounds = open +/- average move-from-open over prior 14 days (adjusted for gaps); check each HH:00/HH:30; go long above the upper bound, short below the lower; size to 2% daily vol (up to 4x leverage) or 100%; trailing stop = the opposite bound (or the better of that bound and VWAP); flat at close. 19.6% net annualized, Sharpe 1.33, max drawdown -25%; assumed $0.0035 commission + $0.001 slippage per share. Authors/reviewers flag in-sample overfit risk. https://www.sfi.ch/de/publications/n-24-97-beat-the-market-an-effective-intraday-momentum-strategy-for-s-p500-etf-spy ; https://www.cxoadvisory.com/momentum-investing/complex-intraday-time-series-momentum-strategy-applied-to-spy/
- Implication: the only intraday momentum design with a decent published net result requires price to move out of the typical-range band before entry. That is a volatility-expansion confirmation filter, directly codeable.

### B11. Session / time-of-day effects. Strength: MODERATE for volatility timing, WEAK for return direction
- FX: volatility highest when London and New York overlap (about 13:00-16:00 GMT); spikes at Tokyo open (about 00:00 GMT), Tokyo fix (about 01:00 GMT), London fix; lowest in Sydney/Asian lunch. RBA Bulletin Dec 2007 (AUD/USD 10-minute absolute change 0.045% offshore vs 0.035% in the Sydney session). https://www.rba.gov.au/publications/bulletin/2007/dec/1.html
- Crypto: volatility and volume spike at 00:00 and 16:00 UTC (smaller at 08:00), low near 05:00 UTC; Coinbase volume much lower 05-12 UTC; Binance illiquidity about 30% above average in East Asian night; weekend volume and volatility lower, Saturday most clearly. The study measures volatility and volume, not return direction. https://arxiv.org/pdf/2109.12142v2.pdf
- Binance perpetuals show burst of activity at minutes 0, 15, 30, 45 (first 10 s: trades +26%, dollar volume +32%, absolute returns +26%); predictable return per boundary about 0.5 bp, far below a 5 bp taker fee. Do not enter in the first seconds of quarter-hour candle opens. https://arxiv.org/pdf/2607.09426
- Weekend: low volatility and volume, so breakouts on weekends have less follow-through (volume-based inference; no strong return-direction evidence found).

### B12. Funding rate / positioning in crypto. Strength: WEAK for direction, MODERATE for crash risk
- BIS "Crypto carry": futures carry averages above 10% a year and reaches 60%; high carry predicts future crashes; excess volatility vs spot; leveraged trend-chasing retail demand explains it. https://www.bis.org/publ/work1087.pdf
- Brave New Coin test (BitMEX, Nov 2022-Feb 2023, 4 months): funding rate explains almost none of next 8-hour return (R2 0.001-0.017). https://bravenewcoin.com/insights/testing-theory-is-perpetual-swap-funding-rate-predictive
- BitMEX blog: fading +/-1-2 sigma funding (mean 1.66 bps, sigma 17.13 bps) had hit rates 44-53% and profits mostly from collected funding; sample 21-81 per bucket, no significance tests. https://www.bitmex.com/blog/xbtusd-funding-mean-reversion-strategy
- Implication: use extreme positive funding as a risk-down flag for new longs (crash risk), not as an entry signal.

### B13. Chart patterns and technical analysis in general. Strength: MODERATE-WEAK
- Lo, Mamaysky, Wang (JF 2000): US stocks 1962-1996; several technical patterns (head-and-shoulders, double bottoms etc., detected with kernel regression) "do provide incremental information and may have some practical value". It is informational value, not net trading profit. https://www.nber.org/papers/w7613
- Park & Irwin (2007 survey of 95 modern studies): 56 positive, 20 negative, 19 mixed; early studies found profits in FX and futures but not stocks; many suffer data-snooping, ex-post rule selection, weak cost accounting. https://ideas.repec.org/a/bla/jecsur/v21y2007i4p786-826.html
- Neely, Weller, Dittmar (1997): genetic-programming rules showed out-of-sample excess returns in 6 FX rates 1981-1995 not explained by systematic risk (Olson later found such profits shrank; not re-verified here). https://gpbib.cs.ucl.ac.uk/gp-html/neely_1997_JFQA.html
- Bulkowski: the pattern failure rate rose in recent years: using a 10% move threshold over 13,932 observations (1991-2008), upward breakouts failed 14% in the 1990s vs 28% in 2003-2007; downward 26% vs 49%. Self-published data, treat as moderate-weak. https://www.luxalgo.com/blog/chart-patterns-with-highest-failure-rates/ ; ranking: https://www.thepatternsite.com/id84.html
- Elliott Wave specifically: I found NO peer-reviewed out-of-sample profitability test of EW counts with reported trading statistics. One 2017 FX paper (abstract only) claims accuracy; Fibonacci-efficacy paper (Bhattacharya & Kumar 2006) abstract gives no result. Verdict: EW evidence is weak. Use it as a structure/stop-placement framework, not an edge generator.

### B14. Higher-timeframe alignment. Strength: INDIRECT
- No dedicated study found. Indirect support: the MA/TSMOM evidence (B1, B2) is for the slow trend; short-horizon returns have the opposite (reversal) tendency (B5). Trading small-timeframe signals in the direction of the slow trend is the standard way to harvest the first while avoiding the second. Treat as a hypothesis to test, not a proven edge.

### B15. ADX / realized-vol regime filters. Strength: WEAK
- I found no peer-reviewed test of ADX thresholds (search returned only educational/blog pages). The nearest evidence: TREND (significance-gated) rule cuts turnover with equal Sharpe (B3); breakout rules work best in strongly trending markets (B7); vol scaling helps tails (B9). ADX > 20-25 is the conventional threshold, with no published validation. Run it as an A/B filter in your own backtest.

---------------------------------------------------------------------------

## 3. Which markets / timeframes the evidence favours for a trend/swing system

- Timeframe: daily and slower bars. 12-month, 3-month and 1-month lookbacks for futures (B1); 1-3 week for crypto (B4); daily Donchian with lookbacks 5-360 days (B7). Evidence for 15m-1h momentum entries is thin and partly adverse (B5: negative autocorrelation at 1-4h; Hurst about 0.42-0.49).
- If you must stay intraday, the best-supported design is volatility-expansion breakout with VWAP/band trailing stop and a flat-at-close rule on a liquid index ETF (B10), not on illiquid small caps.
- Asset classes: the TSMOM literature shows all four (equity indices, bonds, commodities, currencies) with positive 12-month returns; commodities had the highest alpha t-stat at 4.66 (vs bonds 3.53, equity indices 3.77, currencies 3.41), and commodity trend held up post-crisis in one dataset, but another found low commodity returns with low correlation to other trend strategies (Baltas/Kosowski summary in alphaarchitect). Gold/commodities and FX are fine for a swing system; stock indices work but trend benefit is smaller and less stable post-2009.
- Crypto: trend works for BTC/ETH and top-20 liquid coins at daily/weekly horizons; small illiquid coins reverse at the daily horizon (B6). Crypto momentum effect shrank after 2013 but did not vanish (B4).
- Regime caution: trend following has multi-year bad stretches (post-2009 Sharpe near 0 to 0.3 for the Baltas/Kosowski sample; -25% drawdowns), so expect long flat/negative periods even with a good system.
- Cost: costs are a large share of gross return for fast systems (about 10% of gross for 12-month TSMOM; BTC SMA(5) breakeven friction only 1.1%). 15m systems on small caps pay spread and slippage on every round trip.

---------------------------------------------------------------------------

## 4. Top 8 concrete changes to test in our app (ranked)

1. Market/universe filter: trade only liquid coins (top ~20 by 30-day median dollar volume, at least $2M/day) and drop small caps for momentum/breakout entries.
   - Rule: `liquid = median(30d dollar_volume) >= 2e6 and rank_by_volume <= 20; if not liquid: skip`.
   - Expected effect: removes the segment where daily reversal dominates (B6), cuts slippage; should reduce the "stopped out within hours" pattern most. Evidence: moderate.

2. Slow-trend gate (higher-timeframe alignment): take longs only if daily close > SMA(100) (or 12-month/3-month return > 0 for TSMOM sign) and shorts only if below; EW wave count must agree with this direction.
   - Rule: `long_ok = close_1D > sma(close_1D,100) and ret_63d > 0; short_ok = mirror; require wave_direction == trend_direction`.
   - Expected effect: fewer counter-trend wave-2/4 entries; harvests the best-supported edge (B1, B2, B7) and avoids short-horizon reversal. Evidence: strong for the trend sign, indirect for the gate on intraday entries.

3. Timeframe shift: move signal generation from 15m/30m/1h to 4h and 1D, and keep 15m-1h only for trigger timing. Require the stop distance (wave-1 origin to entry) to be at least 2.0 ATR(14) of the signal timeframe, else skip.
   - Rule: `if (entry - stop) < 2.0*ATR14_signalTF: skip`; no entries in the first 30 seconds of a quarter-hour candle.
   - Expected effect: fewer, larger-R trades; cost and noise drag fall; stops are no longer inside normal noise. Evidence: moderate (B5, B3, B11).

4. ATR trailing stop of 2.5 x ATR(14) (test 2.0-3.5), ratcheting only in the trade's favour, replacing/merging with the wave-1-origin stop (use whichever is farther, cap total risk by sizing, not by tightening the stop).
   - Rule: `trail = max(trail_prev, highest_high - 2.5*ATR14)` for longs; initial stop = min(wave1_origin - 0.3*ATR, entry - 2.5*ATR). Do not place stops/targets exactly on round numbers (add 0.3-0.5 ATR).
   - Expected effect: fewer premature stop-outs vs tight stops; Sharpe surface flat in [2.0, 3.5] in the one study found. Evidence: weak-moderate; run your own sweep with win-rate and expectancy per multiple.

5. Volatility-scaled position size: size so the stop distance equals fixed fractional risk, then cap by vol target; cut size when vol spikes.
   - Rule: `qty = (equity*0.5%) / (entry-stop); if realized_vol_20d > 1.5*median(realized_vol_20d over 120d): qty *= 0.5; leverage cap 2x`.
   - Expected effect: smaller left-tail losses and drawdowns; modest Sharpe gain for risky assets (B9). Evidence: strong for tails, moderate for Sharpe in crypto.

6. Breakout confirmation instead of touching a Fibonacci level: wave-3 entry only after a close above the wave-1 high (Donchian(20) on the signal TF) with volume above its 20-bar average and the move out of the 14-bar typical range band; wave-2 entry candidates require a reversal trigger candle.
   - Rule: `long = w2_ret in [0.5,0.786] and close > highest_high(w1) and volume > sma(volume,20) and (close - open_session) > avg_move_from_open_14d`.
   - Expected effect: avoids catching falling knives at 61.8%; aligns with the best-supported breakout designs (B7, B10). Evidence: moderate.

7. Regime gate to be A/B tested: trade trend signals only when ADX(14) >= 20 (test 20/25) and Bollinger bandwidth or ATR percentile > 30th percentile of last 100 bars; in low-ADX regimes use no trend entries. Add a funding/crowding risk-down: if perp funding is in the top decile of its 90-day distribution, halve new long size.
   - Expected effect: fewer trades in chop; ADX threshold is unvalidated (B15), funding flag modest (B12). Evidence: weak. Measure rather than assume.

8. Session/time filter and exit tweak: skip new entries on Saturday/Sunday UTC and 05:00-12:00 UTC for USD-quoted crypto pairs; for forex enter only during 07:00-16:00 GMT (London plus overlap); take partial profit at T1 but let the remainder trail on the ATR stop rather than a fixed target; for wave 5 setups use half size and require EWO divergence.
   - Expected effect: avoids low-liquidity, low follow-through periods (B11); keeps right-tail winners that pay for stops (trend following has low win rate and relies on large winners). Evidence: moderate for volatility timing, weak for return direction.

### Meta-advice
- Keep EW as a stop-placement/structure tool; the evidence for EW counts as a stand-alone signal is weak. Backtest the whole system with and without EW to see whether it adds anything over a plain trend + breakout + ATR-stop baseline.
- Backtest with realistic costs (0.10% round trip minimum for crypto; Zarattini tested 0.10-0.50%), walk-forward, and report net expectancy in R, not win rate. Expect low win rates (35-45%) for trend systems; profit comes from large winners.
