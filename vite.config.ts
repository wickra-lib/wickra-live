import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'

// Served from the root of the live.wickra.org custom domain (Cloudflare Pages),
// so the base is '/'. wickra-wasm is a real WebAssembly module — the wasm plugin
// lets Vite bundle and instantiate it client-side. Its async `init()` uses
// top-level await, which the esnext build target below supports natively --
// vite-plugin-top-level-await is not needed for that and does not work under
// Vite 8's Rolldown build.
export default defineConfig({
  base: '/',
  plugins: [vue(), wasm()],
  build: { target: 'esnext' },
})
