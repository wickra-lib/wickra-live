<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  bids: [number, number][]
  asks: [number, number][]
  rows?: number
}>()

const depth = computed(() => props.rows ?? 8)
const topBids = computed(() => props.bids.slice(0, depth.value))
const topAsks = computed(() => props.asks.slice(0, depth.value).reverse())

const maxSize = computed(() => {
  let m = 0
  for (const [, s] of [...topBids.value, ...topAsks.value]) m = Math.max(m, s)
  return m || 1
})

// Top-of-book imbalance: bid share of (bid+ask) size across the shown depth.
const imbalance = computed(() => {
  const sum = (rows: [number, number][]) => rows.reduce((a, [, s]) => a + s, 0)
  const b = sum(topBids.value)
  const a = sum(topAsks.value)
  return b + a > 0 ? b / (b + a) : 0.5
})

function pct(size: number): string {
  return `${Math.round((size / maxSize.value) * 100)}%`
}
</script>

<template>
  <div class="ob" v-if="bids.length && asks.length">
    <div class="ob-head">Order book <span class="imb" :class="imbalance >= 0.5 ? 'up' : 'down'">{{ (imbalance * 100).toFixed(0) }}% bid</span></div>
    <div class="rows">
      <div v-for="(l, i) in topAsks" :key="'a' + i" class="lvl ask">
        <span class="bar" :style="{ width: pct(l[1]) }"></span>
        <span class="px">{{ l[0].toFixed(2) }}</span><span class="sz">{{ l[1].toFixed(3) }}</span>
      </div>
      <div v-for="(l, i) in topBids" :key="'b' + i" class="lvl bid">
        <span class="bar" :style="{ width: pct(l[1]) }"></span>
        <span class="px">{{ l[0].toFixed(2) }}</span><span class="sz">{{ l[1].toFixed(3) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ob { border-top: 1px solid var(--line); padding: 6px 10px 8px; }
.ob-head { display: flex; justify-content: space-between; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.imb { font-weight: 500; font-size: 11px; }
.imb.up { color: #22c55e; } .imb.down { color: #ef4444; }
.lvl { position: relative; display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; font-size: 11.5px; padding: 1px 4px; }
.bar { position: absolute; right: 0; top: 0; bottom: 0; opacity: 0.16; }
.ask .bar { background: #ef4444; } .bid .bar { background: #22c55e; }
.ask .px { color: #ef4444; } .bid .px { color: #22c55e; }
.px, .sz { position: relative; z-index: 1; }
</style>
