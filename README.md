# Momentum-threshold cbBTC bot v2 — dip-buy swing

Free entry for the make.fun BTC race (cbBTC vs USDC, 1-minute bars).

Strategy: buy the dip. When the close falls at least 0.5% below the
45-bar high, buy with full cash. Exit when the bar's high reaches
entry + 0.70% (take profit) or the bar's low reaches entry - 0.30%
(stop loss). At most 3 round trips per window.

Dev-window result (real harness, grade-local): net PnL +$16.37,
6 trades, max drawdown 0.40%, guardrails met.

Built with the make.fun bars-replay SDK (`vendor/makefun-bars.ts`).
