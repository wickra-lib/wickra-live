import type { Sig } from './catalog'
import type { WasmIndicator } from './wasm'

export interface Candle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  /** Bar open time in seconds (chart time). */
  time: number
}

export interface Trade {
  price: number
  size: number
  isBuy: boolean
  time: number
}

export interface TopOfBook {
  bidPx: number
  bidSz: number
  askPx: number
  askSz: number
}

// A scalar, a struct (object of numbers), an array of bar objects (bar-builder),
// or null/undefined during warmup. Renderers in App.vue narrow it by `render`.
export type IndicatorResult = unknown

/** Feed one candle into an indicator according to its update() signature. */
export function feedKline(ind: WasmIndicator, sig: Sig, k: Candle): IndicatorResult {
  switch (sig) {
    case 'scalar': return ind.update(k.close)
    case 'ohlc': return ind.update(k.open, k.high, k.low, k.close)
    case 'hlc': return ind.update(k.high, k.low, k.close)
    case 'hl': return ind.update(k.high, k.low)
    case 'cv': return ind.update(k.close, k.volume)
    case 'hlcv': return ind.update(k.high, k.low, k.close, k.volume)
    case 'hlv': return ind.update(k.high, k.low, k.volume)
    case 'ohlcv': return ind.update(k.open, k.high, k.low, k.close, k.volume)
    case 'ohlcv_ts': return ind.update(k.open, k.high, k.low, k.close, k.volume, BigInt(Math.trunc(k.time * 1000)))
    default: return undefined
  }
}

export function feedTrade(ind: WasmIndicator, t: Trade): IndicatorResult {
  return ind.update(t.price, t.size, t.isBuy)
}

/** Order-book indicators take the FULL book as four parallel Float64Arrays
 *  (bid_px, bid_sz, ask_px, ask_sz) — not a scalar top-of-book. Passing scalars
 *  was the cause of "invalid order book: at least one bid and one ask". */
export function feedOrderBook(
  ind: WasmIndicator,
  bids: [number, number][],
  asks: [number, number][],
): IndicatorResult {
  if (!bids.length || !asks.length) return undefined
  const bidPx = Float64Array.from(bids, (l) => l[0])
  const bidSz = Float64Array.from(bids, (l) => l[1])
  const askPx = Float64Array.from(asks, (l) => l[0])
  const askSz = Float64Array.from(asks, (l) => l[1])
  return ind.update(bidPx, bidSz, askPx, askSz)
}

/** Pair / spread indicators take two synchronized price series: the primary
 *  symbol's close (a) and the reference symbol's close (b). */
export function feedPair(ind: WasmIndicator, a: number, b: number): IndicatorResult {
  return ind.update(a, b)
}
