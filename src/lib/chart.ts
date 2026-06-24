import {
  createChart,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type LineWidth,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from './feed'
import type { Pane } from './catalog'

/** Per-indicator line style applied when a series is first created. */
export interface PointStyle {
  color?: string
  width?: number
  step?: boolean
}

const PALETTE = [
  '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6',
  '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#a855f7',
]

function chartOptions(dark: boolean) {
  const text = dark ? '#cbd5e1' : '#334155'
  const grid = dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)'
  return {
    layout: { background: { color: 'transparent' }, textColor: text, attributionLogo: false },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 as const },
  }
}

/** Imperative wrapper over lightweight-charts. A main chart holds the candles
 *  and price-overlay indicators; oscillator (sub-pane) indicators get a real
 *  second chart stacked below, time-synced to the main one — TradingView style.
 *  The sub chart is created on demand and removed when no oscillator is active. */
export class ChartController {
  private dark = true
  private container: HTMLElement | null = null
  private mainEl: HTMLDivElement | null = null
  private subEl: HTMLDivElement | null = null

  private main: IChartApi | null = null
  private sub: IChartApi | null = null
  private price: ISeriesApi<'Candlestick'> | null = null

  private series = new Map<string, { s: ISeriesApi<'Line'>; pane: Pane }>()
  private colorIdx = 0
  private markersById = new Map<string, SeriesMarker<Time>[]>()
  // Last plotted time per line key. lightweight-charts' update() requires
  // strictly-increasing times; on a WS reconnect / warmup overlap the same bar
  // time can recur, which throws "Cannot update oldest data". Drop those.
  private lastTimeByKey = new Map<string, number>()
  // Indicators the user has hidden — their line series get visible:false and
  // their markers are filtered out of the flush.
  private hiddenIds = new Set<string>()
  private ro: ResizeObserver | null = null
  private syncing = false

  init(container: HTMLElement, dark: boolean): void {
    this.destroy()
    this.dark = dark
    this.container = container
    container.style.display = 'flex'
    container.style.flexDirection = 'column'

    this.mainEl = document.createElement('div')
    this.mainEl.style.cssText = 'flex:1 1 0;min-height:0;'
    this.subEl = document.createElement('div')
    this.subEl.style.cssText = 'flex:0 0 0;min-height:0;'
    container.append(this.mainEl, this.subEl)

    this.main = createChart(this.mainEl, {
      ...chartOptions(dark),
      width: this.mainEl.clientWidth, height: this.mainEl.clientHeight,
    })
    this.price = this.main.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceLineVisible: false, lastValueVisible: false,
    })
    this.main.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 }, borderVisible: false })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
  }

  private resize(): void {
    if (this.main && this.mainEl) this.main.applyOptions({ width: this.mainEl.clientWidth, height: this.mainEl.clientHeight })
    if (this.sub && this.subEl) this.sub.applyOptions({ width: this.subEl.clientWidth, height: this.subEl.clientHeight })
  }

  private ensureSub(): IChartApi | null {
    if (this.sub) return this.sub
    if (!this.subEl || !this.main) return null
    try {
      this.subEl.style.cssText = 'flex:0 0 30%;min-height:0;border-top:1px solid rgba(148,163,184,0.22);'
      this.resize()
      const sub = createChart(this.subEl, {
        ...chartOptions(this.dark),
        width: this.subEl.clientWidth, height: this.subEl.clientHeight,
      })
      sub.timeScale().applyOptions({ visible: false }) // main carries the x-axis
      this.sub = sub
      // Two-way time-scale sync.
      this.main.timeScale().subscribeVisibleLogicalRangeChange((r) => {
        if (this.syncing || !r || !this.sub) return
        this.syncing = true
        try { this.sub.timeScale().setVisibleLogicalRange(r) } catch { /* ignore */ }
        this.syncing = false
      })
      sub.timeScale().subscribeVisibleLogicalRangeChange((r) => {
        if (this.syncing || !r || !this.main) return
        this.syncing = true
        try { this.main.timeScale().setVisibleLogicalRange(r) } catch { /* ignore */ }
        this.syncing = false
      })
      const range = this.main.timeScale().getVisibleLogicalRange()
      if (range) sub.timeScale().setVisibleLogicalRange(range)
      this.resize()
      return sub
    } catch {
      // Never let a sub-pane failure break the main chart.
      this.sub = null
      return null
    }
  }

  private destroySub(): void {
    if (this.sub) { try { this.sub.remove() } catch { /* ignore */ } this.sub = null }
    if (this.subEl) this.subEl.style.cssText = 'flex:0 0 0;min-height:0;'
    this.resize()
  }

  setCandles(data: Candle[]): void {
    this.price?.setData(data.map(toBar))
    this.main?.timeScale().fitContent()
  }

  updateCandle(k: Candle): void {
    this.price?.update(toBar(k))
  }

  private lineFor(id: string, field: string, pane: Pane, opts?: PointStyle): ISeriesApi<'Line'> | null {
    const key = `${id}:${field}`
    const existing = this.series.get(key)
    if (existing) return existing.s
    const color = opts?.color ?? PALETTE[this.colorIdx++ % PALETTE.length]
    const host = pane === 'sub' ? (this.ensureSub() ?? this.main) : this.main
    if (!host) return null
    const s = host.addLineSeries({
      color,
      lineWidth: (opts?.width ?? 2) as LineWidth,
      lineType: opts?.step ? LineType.WithSteps : LineType.Simple,
      visible: !this.hiddenIds.has(id),
      priceLineVisible: false,
      lastValueVisible: false,
    })
    this.series.set(key, { s, pane })
    return s
  }

  pushPoint(id: string, field: string, time: number, value: number, pane: Pane, opts?: PointStyle): void {
    if (!Number.isFinite(value) || !Number.isFinite(time)) return
    const key = `${id}:${field}`
    const last = this.lastTimeByKey.get(key)
    if (last !== undefined && time <= last) return
    this.lastTimeByKey.set(key, time)
    this.lineFor(id, field, pane, opts)?.update({ time: time as UTCTimestamp, value })
  }

  /** Recolour / re-weight all of an indicator's line series live. */
  setStyle(id: string, color: string, width: number): void {
    for (const [key, v] of this.series) {
      if (key.startsWith(`${id}:`)) v.s.applyOptions({ color, lineWidth: width as LineWidth })
    }
  }

  /** Show/hide all of an indicator's series (and its markers). */
  setVisible(id: string, visible: boolean): void {
    if (visible) this.hiddenIds.delete(id)
    else this.hiddenIds.add(id)
    for (const [key, v] of this.series) {
      if (key.startsWith(`${id}:`)) v.s.applyOptions({ visible })
    }
    this.flushMarkers()
  }

  pushMarker(id: string, time: number, up: boolean): void {
    const list = this.markersById.get(id) ?? []
    list.push({
      time: time as UTCTimestamp,
      position: up ? 'belowBar' : 'aboveBar',
      color: up ? '#22c55e' : '#ef4444',
      shape: up ? 'arrowUp' : 'arrowDown',
    })
    while (list.length > 40) list.shift()
    this.markersById.set(id, list)
    this.flushMarkers()
  }

  private flushMarkers(): void {
    const all: SeriesMarker<Time>[] = []
    for (const [id, list] of this.markersById) {
      if (!this.hiddenIds.has(id)) all.push(...list)
    }
    all.sort((a, b) => (a.time as number) - (b.time as number))
    this.price?.setMarkers(all)
  }

  removeIndicator(id: string): void {
    for (const [key, v] of this.series) {
      if (key.startsWith(`${id}:`)) {
        const host = v.pane === 'sub' ? this.sub : this.main
        try { host?.removeSeries(v.s) } catch { /* ignore */ }
        this.series.delete(key)
      }
    }
    for (const key of this.lastTimeByKey.keys()) {
      if (key.startsWith(`${id}:`)) this.lastTimeByKey.delete(key)
    }
    this.hiddenIds.delete(id)
    this.markersById.delete(id)
    this.flushMarkers()
    if (![...this.series.values()].some((v) => v.pane === 'sub')) this.destroySub()
  }

  clearIndicators(): void {
    for (const v of this.series.values()) {
      const host = v.pane === 'sub' ? this.sub : this.main
      try { host?.removeSeries(v.s) } catch { /* ignore */ }
    }
    this.series.clear()
    this.lastTimeByKey.clear()
    this.markersById.clear()
    this.colorIdx = 0
    this.price?.setMarkers([])
    this.destroySub()
  }

  destroy(): void {
    this.ro?.disconnect()
    this.ro = null
    if (this.sub) { try { this.sub.remove() } catch { /* ignore */ } this.sub = null }
    if (this.main) { try { this.main.remove() } catch { /* ignore */ } this.main = null }
    this.price = null
    this.series.clear()
    this.markersById.clear()
    if (this.container) { this.container.innerHTML = ''; this.container.style.display = '' }
    this.mainEl = this.subEl = null
  }
}

function toBar(k: Candle) {
  return { time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close }
}
