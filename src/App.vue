<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import IndicatorPicker from './components/IndicatorPicker.vue'
import ActiveList, { type ActiveView } from './components/ActiveList.vue'
import OrderBook from './components/OrderBook.vue'
import TradesTape from './components/TradesTape.vue'
import ProfilePanel from './components/ProfilePanel.vue'
import BackToTop from './components/BackToTop.vue'
import { toProfileSnapshot, type ProfileSnapshot } from './lib/profile'
import { ChartController } from './lib/chart'
import { BinanceFeed, fetchKlines, INTERVALS, SYMBOLS } from './lib/binance'
import { feedKline, feedOrderBook, feedPair, feedTrade, type Candle, type IndicatorResult, type Trade } from './lib/feed'
import { loadWasm, makeIndicator, wasmVersion, type WasmIndicator } from './lib/wasm'
import { TOTAL, type Entry } from './lib/catalog'
import badges from './badges.json'

interface Active {
  id: string
  entry: Entry
  ind: WasmIndicator
  params: number[]
  value: string
}

function sameParams(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

const symbol = ref<string>('BTCUSDT')
const interval = ref<string>('1m')
const historyDepth = ref<number>(500)
const HISTORY_OPTIONS = [0, 200, 500, 1000]

const navOpen = ref(false)
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
const trades = ref<Trade[]>([])
// Latest profile snapshot per active profile indicator (histogram panel).
const profiles = ref<Record<string, { label: string; snap: ProfileSnapshot }>>({})
const profileList = computed(() =>
  Object.entries(profiles.value).map(([id, p]) => ({ id, label: p.label, snap: p.snap })),
)
// Microstructure panel (order book + trades tape) under the chart, toggleable.
const showMicro = ref(false)

let feed: BinanceFeed | null = null
let seq = 0
// The depth (10/s) and trade streams are the main mobile-lag source, so they are
// opt-in: subscribed only while an order-book / trade indicator is active OR the
// microstructure panel is open.
let feedDepth = false
let feedTrades = false
function wantDepth(): boolean { return showMicro.value || active.value.some((a) => a.entry.feed === 'orderbook') }
function wantTrades(): boolean { return showMicro.value || active.value.some((a) => a.entry.feed === 'trade') }
async function ensureFeed(): Promise<void> {
  if (wantDepth() !== feedDepth || wantTrades() !== feedTrades || wantRef() !== refOn) await restart()
}
async function toggleMicro(): Promise<void> {
  showMicro.value = !showMicro.value
  await ensureFeed()
}

// Pause/Resume the live feed without touching indicator state (handoff Phase 1).
// Pause closes the WS; resume reconnects the same streams and keeps computing
// from where the bars resume (the gap while paused is expected).
const paused = ref(false)
function togglePause(): void {
  paused.value = !paused.value
  if (paused.value) {
    feed?.close()
    refFeed?.close()
    status.value = 'closed'
  } else {
    feed?.connect()
    if (refOn) refFeed?.connect()
  }
}

// Pair / spread indicators (sig 'pair') need a second synchronized price series.
// A kline-only WS for a reference symbol streams its close; pair indicators are
// fed (primaryClose, refClose) on each primary close. Subscribed only while a
// pair indicator is active.
const refSymbol = ref<string>('ETHUSDT')
const pairActive = computed(() => active.value.some((a) => a.entry.sig === 'pair'))
let refFeed: BinanceFeed | null = null
let refOn = false
let refCloseLatest = Number.NaN
const refCloseByTime = new Map<number, number>()
function wantRef(): boolean { return pairActive.value }
function onRefKline(k: Candle, closed: boolean): void {
  refCloseLatest = k.close
  if (closed) {
    refCloseByTime.set(k.time, k.close)
    if (refCloseByTime.size > 6000) refCloseByTime.delete(refCloseByTime.keys().next().value as number)
  }
}

const activeView = (): ActiveView[] =>
  active.value.map((a) => ({
    id: a.id, label: a.entry.label, family: a.entry.family,
    pane: a.entry.pane, feed: a.entry.sig === 'pair' ? 'pair' : a.entry.feed, value: a.value, params: a.params.slice(),
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
  if (entry.render === 'bars') {
    // Bar-builders emit 0..n completed bars per candle. Plot each bar's
    // representative price as a stepped line on the price pane. Multiple bars
    // from one candle get +1s offsets so chart times stay strictly increasing.
    if (Array.isArray(res)) {
      let i = 0
      for (const bar of res) {
        const p = barPrice(bar)
        if (Number.isFinite(p)) {
          chart.pushPoint(id, 'bar', time + i, p, 'price', true)
          i++
          a.value = fmt(p)
        }
      }
    }
    return
  }
  if (entry.render === 'profile') {
    const snap = toProfileSnapshot(res)
    if (snap) {
      profiles.value[id] = { label: entry.label, snap }
      a.value = profileValue(snap)
    }
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

// Representative price for a bar-builder bar across the different shapes
// (Renko close, Kagi end, PnF high/low mid, OHLC close, …).
function barPrice(bar: unknown): number {
  if (!bar || typeof bar !== 'object') return Number.NaN
  const o = bar as Record<string, number>
  if (typeof o.close === 'number') return o.close
  if (typeof o.end === 'number') return o.end
  if (typeof o.high === 'number' && typeof o.low === 'number') return (o.high + o.low) / 2
  if (typeof o.open === 'number') return o.open
  return Number.NaN
}

// One-line summary of a profile snapshot for the active list.
function profileValue(s: ProfileSnapshot): string {
  if (s.kind === 'price') {
    let poc = 0
    for (let i = 1; i < s.bins.length; i++) if (s.bins[i] > s.bins[poc]) poc = i
    const span = s.priceHigh - s.priceLow
    const price = s.priceLow + (s.bins.length > 1 ? (span * poc) / (s.bins.length - 1) : 0)
    return `POC ${fmt(price)}`
  }
  if (s.kind === 'footprint') return `${s.levels.length} lvl`
  return `${s.values.length} bkt`
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// Feed an indicator, surfacing any thrown error to the error bar (latest only)
// instead of letting it break the update loop or vanish into the console.
function drive(a: Active, res: () => IndicatorResult, time: number): void {
  try {
    applyResult(a, res(), time)
  } catch (e) {
    note.value = `${a.entry.label}: ${errMsg(e)}`
  }
}

// --- feed an indicator over the in-memory history ----------------------------
// kline indicators replay over the candle history; pair indicators replay over
// the candles zipped with the reference symbol's close at each time (carried
// forward). Trade/order-book indicators have no history to replay.
function replay(a: Active): void {
  if (a.entry.feed === 'kline') {
    a.ind.reset?.()
    for (const k of candles.value) drive(a, () => feedKline(a.ind, a.entry.sig, k), k.time)
  } else if (a.entry.sig === 'pair') {
    a.ind.reset?.()
    let lastRef = Number.NaN
    for (const k of candles.value) {
      const r = refCloseByTime.get(k.time)
      if (r !== undefined) lastRef = r
      if (Number.isFinite(lastRef)) drive(a, () => feedPair(a.ind, k.close, lastRef), k.time)
    }
  }
}

// --- add / remove -------------------------------------------------------------
async function add(entry: Entry): Promise<void> {
  note.value = null
  // Pair indicators (sig 'pair') ARE streamable via the reference symbol; only
  // breadth (cross) and derivatives (other) genuinely have no feed here.
  if (entry.feed === 'none' && entry.sig !== 'pair') {
    note.value = `${entry.label} needs data this demo doesn't stream (breadth / derivatives).`
    return
  }
  const mod = wasmMod.value
  if (!mod) return
  // No exact duplicates — the same indicator with the same parameters adds
  // nothing; tweak its parameters in the active list instead.
  if (active.value.some((a) => a.entry.js === entry.js && sameParams(a.params, entry.params))) {
    note.value = `${entry.label} is already active — edit its parameters in the active list.`
    return
  }
  let ind: WasmIndicator | null = null
  try { ind = makeIndicator(mod, entry.js, entry.params) }
  catch (e) { note.value = `${entry.label}: ${errMsg(e)}`; return }
  if (!ind) { note.value = `${entry.label} is not exposed in this wickra-wasm build.`; return }
  const a: Active = { id: `i${seq++}`, entry, ind, params: entry.params.slice(), value: '—' }
  replay(a)
  active.value = [...active.value, a]
  syncRows()
  await ensureFeed()
}

// Re-instantiate an active indicator with edited parameters and redraw it.
function updateParams(id: string, newParams: number[]): void {
  const mod = wasmMod.value
  if (!mod) return
  const a = active.value.find((x) => x.id === id)
  if (!a) return
  let ind: WasmIndicator | null = null
  try { ind = makeIndicator(mod, a.entry.js, newParams) }
  catch (e) { note.value = `${a.entry.label}: ${errMsg(e)}`; return }
  if (!ind) { note.value = `Invalid parameters for ${a.entry.label}.`; return }
  a.ind.free?.()
  a.ind = ind
  a.params = newParams
  chart.removeIndicator(id) // drop the old series; replay recreates them
  delete profiles.value[id]
  replay(a)
  active.value = [...active.value]
  syncRows()
}

function remove(id: string): void {
  const a = active.value.find((x) => x.id === id)
  a?.ind.free?.()
  chart.removeIndicator(id)
  delete profiles.value[id]
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
  const refClose = refCloseByTime.get(k.time) ?? refCloseLatest
  for (const a of active.value) {
    if (a.entry.feed === 'kline') drive(a, () => feedKline(a.ind, a.entry.sig, k), k.time)
    else if (a.entry.sig === 'pair' && Number.isFinite(refClose)) drive(a, () => feedPair(a.ind, k.close, refClose), k.time)
  }
  updates.value++
  syncRows()
}

function onTrade(t: Trade): void {
  trades.value.push(t)
  if (trades.value.length > 80) trades.value.shift()
  let touched = false
  for (const a of active.value) {
    if (a.entry.feed === 'trade') { drive(a, () => feedTrade(a.ind, t), t.time); touched = true }
  }
  if (touched) syncRows()
}

function onDepth(_top: { bidPx: number; bidSz: number; askPx: number; askSz: number }, b: [number, number][], a: [number, number][]): void {
  bids.value = b
  asks.value = a
  const t = Math.trunc(Date.now() / 1000)
  let touched = false
  for (const ind of active.value) {
    if (ind.entry.feed === 'orderbook') { drive(ind, () => feedOrderBook(ind.ind, b, a), t); touched = true }
  }
  if (touched) syncRows()
}

// --- (re)start the feed for the current symbol/interval/history ---------------
async function restart(): Promise<void> {
  paused.value = false
  feed?.close()
  refFeed?.close()
  refFeed = null
  refCloseByTime.clear()
  refCloseLatest = Number.NaN
  candles.value = []
  bids.value = []
  asks.value = []
  trades.value = []
  profiles.value = {}
  chart.clearIndicators()
  // Fresh indicator state for the new market.
  const mod = wasmMod.value
  if (mod) {
    active.value = active.value.map((a) => {
      a.ind.free?.()
      const ind = makeIndicator(mod, a.entry.js, a.params)
      return ind ? { ...a, ind, value: '—' } : a
    })
  }

  await loadHistory()
  await loadRefHistory()
  for (const a of active.value) replay(a)
  syncRows()

  feedDepth = wantDepth()
  feedTrades = wantTrades()
  feed = new BinanceFeed(
    symbol.value, interval.value,
    { onKline, onTrade, onDepth, onStatus: (s) => (status.value = s) },
    feedDepth, feedTrades,
  )
  feed.connect()

  // Reference-symbol kline-only stream for pair indicators.
  refOn = wantRef()
  if (refOn) {
    refFeed = new BinanceFeed(refSymbol.value, interval.value, { onKline: onRefKline }, false, false)
    refFeed.connect()
  }
}

async function loadRefHistory(): Promise<void> {
  if (!wantRef() || historyDepth.value <= 0) return
  try {
    const hist = await fetchKlines(refSymbol.value, interval.value, historyDepth.value)
    for (const k of hist) refCloseByTime.set(k.time, k.close)
    if (hist.length) refCloseLatest = hist[hist.length - 1].close
  } catch {
    // Reference warmup blocked (CORS) — pair indicators pair live-only.
  }
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
  refFeed?.close()
  chart.destroy()
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="nav">
        <a class="nav-brand" href="https://wickra.org" target="_blank" rel="noreferrer">
          <img class="nav-logo" src="https://wickra.org/wickra-mark.svg" alt="Wickra" width="24" height="24" />
          <span class="nav-title">Wickra</span>
        </a>
        <button
          class="nav-burger" :class="{ open: navOpen }"
          type="button" aria-label="Menu" :aria-expanded="navOpen"
          @click="navOpen = !navOpen"
        ><span></span><span></span><span></span></button>
        <nav class="nav-menu" :class="{ open: navOpen }" @click="navOpen = false">
          <a href="https://wickra.org" target="_blank" rel="noreferrer">Home</a>
          <a href="https://wickra.org/demo" target="_blank" rel="noreferrer">Demo</a>
          <a href="https://docs.wickra.org" target="_blank" rel="noreferrer">Docs</a>
          <a href="https://wickra.org/benchmarks" target="_blank" rel="noreferrer">Benchmarks</a>
          <a href="https://github.com/wickra-lib/wickra" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
      <div class="toolbar">
        <select v-model="symbol" @change="restart">
          <option v-for="s in SYMBOLS" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="interval" @change="restart">
          <option v-for="i in INTERVALS" :key="i" :value="i">{{ i }}</option>
        </select>
        <select v-model.number="historyDepth" @change="restart">
          <option v-for="h in HISTORY_OPTIONS" :key="h" :value="h">{{ h === 0 ? 'live only' : h + ' bars' }}</option>
        </select>
        <button class="tgl" type="button" :title="paused ? 'Resume live feed' : 'Pause live feed'" @click="togglePause">{{ paused ? 'Resume' : 'Pause' }}</button>
        <button class="tgl" :class="{ on: showMicro }" type="button" title="Live order book + trades" @click="toggleMicro">Order flow</button>
        <template v-if="pairActive">
          <span class="vs">vs</span>
          <select v-model="refSymbol" title="Reference symbol for pair indicators" @change="restart">
            <option v-for="s in SYMBOLS" :key="s" :value="s">{{ s }}</option>
          </select>
        </template>
        <span class="status" :class="status">{{ status }}</span>
        <span class="price" v-if="lastPrice != null">{{ lastPrice.toFixed(2) }}</span>
      </div>
    </header>

    <main class="main">
      <div class="chart-col">
        <section class="chart-wrap">
          <div ref="chartEl" class="chart"></div>
          <div v-if="!wasmReady" class="loading">Loading wickra-wasm…</div>
        </section>
        <div v-if="note" class="errbar">
          <code class="errtext">{{ note }}</code>
          <button class="errclear" type="button" title="Clear" @click="note = null">Clear</button>
        </div>
        <div v-if="showMicro" class="micro">
          <OrderBook :bids="bids" :asks="asks" />
          <TradesTape :trades="trades" />
          <p v-if="!bids.length && !trades.length" class="micro-wait">Waiting for live order book &amp; trades…</p>
        </div>
        <ProfilePanel v-if="profileList.length" :items="profileList" class="profilebar" />
      </div>
      <aside class="side">
        <ActiveList :items="activeRows" @remove="remove" @update-params="updateParams" />
        <IndicatorPicker @select="add" />
      </aside>
    </main>

    <footer class="wk-footer">
      <div class="wk-footer-badges">
        <a v-for="b in badges" :key="b.alt" :href="b.href" target="_blank" rel="noreferrer"
        ><img :src="b.file" :alt="b.alt" :width="b.width" :height="b.height" loading="eager" decoding="async" /></a>
      </div>
      <p class="wk-footer-meta">Released under the MIT OR Apache-2.0 license — not a trading system, use at your own risk.</p>
      <p class="wk-footer-meta wk-footer-meta-sub">
        <span>Copyright © 2026 kingchenc</span>
        <span class="wk-sep">·</span>
        <a href="https://wickra.org/about" target="_blank" rel="noreferrer">About</a>
        <span class="wk-sep">·</span>
        <a href="https://wickra.org/security" target="_blank" rel="noreferrer">Security</a>
        <span class="wk-sep">·</span>
        <a href="https://wickra.org/privacy" target="_blank" rel="noreferrer">Privacy</a>
      </p>
    </footer>
    <BackToTop />
  </div>
</template>
