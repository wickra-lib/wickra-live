<script setup lang="ts">
export interface ActiveView {
  id: string
  label: string
  family: string
  pane: string
  feed: string
  value: string
  params: number[]
  color: string
  width: number
  hidden: boolean
  render: string
}

const props = defineProps<{ items: ActiveView[] }>()
const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'update-params', id: string, params: number[]): void
  (e: 'update-style', id: string, color: string, width: number): void
  (e: 'toggle-hidden', id: string): void
}>()

// Colour/width controls apply to chart line series only (line / multi / bars);
// markers and profile histograms carry their own semantic styling.
function hasLine(render: string): boolean {
  return render === 'line' || render === 'multi' || render === 'bars'
}

function onParam(it: ActiveView, idx: number, ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  const next = it.params.slice()
  next[idx] = n
  emit('update-params', it.id, next)
}

function onColor(it: ActiveView, ev: Event): void {
  emit('update-style', it.id, (ev.target as HTMLInputElement).value, it.width)
}

function onWidth(it: ActiveView, ev: Event): void {
  emit('update-style', it.id, it.color, Number((ev.target as HTMLSelectElement).value))
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
        <button
          class="dot" :class="{ off: it.hidden }" :style="{ background: it.color }"
          type="button" :title="it.hidden ? 'Show' : 'Hide'" @click="emit('toggle-hidden', it.id)"
        ></button>
        <span class="label" :class="{ dim: it.hidden }">{{ it.label }}</span>
        <span class="val">{{ it.value }}</span>
        <button class="rm" title="Remove" @click="emit('remove', it.id)">×</button>
      </div>
      <div class="meta">
        <span class="sub">{{ it.pane }}<template v-if="it.feed !== 'kline'"> · {{ it.feed }}</template></span>
        <div class="controls">
          <template v-if="hasLine(it.render)">
            <input class="color" type="color" :value="it.color" title="Colour" @input="onColor(it, $event)" />
            <select class="width" :value="it.width" title="Line width" @change="onWidth(it, $event)">
              <option v-for="w in [1, 2, 3, 4]" :key="w" :value="w">{{ w }}px</option>
            </select>
          </template>
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
  </div>
</template>

<style scoped>
.active { border-bottom: 1px solid var(--line); display: flex; flex-direction: column; }
.active-head { padding: 7px 10px 4px; font-weight: 600; font-size: 13px; }
.count { opacity: 0.5; font-weight: 400; }
.empty { padding: 0 10px 8px; font-size: 12px; opacity: 0.6; }
.row { padding: 5px 10px 7px; border-top: 1px solid var(--line); }
.top { display: flex; align-items: center; gap: 8px; }
.dot { flex: 0 0 auto; width: 11px; height: 11px; border-radius: 50%; border: none; padding: 0; cursor: pointer; }
.dot.off { opacity: 0.28; box-shadow: inset 0 0 0 1px var(--fg3); }
.label { font-size: 13px; font-weight: 500; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label.dim { opacity: 0.5; }
.val { font-variant-numeric: tabular-nums; font-size: 12px; opacity: 0.85; }
.rm { background: none; border: none; color: inherit; cursor: pointer; font-size: 18px; opacity: 0.5; line-height: 1; padding: 0 2px; }
.rm:hover { opacity: 1; color: #ef4444; }
.meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 3px; }
.sub { font-size: 10.5px; opacity: 0.55; white-space: nowrap; }
.controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.color { width: 26px; height: 22px; padding: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); cursor: pointer; }
.width { padding: 2px 4px; font-size: 11px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: inherit; }
.params { display: flex; gap: 4px; flex-wrap: wrap; }
.params input {
  width: 56px; padding: 3px 5px; font-size: 12px; border: 1px solid var(--line);
  border-radius: 5px; background: var(--bg); color: inherit; font-variant-numeric: tabular-nums;
}
</style>
