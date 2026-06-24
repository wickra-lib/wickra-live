<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

// Floating "scroll back to top" control. Fades in once the page is scrolled a
// bit, sits in the bottom-right corner, and smooth-scrolls to the top on click.
const visible = ref(false)

function update() {
  visible.value = window.scrollY > 400
}

function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update, { passive: true })
  update()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', update)
  window.removeEventListener('resize', update)
})
</script>

<template>
  <Transition name="wk-bt-fade">
    <button
      v-show="visible"
      class="wk-backtotop"
      type="button"
      aria-label="Back to top"
      title="Back to top"
      @click="toTop"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 19V5M12 5l-6 6M12 5l6 6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </Transition>
</template>
