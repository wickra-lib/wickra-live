<script setup lang="ts">
import { computed, ref } from 'vue'
import { byFamily, CATALOG, type Entry } from '../lib/catalog'

const emit = defineEmits<{ (e: 'select', entry: Entry): void }>()

const query = ref('')

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const filtered = q
    ? CATALOG.filter((e) => e.label.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.family.toLowerCase().includes(q))
    : CATALOG
  return byFamily(filtered)
})

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
      <details v-for="g in groups" :key="g.family" open>
        <summary>{{ g.family }} <span class="fam-count">{{ g.items.length }}</span></summary>
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
      </details>
    </div>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.picker-head { padding: 8px; border-bottom: 1px solid var(--line); }
.picker-head input { width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg2); color: inherit; }
.count { display: block; font-size: 11px; opacity: 0.6; margin-top: 4px; }
.picker-list { overflow-y: auto; flex: 1; min-height: 0; }
details { border-bottom: 1px solid var(--line); }
summary { cursor: pointer; padding: 6px 10px; font-weight: 600; font-size: 13px; user-select: none; }
.fam-count { opacity: 0.5; font-weight: 400; font-size: 11px; }
.ind { display: flex; justify-content: space-between; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 4px 10px 4px 20px; background: none; border: none; color: inherit; cursor: pointer; font-size: 12.5px; }
.ind:hover { background: var(--bg2); }
.ind-special { opacity: 0.7; }
.ind-feed { font-size: 10px; opacity: 0.6; border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
</style>
