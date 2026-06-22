import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// Served from the root of the live.wickra.org custom domain (Cloudflare Pages),
// so the base is '/'. wickra-wasm is a real WebAssembly module — the two wasm
// plugins let Vite bundle and instantiate it client-side.
export default defineConfig({
  base: '/',
  plugins: [vue(), wasm(), topLevelAwait()],
  build: { target: 'esnext' },
})
