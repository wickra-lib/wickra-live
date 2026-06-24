<script setup lang="ts">
import { computed } from 'vue'
import type { ProfileSnapshot } from '../lib/profile'

const props = defineProps<{
  items: { id: string; label: string; snap: ProfileSnapshot }[]
}>()

interface Row {
  label: string
  primary: number
  secondary?: number
  isPoc?: boolean
  sign?: number
}

interface View {
  id: string
  label: string
  twoSided: boolean
  max: number
  rows: Row[]
}

// Build display rows for each profile, normalised to a 0..max scale for bars.
const views = computed<View[]>(() =>
  props.items.map(({ id, label, snap }) => {
    if (snap.kind === 'price') {
      const n = snap.bins.length
      let pocIdx = 0
      for (let i = 1; i < n; i++) if (snap.bins[i] > snap.bins[pocIdx]) pocIdx = i
      const span = snap.priceHigh - snap.priceLow
      // High price on top.
      const rows: Row[] = []
      for (let i = n - 1; i >= 0; i--) {
        const price = snap.priceLow + (n > 1 ? (span * i) / (n - 1) : 0)
        rows.push({ label: price.toFixed(2), primary: snap.bins[i], isPoc: i === pocIdx })
      }
      return { id, label, twoSided: false, max: Math.max(1, ...snap.bins), rows }
    }
    if (snap.kind === 'footprint') {
      const max = Math.max(1, ...snap.levels.flatMap((l) => [l.bidVol, l.askVol]))
      // High price on top.
      const rows: Row[] = [...snap.levels]
        .sort((a, b) => b.price - a.price)
        .map((l) => ({ label: l.price.toFixed(2), primary: l.bidVol, secondary: l.askVol }))
      return { id, label, twoSided: true, max, rows }
    }
    const max = Math.max(1, ...snap.values.map((v) => Math.abs(v)))
    const rows: Row[] = snap.values.map((v, i) => ({
      label: String(i),
      primary: Math.abs(v),
      sign: Math.sign(v),
    }))
    return { id, label, twoSided: false, max, rows }
  }),
)

function pct(v: number, max: number): string {
  return `${Math.round((v / max) * 100)}%`
}
</script>

<template>
  <div class="profiles">
    <div v-for="v in views" :key="v.id" class="profile">
      <div class="p-head">{{ v.label }}</div>
      <div class="p-rows">
        <div v-for="(r, i) in v.rows" :key="i" class="p-row" :class="{ poc: r.isPoc }">
          <span class="p-label">{{ r.label }}</span>
          <span v-if="v.twoSided" class="p-track two">
            <span class="p-bar bid" :style="{ width: pct(r.primary, v.max) }"></span>
            <span class="p-bar ask" :style="{ width: pct(r.secondary ?? 0, v.max) }"></span>
          </span>
          <span v-else class="p-track">
            <span
              class="p-bar"
              :class="r.sign != null ? (r.sign < 0 ? 'down' : 'up') : 'neutral'"
              :style="{ width: pct(r.primary, v.max) }"
            ></span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1px; background: var(--line); }
.profile { background: var(--bg); padding: 6px 10px 8px; min-width: 0; }
.p-head { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.p-rows { display: flex; flex-direction: column; gap: 1px; }
.p-row { display: grid; grid-template-columns: 52px 1fr; gap: 6px; align-items: center; font-variant-numeric: tabular-nums; font-size: 11px; }
.p-row.poc { background: rgba(56, 189, 248, 0.12); }
.p-label { opacity: 0.7; text-align: right; }
.p-track { position: relative; height: 11px; background: rgba(148, 163, 184, 0.08); border-radius: 2px; overflow: hidden; }
.p-track.two { display: flex; flex-direction: column; justify-content: center; gap: 1px; background: transparent; overflow: visible; }
.p-bar { display: block; height: 100%; }
.p-bar.up { background: rgba(56, 189, 248, 0.55); }
.p-bar.neutral { background: rgba(148, 163, 184, 0.5); }
.p-bar.down { background: rgba(239, 68, 68, 0.55); }
.p-track.two .p-bar { height: 4px; border-radius: 2px; min-width: 1px; }
.p-track.two .p-bar.bid { background: rgba(34, 197, 94, 0.6); }
.p-track.two .p-bar.ask { background: rgba(239, 68, 68, 0.6); }
</style>
