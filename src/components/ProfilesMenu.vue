<script setup lang="ts">
defineProps<{ names: string[]; current: string; canSave: boolean }>()
const emit = defineEmits<{
  (e: 'load', name: string): void
  (e: 'save'): void
  (e: 'rename'): void
  (e: 'delete'): void
}>()

function onSelect(ev: Event): void {
  emit('load', (ev.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="pm">
    <select class="pm-select" :value="current" title="Saved layouts" @change="onSelect">
      <option value="">Layouts…</option>
      <option v-for="n in names" :key="n" :value="n">{{ n }}</option>
    </select>
    <button class="pm-btn" type="button" :disabled="!canSave" title="Save current layout" @click="emit('save')">Save</button>
    <button v-if="current" class="pm-btn" type="button" title="Rename layout" @click="emit('rename')">Rename</button>
    <button v-if="current" class="pm-btn" type="button" title="Delete layout" @click="emit('delete')">✕</button>
  </div>
</template>

<style scoped>
.pm { display: flex; align-items: center; gap: 6px; }
.pm-select { background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; font-size: 13px; }
.pm-btn { background: var(--bg); color: var(--fg2); border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; font-size: 13px; cursor: pointer; }
.pm-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--fg2); }
.pm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
