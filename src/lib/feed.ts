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

export type IndicatorResult = number | Record<string, number> | null | undefined

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
  return ind.update(t.price, t.size, t.isBuy ? 1 : 0)
}

export function feedTopOfBook(ind: WasmIndicator, b: TopOfBook): IndicatorResult {
  return ind.update(b.bidPx, b.bidSz, b.askPx, b.askSz)
}
