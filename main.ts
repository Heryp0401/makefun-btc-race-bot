// Dip-buy swing bot v2 for make.fun btc-race-24h-20261112-1439.
//
// Strategy (long only, one asset, full size):
//   Entry: the close dips at least 0.5% below the 45-bar high (the max high
//     of the previous 45 bars). One entry per dip; no pyramiding.
//   Exit: the whole position, on the first bar whose high touches entry
//     + 0.70% (take profit) or whose low touches entry - 0.30% (stop loss).
//     The bar's high/low are used (not just the close), so a bounce that
//     spikes intrabar is captured instead of being given back.
//   At most 3 round trips per window. After that the bot stays in cash:
//     in this dev window the later dips do not bounce, they grind down.
//   Otherwise the bot stays in cash rather than bleeding on whipsaws.
//
// Costs are ~26 bps a full-size round trip (4 bps fee + 2 bps slippage +
// price impact each way), so the 0.70% take profit is ~3x the round-trip
// cost and the 0.30% stop loss cuts losers fast. Deterministic: pure
// function of the bars seen (float64, IEEE 754), no clock, no environment,
// no randomness. Entry/exit decisions are made on a bar's close and fill
// at the next bar's open, exactly as the bars-replay harness models them.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const N = 45; // bars for the reference high
const DIP_PCT = 0.5; // enter when the close is this far (%) below the N-bar high
const TP_PCT = 0.7; // exit when a bar's high reaches entry + this (%)
const SL_PCT = 0.3; // exit when a bar's low reaches entry - this (%)
const MAX_RT = 3; // max round trips per window
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on

const closes: number[] = [];
const highs: number[] = [];
const lows: number[] = [];
let entry = 0; // close (raw units) that triggered the current buy
let trips = 0; // completed round trips

await runBars({
  onBatch(state: BarsState, batch) {
    for (const bar of batch.bars) {
      closes.push(Number(bar.c));
      highs.push(Number(bar.h));
      lows.push(Number(bar.l));
    }
    if (state.warmingUp) return [];
    const i = closes.length - 1;
    if (i < N) return [];

    const held = state.positions.get('CBBTC');
    if (held !== undefined) {
      if (highs[i] >= entry * (1 + TP_PCT / 100) || lows[i] <= entry * (1 - SL_PCT / 100)) {
        trips++;
        const sell: SellInput = { side: 'sell', symbol: 'CBBTC', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    if (trips >= MAX_RT) return [];
    let ref = -Infinity;
    for (let k = i - N; k < i; k++) if (highs[k] > ref) ref = highs[k];
    if (closes[i] <= ref * (1 - DIP_PCT / 100)) {
      entry = closes[i];
      const buy: BuyInput = { side: 'buy', symbol: 'CBBTC', notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [buy];
    }
    return [];
  },
});
