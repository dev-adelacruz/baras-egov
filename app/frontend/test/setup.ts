import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom doesn't reliably expose localStorage/sessionStorage as globals, so
// provide a simple in-memory implementation for tests.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), writable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), writable: true })

// jsdom implements no CSSOM view module, so `window.matchMedia` is undefined —
// any component that reacts to a breakpoint throws on mount. Reports the query
// as unmatched, which under this app's mobile-first breakpoints means tests run
// at the narrow layout unless a test overrides it.
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {}, // deprecated, kept for libraries that still call it
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
})

// Unmount React trees and reset storage between tests.
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
