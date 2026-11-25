# yt_chunk1 research notes (24 videos; most transcripts truncated ~1,500 words; Dhan video is unreadable Hindi OCR)

Abbreviations: W1..W5 = wave lengths/extremes; "Mia" = Pip Daily FX; MMM = Mind Math Money. Rules already in app (W2<100%, W3 not shortest, W4 no overlap) omitted except where a presenter adds a price-level use.

## 1. Rules

1. WAVE-3 ENTRY (the only fully specified entry in the set). Trade only wave 3. Preconditions: clear W1; W2 is a 3-part (ABC) pullback; W2 ends between 38% and 62% of W1. Trigger: price "turns back in trend direction" after W2 (Mia: sold on the day price turned down again, near 1.162, after W2 bounce). Stop: just beyond the W2 extreme (Mia: 40 pips above W2 end). If price returns to W2 extreme, W3 is not starting, exit. Target: 2-3x risk (Mia: 108 pips target vs 40 stop = 2.7R). 
   Code: `w2_ret=(W2ext-W1end)/(W1end-W1start); if 0.382<=w2_ret<=0.62 and W2_is_3_leg and close crosses back through prior bar's extreme in trend dir: entry; stop=W2ext -/+ buffer; tp=entry+2.7*risk`
   Source: Pip Daily FX "Elliott Wave Theory for Beginners (Real Chart Example)" (1 video; the only one with full entry/stop/target)

2. W2 depth guideline: 50%-61.8% of W1 (most common). 4 videos agree on 50-61.8: MMM Fibonacci ("0.5 to 0.618"), BHSL ("50 to 61.8%, sometimes deeper"), WaveLabs ("deep, 61.8% mentioned a lot"), Schwab part 2 (61.8 retrace as support in live S&P example). Wider ranges quoted: Print Dem Bandz "50 to almost 80%", Pip "50 to 62%" (Mia uses 38-62), Lam example 2/3 (~67%) called "inside normal range".
   Code: `zone_w2 = [W1end - 0.5*W1, W1end - 0.618*W1] (up-move); widen to 0.382-0.80 for hard filter`
   Source: MMM, BHSL, WaveLabs, Print Dem Bandz, Pip Daily FX, Schwab

3. W3 target: 1.618 x W1, projected from the W2 end (trend-based extension anchored W1 start -> W1 end -> W2 end). MMM: "if you only learn one extension rule, learn this". 5 videos agree on 1.618 (MMM, BHSL, WaveLabs "money wave", Print Dem Bandz "about 1.6x", EWI Jason Soni). EWI adds common alternates 2.618 (seen twice in his examples), occasionally 4.236; "don't be in a rush": tagging 1.618 does not mean stop, "let the trade breathe".
   Code: `tp1 = W2end + 1.618*W1; tp2 = W2end + 2.618*W1; (tp3 = +4.236*W1 rare)`
   Source: MMM Fibonacci, BHSL, WaveLabs, Print Dem Bandz, EWI "How To Let The Price Action Help You Count"

4. W4 depth guideline: ~23.6%-38.2% of W3 (shallower than W2). BHSL 23.6%; MMM 0.382; Pip "a quarter to a third of W3" (example 29%); EWI "look at 38 or 23 retracement of W3" and W4 about the same size as W2 (equality in time/price); Print Dem Bandz "usually shallower than W2, often sideways/triangle". 4 videos agree. MMM: W4 may go deeper, hard limit is W1 high.
   Code: `zone_w4 = [W3end - 0.382*W3, W3end - 0.236*W3]; hard floor = W1end`
   Source: BHSL, MMM, Pip, EWI, Print Dem Bandz

5. W5 target: W5 = W1 (equality) when W3 is the extended wave (EWI example target "1802 where 5 equals 1"); MMM: "W1 and W5 around the same, or W5 extends 0.618 of the W1-to-W3 move". Hard-coded alt: W5 = 0.618 * (W3 net distance from W1 start to W3 end).
   Code: `tp_w5_a = W4end + W1; tp_w5_b = W4end + 0.618*(W3end - W1start)`
   Source: EWI "How To Let The Price Action...", MMM Fibonacci (2 videos)

6. Zigzag W-C = W-A (equality) as C target. BHSL: "in a zigzag wave C often equals wave A". Print Dem Bandz: C "about same size as A", usually goes below end of A; Lam example C ~ A. Flats: A, B, C roughly equal length (Ezekiel Chew). 3 videos agree.
   Code: `tp_C = Bend - A_len` (down correction; mirror for up)
   Source: BHSL, Print Dem Bandz, Asia Forex Mentor (Ezekiel Chew)

7. W5 EXHAUSTION / divergence: at W5 new price extreme, RSI (default settings) or MACD makes a lower high -> bearish divergence = expect ABC correction (reversal trade, counter-trend). Sources: WaveLabs, Print Dem Bandz, MMM x2 (RSI default, MACD), Geometriya. 5 videos agree.
   Code: `W5.high > W3.high and RSI(14)@W5.high < RSI(14)@W3.high` (also MACD hist). 
   Source: WaveLabs, Print Dem Bandz, MMM "ONLY Elliott Wave Trading Guide", Geometriya scanner, Mind Math Money

8. Geometriya W5-END counter-trend setup: (a) W5 makes new extreme beyond W3; (b) Elliott Wave Oscillator (EWO = SMA5(median price) - SMA35(median price), i.e. "5/35") peak at W5 is lower than at W3 (divergence); (c) entry on a close across the displaced moving average (7 bars, shifted 5); trade is against the trend; stop beyond W5 extreme; first target = end of W4. 
   Code: `ewo=sma(hl2,5)-sma(hl2,35); cond=W5.ext>W3.ext and abs(ewo@W5)<abs(ewo@W3); entry on close crossing DMA(7,shift=5) against trend; stop=W5ext; tp1=W4end`
   Source: Geometrical Analysis "Elliott Wave Scanner: Wave 4 Entry & Wave 5 End" (1 video; vendor tool)

9. Geometriya W4-ENTRY (with-trend, buys the W4 pullback): (a) W3 is strong, EWO at W3 peak beyond the oscillator's band (extreme reading); (b) EWO has returned back to zero (i.e. W4 has absorbed the momentum); (c) pullback is >= 38% (of W3) and no overlap with W1 end; (d) entry = close across displaced MA (7, shift 5) back in trend direction; target = W5 projection (see Rule 5). Scanner also shows entry/stop/target/RR per row.
   Code: `ewo[W3] > k*std(ewo) (band); ewo crosses zero during W4; retr>=0.38*W3 and W4ext not beyond W1end; close crosses DMA(7,5) in trend dir -> long; stop=W4ext; tp=W5 projection`
   Source: Geometrical Analysis scanner (1 video; EWO confirmation 5/35 is the only quantified momentum filter in the set)

10. Entry on W5 completion is a counter-trend trade into an ABC; stop-out risk from W-A is the classic failure (see Filter 2). Trade the ABC only AFTER W5-divergence AND price-action confirmation (MMM: shooting star / candlestick at the high). Combine count + divergence + candle = "even more significant".
   Code: `short if w5_done and rsi_div and bearish_candle(shooting_star/engulf) at W5 high`
   Source: MMM "ONLY Elliott Wave Trading Guide" (1 video), Print Dem Bandz (div. only)

11. Confirmation that W2 is over / W3 under way: Print Dem Bandz (Lam example) - price breaking above the W1 high (wave 1 extreme) on rising volume confirms the W3 scenario. Sigma Allocations (Nifty): W4 is a sideways range; break of structure = weekly CLOSE above W3 high confirms W5 (15,432, 28 May 2021, 3 months of range).
   Code: `W3 confirmed: close > W1end and volume > SMA(vol,20)`; `W5 confirmed: close > W3end after W4 range`
   Source: Print Dem Bandz TA#11, Sigma Allocations (2 videos)

12. Invalidation levels (hard stops for a count, per scenario): while W2 forming -> invalid below W1 start; while W4 forming -> invalid beyond W1 end; correction-as-W2 hypothesis (Lam) invalid below the C low. Publish/score every count with its invalidation price. 4 videos agree (EW Insight, BHSL "line in the sand", Print Dem Bandz, Sigma "every count must come with a stop").
   Code: `stop_for_long_in_w3 = W1start (hard) / W2ext (tight); in_w5 = W1end (hard) / W4ext (tight)`
   Source: Elliott Wave Insight, BHSL, Print Dem Bandz, Sigma Allocations

13. Alternation: if W2 sharp/deep then W4 sideways/shallow, and vice versa. 2 videos (BHSL, Mind Math Money in contents list; Pip implicitly: W4 29% vs W2 60%). Use to pre-set W4 expectation.
   Code: `if w2_ret>0.5: expect w4_ret<0.382 and w4_type in (flat, triangle)`
   Source: BHSL, MMM 66-minute course agenda ("alternation")

14. Channeling for W5 target / W3 test: draw a line through the ends of W2 and W4 and a parallel through the W3 extreme; W5 often ends near the upper parallel (Elliott's method; Sigma Allocations Nifty example). EWI (Fabio): "base channel" through W1 and W2 extremes - W3 should break clearly beyond that channel; staying inside the channel means W2 is not finished or B has morphed into a larger correction.
   Code: `base=line(W1end,W2end) slope; w3_valid if close beyond base-channel parallel through W1start side; w5_tp = upper parallel of line(W2end,W4end) through W3end`
   Source: Sigma Allocations, EWI "Start Simple and Adjust Along the Way" (2 videos)

15. Fibonacci CLUSTER: take a zone, not a line. When 2-3 independent projections (e.g. 1.618 x W1, 0.618 x W1-W3, W5=W1, channel) land in the same price band, treat as high-confluence target/entry. BHSL, MMM ("higher confluence trades"), Print Dem Bandz. Also MMM: vertical Fibonacci (price) matters more than horizontal (time) when stacking.
   Code: `cluster = price bands where >=2 projections within 0.5*ATR(14) of each other; take profit/entry at cluster mean`
   Source: BHSL, MMM Fibonacci, MMM Guide (3 videos)

16. Subdivision check (count validity): impulse legs 1,3,5 must each contain 5 sub-waves; 2 and 4 contain 3; zigzag A and C = 5, B = 3; flat A=3, B=3, C=5; diagonal legs = 3-3-3-3-3 (only in W5/ending or W1/leading). Test on a lower timeframe (count top-down: higher TF first). EWI: if you can label 5 sub-waves in W3, you know 4 and 5 remain.
   Code: `for each leg: count_swings(lowerTF) in (5 if motive else 3)`
   Source: Technical Analysis Institute, Sigma, BHSL, EWI (4 videos)

17. Stage logic for a bar-by-bar engine: after a full 5, next move is 3 against (A-B-C). A is sharp (sub-5) and looks like a new trend; B is bounce that "doesn't get back above start of A" (zigzag) or reaches ~100% of A (flat); C ends at/below A end, "often near top of W4" for a corrective rise after a falling 5 (Pip: correction stopped at W4 top ~1.127). Corrections often terminate near the W4 extreme.
   Code: `target_zone_for_ABC = [W4end ± 0.2*ATR_swing]; expect C end there`
   Source: Pip Daily FX, Print Dem Bandz (2 videos)

18. W4 pattern types: triangles (A-E, each swing smaller, 3 waves each) appear in W4, W B or last piece of complex correction, "practically never in W2". Triangle breakout = "short sharp thrust" (EWI-style W5). Zigzag/flats/triangles cover all 21 corrective variants (Ezekiel Chew).
   Code: `if pattern==triangle at W2 -> relabel; triangle at W4 -> expect thrust of width = widest part of triangle (not stated, my addition)`
   Source: BHSL, Print Dem Bandz, Asia Forex Mentor (3 videos)

19. Expanded flat trap: in a flat, B makes a new high (3 waves) then C breaks below A low. "A new high made of three waves is a warning, not a breakout."
   Code: `if breakout_high and internal_swings==3: do not buy breakout; expect C below A low`
   Source: BHSL (1 video)

20. B-wave personality / time: B waves take time and are not sharp; labeling a sharp V-shaped complete retrace as B is a bad count; check channel: if B (or W2) stays above/inside the upper channel boundary, correction not complete.
   Code: `B_duration >= 0.5*A_duration (my guess; source says only "take time")`
   Source: EWI "Start Simple and Adjust Along the Way" (1 video)

21. Wave extension tendency: W3 is the extended wave in most impulses; W1 or W5 rarely extend (EWI). If W3 is extended -> W5 ~ W1 (rule 5); if W3 not extended -> do not assume W5 = W1.
   Code: `if W3 > 1.618*W1 and W3 > W5_proj: extended3 = True`
   Source: EWI (1 video)

22. Examples of measured W lengths (calibration data): EURUSD fall: W3 ~540 pips vs W1 <150, W5 <170 (W3/W1 > 3.6); W2 ~60%, W4 ~29% of W3 (Pip). Bloom Energy: W3 ~250 pts vs W1 139, W5 120 (W3/W1 ~1.8). Use as sanity ranges: W3/W1 in [1.6, 3.6+].
   Code: `unit test: w3/w1 between 1.6 and 4.236 for 'extended' count`
   Source: Pip, Elliott Wave Desk (2 videos)

23. Wave-3 volume/momentum character: W3 has the highest volume and momentum (BHSL "biggest volume", Print Dem Bandz "rising volume and momentum"), W3 has no overlapping sub-waves and a strong straight move (EWI "dead giveaway"); W5 momentum weaker than W3. 
   Code: `vol_sum(W3)/len > vol_sum(W1)/len and > vol_sum(W5)/len; sub-waves of W3 non-overlapping (each W-4 sub doesn't enter W-1 sub)`
   Source: BHSL, Print Dem Bandz, EWI (3 videos)

24. Simplest-count rule (parsimony): choose the simplest pattern (impulse in motive, zigzag in correction); use a leading diagonal only after the market has failed to build an impulse (overlap). Keep a main and an alternate count with invalidation price for each.
   Code: `if overlap(W4,W1): try leading_diagonal else impulse; maintain top-2 counts`
   Source: EWI "Start Simple...", BHSL (2 videos)

## 2. Filters (avoid trading when...)

F1. Do not trade (or discard) a count when any hard rule is broken (W2 below W1 start; W3 shortest; W4 enters W1 range). Exception: diagonals (W4 may overlap W1; 3-3-3-3-3 subdivision; wedge shape). 8+ videos agree.
   Code: `if overlap(W4,W1) and not diagonal_ok: discard`
   Source: Elliott Wave Desk, EW Insight, WaveLabs, Print Dem Bandz, BHSL, Pip, Sigma, Technical Analysis Institute (8 videos)

F2. Do not trade the "next move after a 5-wave end" in the old trend direction (Tom's loss): after W5 the next move is 3 against you (ABC), so entering with the trend right after a completed 5 gets stopped by wave A (-1%, 60 pip stop; A moved >130 pips). Filter: no with-trend entry within the ABC unless the count is "A-B-C complete" (C = A or C at W4 zone).
   Code: `if wave_state==after_W5: block with-trend entries until ABC complete`
   Source: Pip Daily FX (1 video)

F3. Do not mistake W-A of a zigzag for a new trend: A is 5 waves so it looks like a new impulse. BHSL calls this "mistake number two" (sold the bottom). Require C complete or higher-TF confirmation before trading the first 5-wave move against a larger structure.
   Code: `if higher_TF_trend != direction and move is 5-wave: treat as A not W1`
   Source: BHSL, Pip (2 videos)

F4. Wrong degree: a 5-wave move on a 5-minute chart may be only W1 of something bigger. Always count top-down; no lower TF trade without a higher-TF count ("if you don't have the macro view, stop labeling short-term charts").
   Code: `require higher_TF count/trend alignment before LTF entry`
   Source: BHSL, EWI "Start Simple..." (Fabio) (2 videos)

F5. Triangle in W2 -> recheck count (nearly never valid). Sharp 'B' in a zigzag/flat that fully reverses fast -> recheck.
   Source: BHSL, EWI (2 videos)

F6. Don't trade on Elliott alone: it is "inherently subjective", "insufficient on its own". Require at least one of: divergence, candlestick pattern, key price level, structure break. (ATTA, MMM, Sigma).
   Code: `if no(second_confirmation): skip`
   Source: ATTA, MMM, Sigma (3 videos)

F7. Market type: works best in liquid, widely traded markets (equity indices, bond yields, gold, crude); unreliable on thin illiquid stocks; weak at timing ("tells you where much better than when").
   Code: `universe = liquid indices/majors/crypto top-N; min avg dollar volume`
   Source: Sigma Allocations (1 video)

F8. Don't force counts: if 10 analysts draw 10 counts, only trade where the count is unambiguous (clear 5 and 3 sub-structure on lower TF). Remove excess lines; count waves from raw swings, not what you drew on higher TF; "a swing is a swing even if it is only a wick" (swing high/low must use highs/lows, not closes).
   Code: `swings from High/Low (not close); require clear count score>=threshold else skip`
   Source: Chart Whisperer (Charles Vincent), Technical Analysis Institute, Sigma (3 videos)

F9. Don't trade with-trend W5 entries or chase after a big W3 (momentum weak, divergence). W5 = exhaustion; the high-reliability with-trend setups are W3 and (per Geometriya) W4.
   Code: `block long entries in W5 if RSI/EWO divergence`
   Source: WaveLabs, MMM, Geometriya (3 videos)

F10. Avoid early labeling of W3 / "don't be in a rush to label a third wave"; and don't assume a count is right until confirmed (price above W1 high with volume).
   Source: EWI, Print Dem Bandz (2 videos)

F11. Ending-diagonal context: wedge-like 3-3-3-3-3 at the end of a trend signals exhaustion; counter-trend entries only after wedge breakout. (Not tradable with 5-wave rules.)
   Source: Technical Analysis Institute (1 video)

## 3. Contradictions / disputed points

- W2 retracement range: BHSL/MMM/WaveLabs say 50-61.8%; Pip's entry rule says 38-62%; Print Dem Bandz says up to ~80%; Lam example 67%. Treat 38.2-78.6% as acceptable, with 50-61.8 as the highest-probability sub-band (test in backtest).
- W4: "23.6% of W3" (BHSL) vs "0.382 of W3" (MMM) vs "quarter to a third" (Pip). All agree "shallower than W2".
- "Three rules" vs "five unbreakable rules": MMM (66-min course agenda) says five rules; every other video says three. (MMM's extra two likely = wave-2 not triangle? or W3 impulse subdivisions; not specified in truncated text.)
- Wave-3 target 1.618 (most) vs 2.618 / 4.236 (EWI). EWI says tagging 1.618 does not mean exit; MMM treats 1.618 as the main target. Suggest scaling out at 1.618, trail remainder to 2.618.
- Wave-5: "weak vs W3" (all) vs EWI/Sigma noting W5 can see price "struggle to advance despite increasing effort" or momentum accelerate (ATTA). Not codable beyond divergence.
- Wave-4 triangle "usually shows up in W4" (Print Dem Bandz) vs BHSL "W4, B, or last piece of complex correction" (not only W4).
- W2/W4 equality: EWI says W4 about same as W2 (symmetry), conflicts with common "alternation" (BHSL) - disputed.
- Elliott subjectivity: ATTA, Com Lucro Trader (David Paul: "labeling charts back to 1865 is a waste of time"; keep 3-up-2-back) vs course sellers claiming precision. Chart Whisperer: "ask 10 people, get 10 counts."
- Wave "5 over 35" EWO oscillator is Geometriya's confirmation; other videos use RSI/MACD instead.

## 4. Claims of performance (ALL UNVERIFIED)

- Pip Daily FX: single illustrative trade, EURUSD sell, +2.7% (108 pips target, 40 pip stop). Made-up characters (Tom, Mia) with "real prices." No win rate. Also a -1% loss example (Tom).
- Print Dem Bandz: "Lam Research" count scenario - no performance claim.
- Elliott Wave Insight: "our track record counts the misses too" - no number.
- Geometriya / K'u Hero MT5: explicitly "Consistency means fit to the rules, not a win rate"; "no buy or sell signals."
- MMM: "higher probability of success" (qualitative, no number).
- No win rate, profit factor, or sample size was given in any of the 24 videos.

## 5. Most promising ideas to test (ranked)

1. Wave-3 entry after 3-leg W2 retrace in 38.2-61.8% of W1 (Rule 1) with stop beyond W2 extreme, target 1.618 x W1 from W2 end (scale half there, trail rest toward 2.618). Only fully specified entry/stop/target in this set; RR ~2.5-3; invalidation clear; backtest as fixed-fractal swing scanner (ZigZag ATR-based) with W2 zone and a trigger bar (close beyond prior bar extreme) plus W1-high break + volume confirmation (Rule 11).
2. W5-end divergence reversal (Rules 7, 8, 10): W5 new extreme with RSI(14)/EWO(5,35) lower than at W3, plus bearish/bullish candle; stop beyond W5 extreme; TP1 = W4 end, then 0.382-0.618 retrace of the entire impulse. Five videos agree; simple to code; test with and without candle.
3. Geometriya W4-entry (Rule 9): buy 38%+ pullback after extreme EWO in W3, EWO back to zero, close above displaced MA (7, shift 5); target W5 projection (W1 length or 0.618 x W1-W3). Quantified; EWO is cheap to compute.
4. Fibonacci cluster confluence (Rule 15) as a filter for any entry/target: require >= 2 projections within 0.5 ATR. Boosts hit rate in theory; easy to test as filter on Rule 1/3.
5. Corrective A-B-C "end near W4 extreme / C = A" mean-reversion target (Rules 6, 17) and the alternation filter (Rule 13) - uses structure the app already finds; test whether C=A or W4-top touches predict reversal vs random swing ends.
