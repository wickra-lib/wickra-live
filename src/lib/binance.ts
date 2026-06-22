import type { Candle, Trade, TopOfBook } from './feed'

// Pure client-side Binance market-data feed. The browser's own WebSocket opens a
// single MULTIPLEXED combined stream to Binance's public endpoint (no key, no
// backend) and pipes klines / trades / depth into the callbacks. REST is used
// only for optional warmup history. Binance closes a connection after 24h, so a
// reconnect with backoff is mandatory.

const WS_BASE = 'wss://stream.binance.com:9443/stream'
const REST_BASE = 'https://api.binance.com/api/v3'

export interface FeedHandlers {
  onKline?: (k: Candle, closed: boolean) => void
  onTrade?: (t: Trade) => void
  onDepth?: (top: TopOfBook, bids: [number, number][], asks: [number, number][]) => void
  onStatus?: (s: 'connecting' | 'open' | 'closed' | 'error') => void
}

export class BinanceFeed {
  private ws: WebSocket | null = null
  private closedByUser = false
  private backoff = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private symbol: string,
    private interval: string,
    private handlers: FeedHandlers,
    private withDepth = true,
    private withTrades = true,
  ) {}

  connect(): void {
    this.closedByUser = false
    const sym = this.symbol.toLowerCase()
    const streams = [`${sym}@kline_${this.interval}`]
    if (this.withTrades) streams.push(`${sym}@trade`)
    if (this.withDepth) streams.push(`${sym}@depth20@100ms`)
    this.handlers.onStatus?.('connecting')
    const ws = new WebSocket(`${WS_BASE}?streams=${streams.join('/')}`)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 1000
      this.handlers.onStatus?.('open')
    }
    ws.onmessage = (ev) => this.onMessage(ev.data as string)
    ws.onerror = () => this.handlers.onStatus?.('error')
    ws.onclose = () => {
      this.handlers.onStatus?.('closed')
      if (!this.closedByUser) this.scheduleReconnect()
    }
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.ws?.close()
    this.ws = null
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const wait = this.backoff
    this.backoff = Math.min(this.backoff * 2, 30000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closedByUser) this.connect()
    }, wait)
  }

  private onMessage(raw: string): void {
    let msg: { stream?: string; data?: Record<string, unknown> }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    const stream = msg.stream ?? ''
    const data = msg.data ?? {}
    if (stream.includes('@kline')) this.handleKline(data)
    else if (stream.includes('@trade')) this.handleTrade(data)
    else if (stream.includes('@depth')) this.handleDepth(data)
  }

  private handleKline(data: Record<string, unknown>): void {
    const k = data.k as Record<string, unknown> | undefined
    if (!k) return
    const candle: Candle = {
      time: Math.trunc(Number(k.t) / 1000),
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
    }
    this.handlers.onKline?.(candle, Boolean(k.x))
  }

  private handleTrade(data: Record<string, unknown>): void {
    this.handlers.onTrade?.({
      price: Number(data.p),
      size: Number(data.q),
      // `m` = true when the buyer is the maker, i.e. the aggressor sold.
      isBuy: !data.m,
      time: Math.trunc(Number(data.T) / 1000),
    })
  }

  private handleDepth(data: Record<string, unknown>): void {
    const toLevels = (raw: unknown): [number, number][] =>
      Array.isArray(raw) ? raw.map((l) => [Number((l as string[])[0]), Number((l as string[])[1])]) : []
    const bids = toLevels(data.bids)
    const asks = toLevels(data.asks)
    if (!bids.length || !asks.length) return
    const top: TopOfBook = { bidPx: bids[0][0], bidSz: bids[0][1], askPx: asks[0][0], askSz: asks[0][1] }
    this.handlers.onDepth?.(top, bids, asks)
  }
}

/** Optional warmup history. Binance public klines REST is usually CORS-open in
 *  the browser; if a deployment hits CORS the caller falls back to live-only. */
export async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const url = `${REST_BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`klines ${res.status}`)
  const rows = (await res.json()) as unknown[][]
  return rows.map((r) => ({
    time: Math.trunc(Number(r[0]) / 1000),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }))
}

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
export const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'] as const
