const MAX_AGE = 30 * 60 * 1000
const MAX_KEYS = 8

export function sourceHealth(storage: Storage | null, uriName: string, now = Date.now) {
  const storageKey = `source-health:v1:${uriName}`

  function read(): string[] {
    try {
      const entry = JSON.parse(storage?.getItem(storageKey) ?? 'null')
      if (!entry || !Number.isFinite(entry.at) || entry.at > now() || now() - entry.at >= MAX_AGE
        || !Array.isArray(entry.keys) || !entry.keys.every((key: unknown) => typeof key === 'string' && key.length > 0)) return []
      return [...new Set<string>(entry.keys)].slice(0, MAX_KEYS)
    } catch {
      return []
    }
  }

  function write(keys: string[]) {
    try {
      if (keys.length) storage?.setItem(storageKey, JSON.stringify({ at: now(), keys }))
      else storage?.removeItem(storageKey)
    } catch {
      // Playback works without session storage.
    }
  }

  return {
    read,
    record(key: string) {
      const keys = [key, ...read().filter(previous => previous !== key)].slice(0, MAX_KEYS)
      write(keys)
    },
    forget(key: string) {
      const keys = read()
      if (keys.includes(key)) write(keys.filter(previous => previous !== key))
    },
    clear() {
      write([])
    },
  }
}
