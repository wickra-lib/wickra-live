// Persist the session (market settings + active indicators with their
// configured params/colour/width/visibility) to localStorage so a reload
// restores exactly what the user had set up. Best-effort: any storage error
// (private mode, quota) is swallowed and the app runs with defaults.

const KEY = 'wickra-live-session-v1'
const PROFILES_KEY = 'wickra-live-profiles-v1'

export interface PersistedIndicator {
  js: string
  params: number[]
  color: string
  width: number
  hidden: boolean
}

export interface PersistedSession {
  symbol: string
  interval: string
  historyDepth: number
  refSymbol: string
  showMicro: boolean
  indicators: PersistedIndicator[]
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as PersistedSession
    if (!s || !Array.isArray(s.indicators)) return null
    return s
  } catch {
    return null
  }
}

export function saveSession(session: PersistedSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // ignore (storage unavailable / full)
  }
}

// --- named profiles ----------------------------------------------------------
// A map of user-named layouts the user can save, load, rename and delete from
// the toolbar (independent of the always-on last-session auto-restore).

export type ProfileMap = Record<string, PersistedSession>

export function loadProfiles(): ProfileMap {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    const obj = raw ? JSON.parse(raw) : null
    return obj && typeof obj === 'object' ? (obj as ProfileMap) : {}
  } catch {
    return {}
  }
}

export function saveProfiles(profiles: ProfileMap): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  } catch {
    // ignore (storage unavailable / full)
  }
}
