import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from './feed'
import type { Pane } from './catalog'

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

/** Imperative wrapper over lightweight-charts: a candlestick price pane, a
 *  dedicated oscillator sub-scale, and one line series per active indicator
 *  output field. Mirrors the proven series/markers API. */
export class ChartController {
  private chart: IChartApi | null = null
  private price: ISeriesApi<'Candlestick'> | null = null
  private series = new Map<string, ISeriesApi<'Line'>>()
  private colorIdx = 0
  private markersById = new Map<string, SeriesMarker<Time>[]>()
  private ro: ResizeObserver | null = null

  init(container: HTMLElement, dark: boolean): void {
    this.destroy()
    const chart = createChart(container, {
      ...chartOptions(dark),
      width: container.clientWidth,
      height: container.clientHeight,
    })
    this.chart = chart
    this.price = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceLineVisible: false, lastValueVisible: false,
    })
    chart.priceScale('osc').applyOptions({
      scaleMargins: { top: 0.74, bottom: 0 }, borderVisible: false,
    })
    this.ro = new ResizeObserver(() => {
      if (this.chart) this.chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
    })
    this.ro.observe(container)
  }

  setCandles(data: Candle[]): void {
    this.price?.setData(data.map(toBar))
    this.chart?.timeScale().fitContent()
  }

  updateCandle(k: Candle): void {
    this.price?.update(toBar(k))
  }

  private lineFor(key: string, pane: Pane): ISeriesApi<'Line'> {
    let s = this.series.get(key)
    if (s) return s
    const color = PALETTE[this.colorIdx++ % PALETTE.length]
    s = this.chart!.addLineSeries({
      color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      priceScaleId: pane === 'sub' ? 'osc' : 'right',
    })
    this.series.set(key, s)
    return s
  }

  /** Push one numeric output point for an indicator field. */
  pushPoint(id: string, field: string, time: number, value: number, pane: Pane): void {
    if (!this.chart || !Number.isFinite(value)) return
    this.lineFor(`${id}:${field}`, pane).update({ time: time as UTCTimestamp, value })
  }

  /** Push a ±1 pattern signal as a marker on the price series. */
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
    for (const list of this.markersById.values()) all.push(...list)
    all.sort((a, b) => (a.time as number) - (b.time as number))
    this.price?.setMarkers(all)
  }

  removeIndicator(id: string): void {
    for (const [key, s] of this.series) {
      if (key.startsWith(`${id}:`)) {
        this.chart?.removeSeries(s)
        this.series.delete(key)
      }
    }
    this.markersById.delete(id)
    this.flushMarkers()
  }

  clearIndicators(): void {
    for (const s of this.series.values()) this.chart?.removeSeries(s)
    this.series.clear()
    this.markersById.clear()
    this.colorIdx = 0
    this.price?.setMarkers([])
  }

  destroy(): void {
    this.ro?.disconnect()
    this.ro = null
    this.chart?.remove()
    this.chart = null
    this.price = null
    this.series.clear()
    this.markersById.clear()
  }
}

function toBar(k: Candle) {
  return { time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close }
}
