// Lazy, single-shot loader for the wickra-wasm bundle. The module is fetched
// once (~80 KB gzipped) and reused for every indicator instance. Indicator
// classes are looked up by name on the resolved module (catalog-driven), so the
// whole surface is treated as `any` here on purpose.

// An indicator's `update` is fed positional args whose types depend on the
// input family: scalars/candles pass `number`, order-book passes four
// `Float64Array`s, trades pass a trailing `boolean`, time-anchored indicators a
// `bigint`. The return is equally varied: a scalar, a struct (object of
// numbers), or — for bar-builders — an array of bar objects. Modelled loosely
// on purpose; callers in `feed.ts` narrow per family.
export type WasmInput = number | bigint | boolean | Float64Array
export interface WasmIndicator {
  update: (...args: WasmInput[]) => unknown
  reset?: () => void
  free?: () => void
}

type WasmModule = Record<string, new (...args: number[]) => WasmIndicator> & {
  default?: () => Promise<unknown>
  version?: () => string
}

let modPromise: Promise<WasmModule> | null = null

export function loadWasm(): Promise<WasmModule> {
  if (!modPromise) {
    modPromise = (async () => {
      const mod = (await import('wickra-wasm')) as unknown as WasmModule
      // wasm-pack default export initialises the module.
      if (typeof mod.default === 'function') await mod.default()
      return mod
    })()
  }
  return modPromise
}

export function wasmVersion(mod: WasmModule): string {
  try {
    return typeof mod.version === 'function' ? mod.version() : ''
  } catch {
    return ''
  }
}

/** Construct an indicator by its wasm class name, or null if it is absent. */
export function makeIndicator(
  mod: WasmModule,
  js: string,
  params: number[],
): WasmIndicator | null {
  const Ctor = mod[js]
  if (typeof Ctor !== 'function') return null
  return new Ctor(...params)
}
