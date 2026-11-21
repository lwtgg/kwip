const MAX_AGE = 30 * 60 * 1000
const MAX_KEYS = 8

export interface SourceHealthEntry {
  expiresAt: number
  keys: string[]
}

export function sourceHealth(storage: Storage | null, uriName: string, now = Date.now) {
  const storageKey = `source-health:v1:${uriName}`

  function readEntry(): SourceHealthEntry | null {
    try {
      const entry = JSON.parse(storage?.getItem(storageKey) ?? 'null')
      const age = now() - entry?.at
      if (!entry || !Number.isFinite(entry.at) || age < 0 || age >= MAX_AGE
        || !Array.isArray(entry.keys) || !entry.keys.every((key: unknown) => typeof key === 'string' && key.length > 0)) return null
      return { expiresAt: entry.at + MAX_AGE, keys: [...new Set<string>(entry.keys)].slice(0, MAX_KEYS) }
    } catch {
      return null
    }
  }

  function write(keys: string[], fallback: SourceHealthEntry | null): SourceHealthEntry | null {
    const at = now()
    try {
      if (!storage) return fallback
      if (!keys.length) {
        storage.removeItem(storageKey)
        return null
      }
      storage.setItem(storageKey, JSON.stringify({ at, keys }))
      return { expiresAt: at + MAX_AGE, keys }
    } catch {
      return fallback
    }
  }

  return {
    read: () => readEntry()?.keys ?? [],
    readEntry,
    record(key: string, entry = readEntry()) {
      const keys = [key, ...(entry?.keys ?? []).filter(previous => previous !== key)].slice(0, MAX_KEYS)
      return write(keys, entry)
    },
    forget(key: string, entry = readEntry()) {
      if (!entry?.keys.includes(key)) return entry
      const keys = entry.keys.filter(previous => previous !== key)
      return write(keys, keys.length ? { ...entry, keys } : null)
    },
    clear() {
      write([], null)
    },
  }
}
