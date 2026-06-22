// Vue SFC shim so TS understands `import X from './X.vue'`.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

// wickra-wasm is consumed dynamically: the wasm-pack default export initialises
// the module, and indicator classes are looked up by name (catalog-driven), so
// a permissive `any` surface is exactly what we want here.
declare module 'wickra-wasm'
