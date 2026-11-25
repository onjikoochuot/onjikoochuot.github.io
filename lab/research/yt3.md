# yt3 - Elliott Wave YouTube chunk 3 (posts 24-58): codeable rules

Note: several transcripts are non-English OCR garbage (posts 34, 41, 51, 56) or truncated; posts 55, 37 had no usable content. Most content is beginner-level; the NEW material is concentrated in Sigma Allocations (alternation/channels), XAUUSD Global (gold wave-3 trade), Tony's Market Update (1.0 "fake reversal" alarm, prior wave 4), Elliott Wave Insight (invalidation ladder, ratio ranges), Raimundo (sample-size rule), EWI Kelly (extensions), Luna (Fib entries).

## 1. Rules

1. Wave-2 depth: expect 0.50-0.618 of wave 1 (valid band for "typical"; 0.382-0.50 also seen; >0.618 still legal up to <1.0, e.g. 0.67, 0.76 seen). (5 videos agree: Sigma, EW Insight, HR, Nisarg, XAUUSD; Raimundo says 0.382-0.50, MT Global says 0.618)
   Code: `w2_ok = 0.382 <= (w1_end - w2_low)/(w1_end - w1_start) <= 0.618`; score bonus if in [0.5,0.618]; hard reject at >=1.0
   Source: Elliott Wave Guidelines (Sigma); Elliott Wave impulse (EW Insight); EW for Beginners (HR); Module 6 (Nisarg); Why Your Wave Counts Fail on Gold

2. Wave-4 depth: expect 0.236-0.382 of wave 3 (0.44 and 0.41-0.19 seen; MT Global says 0.382). (4 videos agree)
   Code: `w4_ok = 0.236 <= (w3_end - w4_low)/(w3_end - w2_low) <= 0.382`; soft score only
   Source: Sigma; EW Insight; XAUUSD Global; Nisarg; MT Global

3. Wave-3 target: 1.618 x wave 1 measured from wave-2 end; alternates 1.272 and 2.618. First partial target 1.0 x wave1 from w2 low, then 1.618. (4 videos agree)
   Code: `T1 = w2_low + 1.0*L1; T2 = w2_low + 1.618*L1; T_alt = w2_low + {1.272, 2.618}*L1`
   Source: EW Insight impulse; XAUUSD Global; HR; Nisarg

4. Wave-5 target: 0.618-1.0 x wave 1 from wave-4 end (primary: wave5 = wave1 length from w4 low); if wave 3 extended, wave 5 ~ 1.0 or 0.618 of wave 1. Wave 5 normally ends beyond end of wave 3 (else truncated, "rare"). (3 videos agree)
   Code: `T5_lo = w4_low + 0.618*L1; T5_hi = w4_low + 1.0*L1; truncated if w5_end < w3_end`
   Source: EW Insight impulse; XAUUSD Global; EWI Extensions (Kelly)

5. Equality/extension inference: if waves 1 and 3 are about equal length, expect wave 5 to extend (be larger); if wave 3 extended, wave 5 simple ~ w1 or 0.618*w1. Only one of 1/3/5 extends in the vast majority of impulses. In stocks wave 3 is the commonly extended one; in commodities wave 5 often. (EWI/Kelly, HR, XAUUSD note wave-5 can be longest on gold: 1.35x wave 1)
   Code: `if abs(L3-L1)/L1 < 0.15: expect L5 > L3 (allow wave5 breakout); else if L3 > 1.618*L1: L5_target = L1 or 0.618*L1`; market_type: equities -> prefer w3 trades, commodities -> allow w5 trades
   Source: How to Spot Elliott Wave Extensions (EWI); Elliott Wave for Beginners (HR); Why Your Wave Counts Fail on Gold

6. Overlapping series of 1-2, 1-2 early in a trend = warning an extended third wave is coming (not a 3-4). If an apparent 4 overlaps wave 1, relabel as 1-2/1-2 and expect a big third of third. Code: when candidate w4 enters w1 range, do NOT discard the trend; relabel to (1,2,1,2) and arm a breakout-long above last "wave 1" high with stop below last "wave 2" low.
   Code: `if w4_low <= w1_high: relabel(i1,i2,ii1,ii2); arm_breakout(high_of_latest_i1, stop=low_of_latest_i2)`
   Source: How to Spot Elliott Wave Extensions (EWI Kelly) (1 video; consistent with Raimundo: overlap -> diagonal or ABC alternative)

7. Invalidation ladder (exact moving stop/invalid level while a wave forms). While w2 forms invalid below start of w1; while w3 forms invalid below end of w2 (w2 low); while w4 forms invalid below end of w1 (w1 high); while w5 forms invalid below end of w4 (w4 low). For zigzag: while B forms invalid beyond start of A; once C underway, invalid if price moves back beyond end of B. (3 videos agree on first and third; ladder is from EW Insight)
   Code: `stop = {W2: w1_start, W3: w2_low, W4: w1_high, W5: w4_low}[current_wave]` ; zigzag: `{B: A_start, C: B_end}`
   Source: Elliott Wave impulse (EW Insight); Elliott Wave zigzag (EW Insight); Why Your Wave Counts Fail on Gold; Complete Beginner's Guide (Jagir)

8. TRADE WAVE 3 (best documented entry). Preconditions: wave 1 confirmed; draw fib from w1 start to top; wave 2 must reach at least 0.5 and stay above w1 start. Trigger on hour chart: first close above the last lower high (the lower high formed during the wave 2 pullback = "change of character"). Entry: buy on that close. Stop: 5 points under the start of wave 1 (i.e. start of w1 minus a small buffer; implies buffer ~ 0.1% of price on gold ~ 2000-2500). Targets: 1.0 then 1.618 of w1 projected from w2 low. Example: gold Aug-Sep 2024, risk 67.7 pts, reward 134.5 pts (~2R, target = 1.618 reached 24 Sep, stop never touched; claimed result, UNVERIFIED).
   Code: `if w2_retr >= 0.5 and w2_low > w1_start and close[1h] > last_lower_high: enter_long; stop = w1_start - buffer; tp1 = w2_low + L1; tp2 = w2_low + 1.618*L1`
   Source: Elliott Wave Trading Strategy: Why Your Wave Counts Fail on Gold (XAUUSD Global)

9. Wave-2 end confirmation: end of a corrective w2 often = wave C ~ equal to wave A (0.96 in example) landing slightly past 0.618 of w1. Use as second condition: `abs(C/A - 1.0) < 0.1 and w2_retr in [0.55,0.70]` as high-confidence w2-complete context.
   Code: `w2_done_hint = 0.9 <= C_len/A_len <= 1.1 and 0.5 <= retr <= 0.7`
   Source: Why Your Wave Counts Fail on Gold (XAUUSD Global); Elliott Wave: 5 waves or 3 (Tony) says C leg often = A leg or nearby fib

10. Wave-5 trade: stop under the top of wave 1 (4 must not overlap); target w5 = w1 measured from w4 low; but SKIP when reward < ~1R: example stop 65.2 pts vs target 43.1 pts (less than 1R) -> "a pro skips it even though it worked". Late-triggered entries (price already above top of w3 when trigger fires) are poor.
   Code: `if (tp - entry)/(entry - stop) < 1.0: skip; stop = w1_high (or w4_low for tighter)`
   Source: Why Your Wave Counts Fail on Gold (XAUUSD Global)

11. Minimum R:R / swing definition: define swings by a fixed rule so counts are reproducible: swing only counts when price turns at least 2% from its high/low on hourly candles (gold example). Labels placed only at those swings.
   Code: `zigzag(close_or_hl, pct=0.02) on 1h; label waves only on zigzag pivots` (make pct a parameter per asset; scale w/ ATR)
   Source: Why Your Wave Counts Fail on Gold (XAUUSD Global)

12. Alternation (scoring + trade timing). If wave 2 is sharp/deep/fast, expect wave 4 sideways/shallow/slow, and vice versa. Measurable: wave-4 duration ~ 2.5x to 16x wave-2 duration in the examples (Nifty 2.5x, 4x; gold 16x); depth wave 2 ~ 45-76% vs wave 4 ~ 19-41%. Do not trade inside the sideways wave 4; wait for range to finish. Never invalidates a count.
   Code: `alt_score = (depth2 > depth4) + (bars4 > 2*bars2) + (type2 != type4)`; use to rank counts, never to reject
   Source: Elliott Wave Guidelines (Sigma); EW for Beginners (HR); Why Your Wave Counts Fail (XAUUSD); EW Insight impulse (4 agree)

13. Wave-4 sideways-range breakout entry (Sigma worked example, Nifty 2021): after sharp w2, wait for sideways w4 to end. Signs it finished: (a) dip marginally breaks support zone then reverses same day, (b) next pullback makes a HIGHER LOW. Entry: buy-stop just above the last lower high of the range (15,044 -> stop order at 15,060, ~0.1% above). Stop: just below the higher low (14,592 -> 14,560, ~0.2% below). Target: 3R (risk 500 pts -> target +1500). Outcome claimed: hit 3R in 3 months (UNVERIFIED, single example).
   Code: `range_end = low_k > prior_range_low*0.999 and higher_low; entry = buystop(last_lower_high + 0.1%); stop = higher_low - 0.2%; tp = entry + 3*(entry-stop)`
   Source: Elliott Wave Guidelines: Alternation, Channeling... (Sigma Allocations)

14. Channel projections. After w2 complete: line from w1 start through w2 end, parallel through w1 end -> rough guide for wave-3 end (w3 often breaks above; example projected 11,973, actual 11,856, about 1% short). After w4 complete: line through w2 and w4 ends, parallel through w3 end = wave-5 target zone; strong fifths can briefly throw over the upper line on heavy volume. Use log scale for long/fast moves (arithmetic channels make w5 look too short).
   Code: `base = line(w2_low, w4_low); upper = parallel(base, through=w3_high); w5_target = upper at t5 (log price)`; flag throwover if close > upper and vol > 1.5*avg
   Source: Elliott Wave Guidelines (Sigma Allocations)

15. Zigzag (correction/C-wave trading): wave B retraces 0.382-0.786 of A (deeper than that argues flat; B cannot exceed A start); wave C travels 0.618-1.0 of A measured from B end, 1.618 when extended; normally ends beyond A end (truncated rare). Another video: B < 0.62 of A, C beyond A. C ~ 1.0 x A is the primary target ("100% of A from end of B"; Tony: C often = A or nearby fib). (3 videos agree)
   Code: `C_target = B_end - 1.0*A_len (downward zigzag); band [0.618,1.0,1.618]; B_ok = 0.382<=B/A<=0.786; reject if B_end beyond A_start`
   Source: Elliott Wave zigzag (EW Insight); EW for Beginners corrections (HR); 5 Waves or 3 (Tony)

16. Flat/triangle structural rules: regular flat: B retraces nearly all of A, C ends near A end; expanded flat: B beyond A start, C overshoots A end; running flat: B beyond A start, C fails to reach A end (hints strong trend). Triangle: appears only in wave 4, wave B (rare in X); NEVER in wave 2 or wave A; 5 legs A-E each a three; contracting: each leg shorter than previous; expanding legs longer. Triangle trade: enter at end of leg D / after E in direction of larger trend; stop at end of wave E; triangle invalid if price goes beyond end of wave C (contracting). Wave E completes -> sharp thrust in trend direction.
   Code: `triangle_allowed = wave in {4,B,X}; contracting: len[i] < len[i-1]; invalid if break beyond C_end; entry on break of E-D/A-C trendline in trend dir; stop = E_end`
   Source: Triangle Pattern Explained (Elliott Wave Vision); EW for Beginners (HR); Elliott Wave impulse (EW Insight: wave two can be any correction except triangle)

17. Prior wave 4 as degree-specific trend-change level: when a five completes, the low of the last wave 4 before the final wave 5 is support; break of that wave-4 low is the FIRST INDICATION of reversal ("indication, not confirmation"). Must use the wave 4 of the same degree as the high (the wave 4 of the advance immediately before that high); once broken it is "spent" and a later re-cross does NOT restore it.
   Code: `trend_reversal_flag = close < w4_low_of_final_five (once, one-shot); mark level consumed afterwards`
   Source: Elliott Wave: 5 Waves or 3? How I Actually Decide (Tony's Market Update)

18. 1.0 (A=C / equal-leg) level as alarm for fake direction change: if a move is expected to be three-wave (corrective) and reverses right at 1.0 x A (C = A), probability the move is done rises; if it is expected to be a five-wave move and reverses at 1.0, be cautious - it may be a wave 4 with extension into wave 5 still to come and the reversal fails. Code: mark 1.0 level of prior leg; context decides: corrective context -> take reversal; impulsive context -> do not fade.
   Code: `at level 1.0*A: if context=='corrective' reversal_prob+=; if context=='impulsive' require extra confirmation / skip fade`
   Source: Elliott Wave: 5 Waves or 3? (Tony's Market Update)

19. Context-first expectation: after finishing a wave 1 or 3 and starting to reverse, expect three-wave (ABC) correction; inside a run of 1s/3s/5s expect impulsive five. Same opening bars, different expectation from larger structure, not from the move itself. Carry two labels (bullish alt and bearish alt) with own invalidation price; do not pick one until market does.
   Code: `maintain primary_count and alt_count each with invalidation price; on break of primary invalidation -> promote alt`
   Source: 5 Waves or 3 (Tony); Why Your Wave Counts Fail (XAUUSD) "keep a main count and a second count each with its own invalidation price"

20. Multi-timeframe: count on the higher timeframe, time entry on the lower. A finished five on the 4h can be just wave 1 or 3 on daily. Use only the current degree plus one above and one below. Example: gold 4h five = part of a bigger rise; trigger on 1h. (3 videos agree)
   Code: `htf_trend = count(1D/4H); trigger on 1H: only take longs if htf_trend==up and htf wave in {1->3 pending, 3, 5}`
   Source: Why Your Wave Counts Fail on Gold (XAUUSD); Complete Beginner's Guide (Jagir); Module 6 (Nisarg)

21. Sample-size for starting a count (Raimundo): choose the chart/timeframe where the sample contains at least ~13 waves (subdivisions); if there are fewer or hugely more, change timeframe (monthly, 3-month, 12-month for long-term). First directional move up to its max peak will always be wave 1, 3, 5, A, C or E (never B). Mark start to extreme, then the correction rectangle -> count 1,2.
   Code: `choose tf s.t. n_swings in [13, ~40]`; `first_leg.label in {1,3,5,A,C,E}`
   Source: How to Start an Elliott Wave Count on a Chart? (Raimundo elliottista)

22. Wave 3 must not just be longer than w1; it is not required to be the longest - w5 may exceed w3 as long as w3 > w1. Wave 4 may not close in or touch the territory of wave 1 (Raimundo: "cannot close there, cannot touch"). If touched: impulse invalid -> alternatives: diagonal, or ABC correction that "tends to go deep". For diagonal/propulsion, invalid only if breaks the bottom of wave 2 (wave 3 low) - extra rule.
   Code: `w4_low > w1_high (strict, no touch)`; `if touched: switch hypothesis diagonal/ABC; diagonal invalid if price < w2_low`
   Source: The 3 Elliott Wave Rules: How to Validate an Impulsive Count (Raimundo); XAUUSD Global (wave 4 stopped 2.1 pts above w1 top = still valid)

23. Wave-3 must also close beyond end of wave 1 (Mind Math Money's version "wave three must always close past the end of wave one").
   Code: `w3_close_extreme > w1_high`
   Source: STOP Trading Until You Know These Elliott Wave Theory Rules (Mind Math Money)

24. Wave-1 / bottom entry confirmation (checklist, VIDEO LARGELY UNREADABLE; only slide keywords): volume spike / capitulation volume, key support retest, hammer/doji formation, bullish RSI divergence, false breakout (spring) before wave 1. Code: `wave1_bottom = capitulation_vol (vol > 2-3x avg) & hammer/doji at support & RSI bullish divergence`; thresholds NOT given in the source (my numbers are placeholders to tune).
   Source: How to Find the Bottom of a Coin: Identifying Elliott Wave 1 (Adnan) - slide text only, low confidence

25. Wave-5 exhaustion via momentum divergence: wave 5 makes a new price high while RSI fails to make a new high = bearish divergence; combine with late-wave-5 count for a two-clue confluence; if tools disagree with count, trust tools. Also in "Chart Whisperer": higher-low divergence at final fifth-of-fifth with reclaim of the wave-4 level by an engulfing "control bar", retest or sweep of the level is healthy.
   Code: `w5_end_signal = price_high5 > price_high3 and rsi_at5 < rsi_at3 ; confirm with close back below w4 low / engulfing`
   Source: Module 6 - Elliott Wave Theory Basics (Nisarg Sutaria); What Is This Plus This? (Chart Whisperer)

26. Fib-retracement pullback entries after a swing (non-wave-labeled, Luna): after a drop, draw fib from swing bottom to top; entries at the 0.236, 0.382, ~0.414 zones, scaling in; retest of an old peak that forms a double top = additional short entry; take profit 50-100 points (index), R:R set at 1:3.
   Code: `short_entries = [swing_low + k*(swing_high-swing_low) for k in (0.236,0.382)]; tp_rr = 3`
   Source: PART 2 Elliott Wave Basics in Practice (Luna Financial Insight)

27. Retracement pullback long entry (Money Sutra): in a rising structure (higher highs / higher lows), measure the retrace; wait for a rebound signal (strength above prior high) rather than buying because a % level appears; stop below the most recent confirmed higher low; target prior high or defined R:R. INTC example: swing 34.95->49.17, pullback 40.63 (=60% retrace) then +54.9% rebound.
   Code: `if hh_hl_structure and retr in [0.5,0.618] and close > prev_swing_high_of_pullback: enter; stop=last_higher_low; tp=prior_high or 2R`
   Source: Elliott Wave Theory for Beginners (Money Sutra)

28. Wave 1 pullback guidance: wave 1 of fifth degree often pulls back ~38% of wave 3 (HR - probably meaning wave 4). Skip.

29. Wave-3 signature check: a real wave 3 usually moves fast and breaks obvious highs; if it looks weak, question the count. Code: `w3_velocity = L3/bars3 > 1.0 * (L1/bars1)` and `w3 breaks prior swing high`.
   Source: Why Your Wave Counts Fail on Gold (XAUUSD); Mind Math Money; EWI

30. Count-flip rule: a three-leg ABC that continues becomes 1-2-3; a completed five can become wave A. Counts are working labels, so rerun the labeler on every new swing; a count never "locks".
   Code: `recompute labels each bar; keep hypothesis list`
   Source: 5 Waves or 3 (Tony)

## 2. Filters (avoid trading when...)

F1. Count obeys no objective swing rule / you label every wiggle on a 5-min chart: waves all about the same length, none notably strong, price oscillating in narrow range = sideways, not a trend. Small timeframe = more false signals. (4 videos agree: Black7ks/EP14, Raimundo, Nisarg, Money Sutra)
    Code: `skip if max(L1,L3,L5)/min(L1,L3,L5) < ~1.3 or swings < threshold (>=2% on 1h in gold example)`
    Source: EP14 Elliott Wave: Detailed 27-Minute Guide; How to Start a Count (Raimundo); Module 6 (Nisarg); Money Sutra

F2. No pre-defined invalidation price: never enter without a stop at the count-invalidation level (small loss becomes blown account). Code: `require stop_price defined before order; reject if risk > max_risk`.
    Source: EP14 Elliott Wave 27-Minute Guide; Money Sutra; Jagir

F3. Trade-trigger arrives late with < 1R room to target (wave 5 trade: stop 65.2 vs target 43.1). Code: `skip if reward/risk < 1.0` (suggest min 1.5-2).
    Source: Why Your Wave Counts Fail on Gold (XAUUSD)

F4. Around major news/data (FOMC, Fed decision day): several waves can pack into one candle; do not trust small counts near major data. Code: `skip counts whose waves span < 3 candles around scheduled high-impact event; skip entries within N bars of event`.
    Source: Why Your Wave Counts Fail on Gold (XAUUSD)

F5. Forcing a count to fit a desired direction: if price breaks below the start of wave 1 during 'wave 2', count is dead - recount immediately, do not "move the numbers". Code: `on break of invalidation: close position, no re-labeling to same direction without new pivot`.
    Source: EP14 Elliott Wave Guide; Jagir (gold example: 2% stop loss then re-entered at next setup for 12% gain)

F6. Wave 3 looks weak (slow, no break of obvious highs) -> question the count / skip. (also "count where wave 3 is the shortest" is probably 1-2,1-2 not 3-4). Code: see rule 29.
    Source: XAUUSD Global; EWI Extensions

F7. Over-certainty and diagonal rescue: "Calling everything a diagonal is how traders rescue broken counts". Use diagonals rarely. Code: `limit diagonal relabels to max 1 per count; if overlap occurs, default to ABC hypothesis`.
    Source: XAUUSD Global; Raimundo; Tony's Market Update ("times hurt worst were when most certain")

F8. Do not trade inside the sideways wave 4 (alternation expects long, boring range after a sharp w2); wait for range to end (higher low + break of last lower high). Code: `if alt_expected_sideways_w4 and not range_break: no entry`.
    Source: Sigma Allocations

F9. Late wave 5 after a long advance: reduce long exposure/tighten risk; expect ABC rather than another surge, especially with RSI divergence. Code: `if wave_est == 5 and rsi_div: no new longs, tighten stops`.
    Source: Module 6 (Nisarg); Elliott Wave Basics (Money Sutra)

F10. A single break of a prior higher low ("change of character") does not prove reversal; wait for confirmation of structure/momentum and have stop beyond the invalidation of the bearish idea. Code: `require 2 conditions (CHoCH + momentum or retest) to flip bias`.
    Source: Money Sutra; Raimundo (CHoCH validation)

F11. Elliott as a supplementary tool only: "never base a trade on a wave count alone"; if objective indicators (RSI, trend line break, volume, MAs) disagree with count, trust indicators. Code: `trade_ok = wave_signal AND (ema_trend_agree OR rsi/macd_confirm)`.
    Source: Module 6 (Nisarg)

F12. Fibonacci is only a reference zone, not an independent signal; always require invalidation, stop, capital management. Code: `fib level alone never triggers entry`.
    Source: Luna Financial Insight Part 2

F13. Triangle can never be wave 2 or wave A - reject counts labelling a triangle there. Code: `if pattern=='triangle' and wave in {2,A}: reject`.
    Source: Triangle Pattern Explained (Elliott Wave Vision)

F14. Crypto: gaps in traditional markets are not equivalent to gaps in 24/7 crypto print; do not apply gap rules to crypto. Code: `disable gap-based logic for 24/7 markets`.
    Source: What Is This Plus This? (Chart Whisperer) (garbled, low confidence)

F15. Extension check: counts where extension appears in both 3 and 5 or none are unusual; most impulses contain exactly one extension. Code: `penalize count if n_extended != 1`.
    Source: EWI Extensions

## 3. Contradictions / disputed points

- Wave 2 depth: 0.5-0.618 (EW Insight, HR, Nisarg, XAUUSD) vs 0.382-0.50 normal, 0.618 possible (Raimundo) vs usually 0.618 (MT Global). Treat 0.382-0.618 as the whole band.
- Wave 3 "shortest" rule: MT Global says wave 3 "must be the longest" and Mind Math Money says wave 3 "must close past end of wave 1" - Raimundo, XAUUSD and EWI explicitly say it only must NOT be the shortest; not required to be longest. (MT Global is wrong versus standard theory.)
- Wave 4 overlap: Raimundo says wave 4 cannot touch/close in wave 1 territory; XAUUSD says wave 4 stopped 2.1 pts above top of wave 1 still valid (no contradiction, just touch-vs-intrude tolerance). Diagonal exception: XAUUSD "use rarely"; Raimundo allows diagonal alternative.
- Wave 4 depth 0.236-0.382 (EW Insight, XAUUSD) vs fixed 0.382 (MT Global, Nisarg). Sigma examples show 19-41%, so band is wide.
- Wave-1 pullback guideline in HR ("wave one often pulls back around 38%"), unclear meaning, likely mis-transcribed wave 4.
- Wave 2 may be a triangle? EW Insight: "wave two can be any correction except a triangle" - consistent with Elliott Wave Vision (triangle never in 2 or A).
- Wave-5 target: EW Insight 0.618-1.0 of w1; Kelly says ~1.0 or 0.618 of w1 only if w3 extended; XAUUSD example had w5 = 1.35 x w1 and was the longest wave on gold, so cap is loose.
- Elliott subjectivity: Nisarg/Money Sutra/Tony say highly subjective, supplementary only; Jagir/Raimundo/XAUUSD present it as objectively usable with swing rules. Resolve by explicit swing rule.
- Entry timing: Luna says "we are not required to catch the very first wave; first wave is just confirmation" vs XAUUSD buying after wave 2 for the wave 3 (first wave already confirmed) - consistent (don't pick bottoms).
- Chart Whisperer advocates cutting winners at structure (value-area high / order block) and re-entering vs holding for full wave target (Sigma/XAUUSD hold to fib/3R) - style conflict.

## 4. Claims of performance (ALL UNVERIFIED)

- XAUUSD Global: one gold wave-3 trade, risk 67.7 pts, reward 134.5 pts (~2R), stop never touched, target 1.618 hit 24 Sep 2024. Single cherry-picked example; also shows a "count that failed" in June 2025 (details cut off).
- Sigma Allocations: Nifty 2021 wave-4-breakout trade, entry 15,060, stop 14,560, target 16,560, "+3R" hit 16 Aug 2021. Single example, after-the-fact.
- Trading With Jagir: gold trade 1 stopped out for 2% loss; same setup re-taken made 12% gain, net 10% over 2-4 weeks; taught "over 600 students"; "cheat code" for waves "10 times easier" (not revealed in the visible text).
- Tony's Market Update: "trading this method for over 10 years"; hurt worst when most certain (no win rate).
- Luna Financial Insight: used the method 3 years of 7 years trading; targets 50-100 points on index; R:R 1:3. No win rate.
- Money Sutra: Meta advanced 120.8% (2 Dec 2022 - 1 Jan 2023) as illustration of higher highs/higher lows structure; INTC rebounded 54.9% from the 60% retracement. Not a strategy result.
- Chart Whisperer: average entry on ETH about "15, 15, 19" (unclear), no win rate.
- No video gives a win rate or statistically tested edge. Nothing here is evidence of profitability.

## 5. Most promising ideas to test (ranked)

1. Wave-3 entry after confirmed wave 1: require w2 retrace >= 0.5 (and < 1.0), then entry on first close above the last lower high of the pullback (lower-timeframe CHoCH), stop = w1 start minus small buffer, TP1 = 1.0 x w1 and TP2 = 1.618 x w1 from w2 low, with min R:R >= 1.5. Fully mechanical, fits our existing wave-1/2 and Fib code; 2-3 videos agree on ranges. Test on gold/indices 1h with 4h/1D trend filter.
2. Invalidation-ladder moving stop (stop = w1 start for W2, w2 low for W3, w1 high for W4, w4 low for W5) with a reject-trade filter when reward < 1R. Provides objective exits and R:R gating for every Elliott-based setup; easy to backtest as an exit module.
3. Sideways-wave-4 range breakout (alternation-based): if w2 was sharp/deep (>=0.5 and bars < N), do not trade the w4 range; enter on buy-stop above last lower high after a higher low forms; stop below higher low; TP = 3R. Tests the alternation guideline directly with measurable time/depth ratios.
4. Prior-wave-4 break + 1.0-leg alarm for trend-ending: after a 5-wave advance, first close below the last wave-4 low of the same degree = reversal indication; equal-leg (C=A, 1.0) reversals are trusted only in corrective context, faded only with extra confirmation in impulsive context. Good for exits/short-side and for filtering counter-trend entries.
5. Channel + RSI-divergence wave-5 exhaustion: after w4, project parallel channel (log scale) through w3 high; wave-5 target zone = upper line / 0.618-1.0 x w1 from w4 low; exit or fade when price reaches zone with RSI lower than at w3 high (and throwover on high volume = strong fifth, do not fade until close back inside). Combines three independent confirmers.
