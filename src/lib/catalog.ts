import rawCatalog from '../catalog.json'

/** How an indicator's `update()` is fed from a candle (or a special stream). */
export type Sig =
  | 'scalar' | 'ohlc' | 'hlc' | 'hl' | 'cv' | 'hlcv' | 'hlv' | 'ohlcv' | 'ohlcv_ts'
  | 'trade' | 'ob_top' | 'cross' | 'pair' | 'other'

/** Where an indicator's data comes from. */
export type Feed = 'kline' | 'trade' | 'orderbook' | 'none'

/** How an indicator's output is drawn. */
export type Render = 'line' | 'multi' | 'markers' | 'bars' | 'profile'

export type Pane = 'price' | 'sub'

export interface Entry {
  /** wickra-wasm class name to `new` (e.g. "EMA"). */
  js: string
  /** Canonical wickra name (e.g. "Ema"). */
  name: string
  /** Human label. */
  label: string
  /** One of the 24 canonical families. */
  family: string
  /** Default constructor arguments. */
  params: number[]
  sig: Sig
  feed: Feed
  render: Render
  pane: Pane
  /** Raw wasm-manifest output category (diagnostic). */
  out: string
}

export const CATALOG = rawCatalog as Entry[]

/** Indicators that can be driven straight from the live candle stream. */
export const KLINE_CATALOG = CATALOG.filter((e) => e.feed === 'kline')

/** Catalogue grouped by family, families in catalogue order. */
export function byFamily(entries: Entry[] = CATALOG): Array<{ family: string; items: Entry[] }> {
  const groups = new Map<string, Entry[]>()
  for (const e of entries) {
    const g = groups.get(e.family)
    if (g) g.push(e)
    else groups.set(e.family, [e])
  }
  return [...groups.entries()].map(([family, items]) => ({ family, items }))
}

export function findByJs(js: string): Entry | undefined {
  return CATALOG.find((e) => e.js === js)
}

export const FAMILIES = [...new Set(CATALOG.map((e) => e.family))].sort()
export const TOTAL = CATALOG.length
