<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import IndicatorPicker from './components/IndicatorPicker.vue'
import ActiveList, { type ActiveView } from './components/ActiveList.vue'
import OrderBook from './components/OrderBook.vue'
import { ChartController } from './lib/chart'
import { BinanceFeed, fetchKlines, INTERVALS, SYMBOLS } from './lib/binance'
import { feedKline, feedTopOfBook, feedTrade, type Candle, type IndicatorResult } from './lib/feed'
import { loadWasm, makeIndicator, wasmVersion, type WasmIndicator } from './lib/wasm'
import { TOTAL, type Entry } from './lib/catalog'

interface Active {
  id: string
  entry: Entry
  ind: WasmIndicator
  value: string
}

const symbol = ref<string>('BTCUSDT')
const interval = ref<string>('1m')
const historyDepth = ref<number>(500)
const HISTORY_OPTIONS = [0, 200, 500, 1000]

const status = ref<'connecting' | 'open' | 'closed' | 'error'>('connecting')
const wasmReady = ref(false)
const wasmVer = ref('')
const note = ref<string | null>(null)
const lastPrice = ref<number | null>(null)
const updates = ref(0)

const chartEl = ref<HTMLDivElement | null>(null)
const chart = new ChartController()
const wasmMod = shallowRef<Awaited<ReturnType<typeof loadWasm>> | null>(null)

const candles = ref<Candle[]>([])
const active = shallowRef<Active[]>([])
const bids = ref<[number, number][]>([])
const asks = ref<[number, number][]>([])

let feed: BinanceFeed | null = null
let seq = 0
// The depth (10/s) and trade streams are the main mobile-lag source, so they are
// opt-in: only subscribed while an order-book / trade indicator is active.
let feedDepth = false
let feedTrades = false
function needsDepth(): boolean { return active.value.some((a) => a.entry.feed === 'orderbook') }
function needsTrades(): boolean { return active.value.some((a) => a.entry.feed === 'trade') }
async function ensureFeed(): Promise<void> {
  if (needsDepth() !== feedDepth || needsTrades() !== feedTrades) await restart()
}

const activeView = (): ActiveView[] =>
  active.value.map((a) => ({
    id: a.id, label: a.entry.label, family: a.entry.family,
    pane: a.entry.pane, feed: a.entry.feed, value: a.value,
  }))
const activeRows = ref<ActiveView[]>([])
function syncRows() { activeRows.value = activeView() }

// --- result -> chart ----------------------------------------------------------
function applyResult(a: Active, res: IndicatorResult, time: number): void {
  const { id, entry } = a
  if (entry.render === 'markers') {
    if (typeof res === 'number' && res !== 0 && Number.isFinite(res)) chart.pushMarker(id, time, res > 0)
    if (typeof res === 'number' && res !== 0) a.value = res > 0 ? '▲' : '▼'
    return
  }
  if (typeof res === 'number') {
    if (Number.isFinite(res)) {
      chart.pushPoint(id, 'value', time, res, entry.pane)
      a.value = fmt(res)
    }
  } else if (res && typeof res === 'object') {
    let first: number | null = null
    for (const [k, v] of Object.entries(res)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        chart.pushPoint(id, k, time, v, entry.pane)
        if (first === null) first = v
      }
    }
    if (first !== null) a.value = fmt(first)
  }
}

function fmt(v: number): string {
  const abs = Math.abs(v)
  return abs >= 1000 ? v.toFixed(0) : abs >= 1 ? v.toFixed(2) : v.toFixed(4)
}

// --- feed an indicator over the in-memory history (kline indicators only) -----
function replay(a: Active): void {
  if (a.entry.feed !== 'kline') return
  a.ind.reset?.()
  for (const k of candles.value) applyResult(a, feedKline(a.ind, a.entry.sig, k), k.time)
}

// --- add / remove -------------------------------------------------------------
async function add(entry: Entry): Promise<void> {
  note.value = null
  if (entry.feed === 'none') {
    note.value = `${entry.label} needs data this demo doesn't stream (2nd symbol / breadth / derivatives).`
    return
  }
  const mod = wasmMod.value
  if (!mod) return
  const ind = makeIndicator(mod, entry.js, entry.params)
  if (!ind) { note.value = `${entry.label} is not exposed in this wickra-wasm build.`; return }
  const a: Active = { id: `i${seq++}`, entry, ind, value: '—' }
  replay(a)
  active.value = [...active.value, a]
  syncRows()
  await ensureFeed()
}

function remove(id: string): void {
  const a = active.value.find((x) => x.id === id)
  a?.ind.free?.()
  chart.removeIndicator(id)
  active.value = active.value.filter((x) => x.id !== id)
  syncRows()
  void ensureFeed()
}

// --- live wiring --------------------------------------------------------------
function onKline(k: Candle, closed: boolean): void {
  lastPrice.value = k.close
  chart.updateCandle(k)
  if (!closed) return
  candles.value.push(k)
  if (candles.value.length > 5000) candles.value.shift()
  for (const a of active.value) {
    if (a.entry.feed === 'kline') applyResult(a, feedKline(a.ind, a.entry.sig, k), k.time)
  }
  updates.value++
  syncRows()
}

function onTrade(t: { price: number; size: number; isBuy: boolean; time: number }): void {
  let touched = false
  for (const a of active.value) {
    if (a.entry.feed === 'trade') { applyResult(a, feedTrade(a.ind, t), t.time); touched = true }
  }
  if (touched) syncRows()
}

function onDepth(top: { bidPx: number; bidSz: number; askPx: number; askSz: number }, b: [number, number][], a: [number, number][]): void {
  bids.value = b
  asks.value = a
  const t = Math.trunc(Date.now() / 1000)
  let touched = false
  for (const ind of active.value) {
    if (ind.entry.feed === 'orderbook') { applyResult(ind, feedTopOfBook(ind.ind, top), t); touched = true }
  }
  if (touched) syncRows()
}

// --- (re)start the feed for the current symbol/interval/history ---------------
async function restart(): Promise<void> {
  feed?.close()
  candles.value = []
  bids.value = []
  asks.value = []
  chart.clearIndicators()
  // Fresh indicator state for the new market.
  const mod = wasmMod.value
  if (mod) {
    active.value = active.value.map((a) => {
      a.ind.free?.()
      const ind = makeIndicator(mod, a.entry.js, a.entry.params)
      return ind ? { ...a, ind, value: '—' } : a
    })
  }

  await loadHistory()
  for (const a of active.value) replay(a)
  syncRows()

  feedDepth = needsDepth()
  feedTrades = needsTrades()
  feed = new BinanceFeed(
    symbol.value, interval.value,
    { onKline, onTrade, onDepth, onStatus: (s) => (status.value = s) },
    feedDepth, feedTrades,
  )
  feed.connect()
}

async function loadHistory(): Promise<void> {
  if (historyDepth.value <= 0) { candles.value = []; return }
  try {
    const hist = await fetchKlines(symbol.value, interval.value, historyDepth.value)
    candles.value = hist
    chart.setCandles(hist)
  } catch {
    note.value = 'Warmup history blocked (CORS) — running live-only.'
    candles.value = []
  }
}

// --- lifecycle ----------------------------------------------------------------
onMounted(async () => {
  if (chartEl.value) chart.init(chartEl.value, true)
  try {
    const mod = await loadWasm()
    wasmMod.value = mod
    wasmVer.value = wasmVersion(mod)
    wasmReady.value = true
  } catch (e) {
    note.value = `Failed to load wickra-wasm: ${String(e)}`
    return
  }
  await restart()
})

onBeforeUnmount(() => {
  feed?.close()
  chart.destroy()
})
</script>

<template>
  <div class="app">
    <header class="bar">
      <div class="brand">
        <strong>Wickra Live</strong>
        <span class="tag">{{ TOTAL }} streaming indicators · 100% in your browser · 0 backend</span>
      </div>
      <div class="controls">
        <select v-model="symbol" @change="restart">
          <option v-for="s in SYMBOLS" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="interval" @change="restart">
          <option v-for="i in INTERVALS" :key="i" :value="i">{{ i }}</option>
        </select>
        <select v-model.number="historyDepth" @change="restart">
          <option v-for="h in HISTORY_OPTIONS" :key="h" :value="h">{{ h === 0 ? 'live only' : h + ' bars' }}</option>
        </select>
        <span class="status" :class="status">{{ status }}</span>
        <span class="price" v-if="lastPrice != null">{{ lastPrice.toFixed(2) }}</span>
      </div>
    </header>

    <main class="main">
      <section class="chart-wrap">
        <div ref="chartEl" class="chart"></div>
        <div v-if="note" class="note">{{ note }}</div>
        <div v-if="!wasmReady" class="loading">Loading wickra-wasm…</div>
      </section>
      <aside class="side">
        <IndicatorPicker @select="add" />
        <ActiveList :items="activeRows" @remove="remove" />
        <OrderBook :bids="bids" :asks="asks" />
      </aside>
    </main>

    <footer class="foot">
      <span>wickra-wasm <template v-if="wasmVer">v{{ wasmVer }}</template> · live Binance WebSocket · {{ updates }} closed-bar updates</span>
      <a href="https://github.com/wickra-lib/wickra" target="_blank" rel="noreferrer">wickra-lib/wickra</a>
    </footer>
  </div>
</template>
