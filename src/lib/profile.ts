// Profile indicators (render 'profile') emit a snapshot each bar, in one of
// three shapes the WASM exposes:
//   - price histogram: { priceLow, priceHigh, bins|counts } (Volume/TPO profile)
//   - time buckets:    Float64Array of bucket values (seasonality profiles)
//   - footprint:       Array<{ price, bidVol, askVol }> (price-level footprint)
// Normalise them into one tagged union the ProfilePanel can render.

export interface FootprintLevel {
  price: number
  bidVol: number
  askVol: number
}

export type ProfileSnapshot =
  | { kind: 'price'; priceLow: number; priceHigh: number; bins: number[] }
  | { kind: 'bucket'; values: number[] }
  | { kind: 'footprint'; levels: FootprintLevel[] }

export function toProfileSnapshot(res: unknown): ProfileSnapshot | null {
  if (res == null) return null

  if (res instanceof Float64Array) {
    return res.length ? { kind: 'bucket', values: Array.from(res) } : null
  }

  if (Array.isArray(res)) {
    if (!res.length) return null
    if (typeof res[0] === 'number') {
      return { kind: 'bucket', values: res as number[] }
    }
    if (res[0] && typeof res[0] === 'object' && 'price' in (res[0] as object)) {
      return { kind: 'footprint', levels: res as FootprintLevel[] }
    }
    return null
  }

  if (typeof res === 'object') {
    const o = res as Record<string, unknown>
    const raw = o.bins ?? o.counts
    const bins =
      raw instanceof Float64Array ? Array.from(raw) : Array.isArray(raw) ? (raw as number[]) : null
    if (bins && typeof o.priceLow === 'number' && typeof o.priceHigh === 'number') {
      return { kind: 'price', priceLow: o.priceLow, priceHigh: o.priceHigh, bins }
    }
  }

  return null
}
