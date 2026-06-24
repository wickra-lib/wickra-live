<script setup lang="ts">
import { computed } from 'vue'
import type { Trade } from '../lib/feed'

const props = defineProps<{
  trades: Trade[]
  rows?: number
}>()

const limit = computed(() => props.rows ?? 18)
// Newest first.
const recent = computed(() => props.trades.slice(-limit.value).reverse())

const maxSize = computed(() => {
  let m = 0
  for (const t of recent.value) m = Math.max(m, t.size)
  return m || 1
})

function pct(size: number): string {
  return `${Math.round((size / maxSize.value) * 100)}%`
}

function clock(timeSec: number): string {
  const d = new Date(timeSec * 1000)
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Buy vs sell pressure across the shown window — a compact footprint summary.
const buyShare = computed(() => {
  let buy = 0
  let total = 0
  for (const t of recent.value) {
    total += t.size
    if (t.isBuy) buy += t.size
  }
  return total > 0 ? buy / total : 0.5
})
</script>

<template>
  <div class="tape" v-if="trades.length">
    <div class="tape-head">
      Trades
      <span class="flow" :class="buyShare >= 0.5 ? 'up' : 'down'">{{ (buyShare * 100).toFixed(0) }}% buy</span>
    </div>
    <div class="rows">
      <div v-for="(t, i) in recent" :key="i" class="trow" :class="t.isBuy ? 'buy' : 'sell'">
        <span class="bar" :style="{ width: pct(t.size) }"></span>
        <span class="px">{{ t.price.toFixed(2) }}</span>
        <span class="sz">{{ t.size.toFixed(3) }}</span>
        <span class="tm">{{ clock(t.time) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tape { border-top: 1px solid var(--line); padding: 6px 10px 8px; }
.tape-head { display: flex; justify-content: space-between; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.flow { font-weight: 500; font-size: 11px; }
.flow.up { color: #22c55e; } .flow.down { color: #ef4444; }
.trow { position: relative; display: grid; grid-template-columns: 1fr auto auto; gap: 8px; font-variant-numeric: tabular-nums; font-size: 11.5px; padding: 1px 4px; }
.bar { position: absolute; right: 0; top: 0; bottom: 0; opacity: 0.16; }
.buy .bar { background: #22c55e; } .sell .bar { background: #ef4444; }
.buy .px { color: #22c55e; } .sell .px { color: #ef4444; }
.px, .sz, .tm { position: relative; z-index: 1; }
.tm { opacity: 0.55; }
</style>
