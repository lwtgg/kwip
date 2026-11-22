const storageKey = 'kwip:shielded-sources'

export function usePlayerShield() {
  const shieldedSources = useState('player-shield:sources', () => new Set<string>())
  const restored = useState('player-shield:restored', () => false)

  onMounted(() => {
    if (restored.value) return
    restored.value = true
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      if (Array.isArray(stored)) {
        shieldedSources.value = new Set(stored.filter((key): key is string => typeof key === 'string'))
      }
    } catch {
      // Keep the in-memory preferences if storage is unavailable or invalid.
    }
  })

  function isShielded(key: string) {
    return shieldedSources.value.has(key)
  }

  function saveShieldPreferences() {
    if (import.meta.client) {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...shieldedSources.value]))
      } catch {
        // The selection still applies in memory.
      }
    }
  }

  function toggleShield(key: string) {
    const keys = shieldedSources.value
    if (keys.has(key)) keys.delete(key)
    else keys.add(key)
    saveShieldPreferences()
  }

  function migrateShield(key: string, aliases: string[]) {
    const keys = shieldedSources.value
    const remembered = aliases.filter(alias => keys.has(alias))
    if (remembered.length === 0) return

    keys.add(key)
    for (const alias of remembered) keys.delete(alias)
    saveShieldPreferences()
  }

  return { isShielded, toggleShield, migrateShield, shieldedCount: computed(() => shieldedSources.value.size) }
}
