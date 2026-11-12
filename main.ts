// Momentum-threshold BTC bot for make.fun btc-race-24h-20261112-1439.
//
// Strategy (long only, one asset, full size):
//   Entry: the 60-minute close-to-close return exceeds +0.7% (a strong hourly
//     momentum leg). One entry per leg; no pyramiding.
//   Exit: the whole position, on the first of
//     (a) a trailing stop: the position's value falls 0.5% below its peak
//         value at a close, or
//     (b) momentum reversal: the 60-minute return falls below -0.2%.
//   Both exit conditions are persistent, so a sell the market refuses (a gap
//   past the slippage cap) is retried on the next bar while it still holds.
//   After an exit the bot waits 30 bars before it may enter again, so a
//   trailing stop cannot buy the same leg back on the next bar in a chop.
//   Otherwise the bot stays in cash: in a grind-down with no strong hourly
//   leg it makes no trade rather than bleeding on whipsaws.
//
// Costs are ~26 bps a full-size round trip (4 bps fee + 2 bps slippage +
// price impact each way), so a trade needs a move bigger than that; the
// +0.7% hourly trigger is roughly 3x the round-trip cost. Deterministic:
// pure function of the closes seen (float64, IEEE 754), no clock, no
// environment, no randomness.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const LOOKBACK = 60; // minutes for the momentum return
const ENTRY_PCT = 0.7; // enter when the 60-min return exceeds this (%)
const REVERSAL_PCT = -0.2; // exit when the 60-min return falls below this (%)
const TRAIL_PCT = 0.5; // exit when the position falls this far (%) below its peak value
const COOLDOWN_BARS = 30; // bars to wait after an exit before a new entry
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on

const closes: number[] = [];
let peakValue = 0; // peak value of the open position at a close (quote units, float)
let cooldownUntil = -1; // first seq on which a new entry is allowed again

function ret60(): number | null {
  if (closes.length <= LOOKBACK) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - LOOKBACK];
  return ((now - then) / then) * 100;
}

await runBars({
  onBatch(state: BarsState, batch) {
    for (const bar of batch.bars) closes.push(Number(bar.c));
    if (state.warmingUp) return [];

    const held = state.positions.get('CBBTC');
    const r = ret60();

    if (held !== undefined) {
      const value = Number(state.value('CBBTC', held.qty));
      if (value > peakValue) peakValue = value;
      const trailing = peakValue > 0 && value <= peakValue * (1 - TRAIL_PCT / 100);
      const reversal = r !== null && r < REVERSAL_PCT;
      if (trailing || reversal) {
        peakValue = 0;
        cooldownUntil = batch.seq + COOLDOWN_BARS;
        const sell: SellInput = { side: 'sell', symbol: 'CBBTC', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    if (batch.seq >= cooldownUntil && r !== null && r > ENTRY_PCT) {
      peakValue = 0;
      const buy: BuyInput = { side: 'buy', symbol: 'CBBTC', notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [buy];
    }
    return [];
  },
});
