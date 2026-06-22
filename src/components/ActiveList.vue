<script setup lang="ts">
export interface ActiveView {
  id: string
  label: string
  family: string
  pane: string
  feed: string
  value: string
}

defineProps<{ items: ActiveView[] }>()
const emit = defineEmits<{ (e: 'remove', id: string): void }>()
</script>

<template>
  <div class="active">
    <div class="active-head">Active <span class="count">{{ items.length }}</span></div>
    <div v-if="!items.length" class="empty">Pick indicators from the list — they compute live, tick by tick.</div>
    <div v-for="it in items" :key="it.id" class="row">
      <div class="meta">
        <span class="label">{{ it.label }}</span>
        <span class="sub">{{ it.pane }}<template v-if="it.feed !== 'kline'"> · {{ it.feed }}</template></span>
      </div>
      <span class="val">{{ it.value }}</span>
      <button class="rm" title="Remove" @click="emit('remove', it.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.active { border-top: 1px solid var(--line); display: flex; flex-direction: column; max-height: 38%; }
.active-head { padding: 6px 10px; font-weight: 600; font-size: 13px; }
.count { opacity: 0.5; font-weight: 400; }
.empty { padding: 6px 10px 10px; font-size: 12px; opacity: 0.6; }
.row { display: flex; align-items: center; gap: 8px; padding: 4px 10px; overflow-y: auto; }
.meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.label { font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 10.5px; opacity: 0.55; }
.val { font-variant-numeric: tabular-nums; font-size: 12px; opacity: 0.85; }
.rm { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.5; line-height: 1; }
.rm:hover { opacity: 1; color: #ef4444; }
</style>
