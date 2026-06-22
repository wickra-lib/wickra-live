<script setup lang="ts">
import { computed, ref } from 'vue'
import { byFamily, CATALOG, type Entry } from '../lib/catalog'

const emit = defineEmits<{ (e: 'select', entry: Entry): void }>()

const query = ref('')
// All families collapsed by default — tap a family to expand its indicators.
const expanded = ref<Set<string>>(new Set())

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const filtered = q
    ? CATALOG.filter((e) => e.label.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.family.toLowerCase().includes(q))
    : CATALOG
  return byFamily(filtered)
})

// When searching, every matching group is open (the result set is small).
// Otherwise only the families the user expanded render their items — so the DOM
// holds ~24 rows instead of 514, which keeps scrolling smooth on phones.
function isOpen(family: string): boolean {
  return query.value.trim().length > 0 || expanded.value.has(family)
}
function toggle(family: string): void {
  const next = new Set(expanded.value)
  if (next.has(family)) next.delete(family)
  else next.add(family)
  expanded.value = next
}

const total = CATALOG.length

function feedTag(e: Entry): string {
  return e.feed === 'kline' ? '' : e.feed === 'trade' ? 'trades' : e.feed === 'orderbook' ? 'book' : 'n/a'
}
</script>

<template>
  <div class="picker">
    <div class="picker-head">
      <input v-model="query" type="search" placeholder="Search 514 indicators…" />
      <span class="count">{{ total }} indicators · 24 families</span>
    </div>
    <div class="picker-list">
      <div v-for="g in groups" :key="g.family" class="grp">
        <button class="summary" @click="toggle(g.family)">
          <span class="caret" :class="{ open: isOpen(g.family) }">▸</span>
          {{ g.family }} <span class="fam-count">{{ g.items.length }}</span>
        </button>
        <template v-if="isOpen(g.family)">
          <button
            v-for="e in g.items"
            :key="e.js"
            class="ind"
            :class="{ 'ind-special': e.feed !== 'kline' }"
            :title="`${e.name} · ${e.out}`"
            @click="emit('select', e)"
          >
            <span class="ind-label">{{ e.label }}</span>
            <span v-if="feedTag(e)" class="ind-feed">{{ feedTag(e) }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; height: 100%; min-height: 0; flex: 1; }
.picker-head { padding: 8px; border-bottom: 1px solid var(--line); }
.picker-head input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg2); color: inherit; font-size: 16px; }
.count { display: block; font-size: 11px; opacity: 0.6; margin-top: 4px; }
.picker-list { overflow-y: auto; flex: 1; min-height: 0; -webkit-overflow-scrolling: touch; }
.grp { border-bottom: 1px solid var(--line); }
.summary { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: none; border: none; color: inherit; cursor: pointer; padding: 8px 10px; font-weight: 600; font-size: 13px; }
.caret { display: inline-block; transition: transform 0.12s; opacity: 0.6; font-size: 11px; }
.caret.open { transform: rotate(90deg); }
.fam-count { opacity: 0.5; font-weight: 400; font-size: 11px; }
.ind { display: flex; justify-content: space-between; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 7px 10px 7px 24px; background: none; border: none; color: inherit; cursor: pointer; font-size: 13px; }
.ind:hover, .ind:active { background: var(--bg2); }
.ind-special { opacity: 0.7; }
.ind-feed { font-size: 10px; opacity: 0.6; border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }

/* On phones the whole page scrolls, so the picker grows with its content
   instead of being a tiny inner scroll area. The search stays pinned on top. */
@media (max-width: 820px) {
  .picker { height: auto; }
  .picker-list { overflow: visible; flex: none; }
  .picker-head { position: sticky; top: 0; background: var(--bg2); z-index: 5; }
  .ind { padding-top: 9px; padding-bottom: 9px; }
}
</style>
