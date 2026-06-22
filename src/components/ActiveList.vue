<script setup lang="ts">
export interface ActiveView {
  id: string
  label: string
  family: string
  pane: string
  feed: string
  value: string
  params: number[]
}

const props = defineProps<{ items: ActiveView[] }>()
const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'update-params', id: string, params: number[]): void
}>()

function onParam(it: ActiveView, idx: number, ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  const next = it.params.slice()
  next[idx] = n
  emit('update-params', it.id, next)
}

// A small step that suits both integer periods and fractional multipliers.
function step(v: number): string {
  return Number.isInteger(v) ? '1' : '0.1'
}
void props
</script>

<template>
  <div class="active">
    <div class="active-head">Active <span class="count">{{ items.length }}</span></div>
    <div v-if="!items.length" class="empty">Pick indicators below — they compute live, tick by tick.</div>
    <div v-for="it in items" :key="it.id" class="row">
      <div class="top">
        <span class="label">{{ it.label }}</span>
        <span class="val">{{ it.value }}</span>
        <button class="rm" title="Remove" @click="emit('remove', it.id)">×</button>
      </div>
      <div class="meta">
        <span class="sub">{{ it.pane }}<template v-if="it.feed !== 'kline'"> · {{ it.feed }}</template></span>
        <div v-if="it.params.length" class="params">
          <input
            v-for="(p, i) in it.params"
            :key="i"
            type="number"
            :step="step(p)"
            :value="p"
            @change="onParam(it, i, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.active { border-bottom: 1px solid var(--line); display: flex; flex-direction: column; }
.active-head { padding: 7px 10px 4px; font-weight: 600; font-size: 13px; }
.count { opacity: 0.5; font-weight: 400; }
.empty { padding: 0 10px 8px; font-size: 12px; opacity: 0.6; }
.row { padding: 5px 10px 7px; border-top: 1px solid var(--line); }
.top { display: flex; align-items: center; gap: 8px; }
.label { font-size: 13px; font-weight: 500; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.val { font-variant-numeric: tabular-nums; font-size: 12px; opacity: 0.85; }
.rm { background: none; border: none; color: inherit; cursor: pointer; font-size: 18px; opacity: 0.5; line-height: 1; padding: 0 2px; }
.rm:hover { opacity: 1; color: #ef4444; }
.meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; }
.sub { font-size: 10.5px; opacity: 0.55; }
.params { display: flex; gap: 4px; flex-wrap: wrap; }
.params input {
  width: 56px; padding: 3px 5px; font-size: 12px; border: 1px solid var(--line);
  border-radius: 5px; background: var(--bg); color: inherit; font-variant-numeric: tabular-nums;
}
</style>
