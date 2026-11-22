const storageKey = 'kwip:shielded-sources'

type ShieldMembers = Record<string, boolean>
type ShieldGroups = Record<string, ShieldMembers>

export function usePlayerShield() {
  const groups = useState<ShieldGroups>('player-shield:groups', () => ({}))
  const legacy = useState<string[]>('player-shield:legacy', () => [])
  const restored = useState('player-shield:restored', () => false)

  onMounted(() => {
    if (restored.value) return
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      const aliases = Array.isArray(stored) ? stored : stored?.legacy
      if (Array.isArray(aliases)) {
        legacy.value = aliases.filter((key): key is string => typeof key === 'string')
      }
      if (stored?.groups && typeof stored.groups === 'object') {
        groups.value = stored.groups
      }
    } catch {
      // Keep the in-memory preferences if storage is unavailable or invalid.
    }
    restored.value = true
  })

  function save() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ groups: groups.value, legacy: legacy.value }))
    } catch {
      // The selection still applies in memory.
    }
  }

  function isShielded(group: string, member: string) {
    return groups.value[group]?.[member] === true
  }

  function reconcile(group: string, member: string, roster: string[], aliases: string[]) {
    if (!restored.value) return

    const previous = groups.value[group]
    const remembered = legacy.value.filter(alias => aliases.includes(alias))
    if (!previous && remembered.length === 0) return

    const added = roster.filter(key => !Object.hasOwn(previous ?? {}, key))
    if (added.length === 0 && remembered.length === 0) return

    const next = { ...previous }
    const missing = Object.keys(next).filter(key => !roster.includes(key))
    // Reuse a preference on a path change only when one old path and one new path can be paired.
    const [oldKey] = missing
    const [newKey] = added
    if (missing.length === 1 && added.length === 1 && oldKey && newKey) {
      next[newKey] = next[oldKey] === true
      delete next[oldKey]
    }
    for (const key of added) next[key] ??= false
    if (remembered.length > 0) {
      next[member] = true
      legacy.value = legacy.value.filter(alias => !remembered.includes(alias))
    }
    groups.value[group] = next
    save()
  }

  function toggleShield(group: string, member: string, roster: string[]) {
    const next = { ...groups.value[group] }
    for (const key of roster) next[key] ??= false
    next[member] = !isShielded(group, member)
    if (Object.values(next).includes(true)) groups.value[group] = next
    else delete groups.value[group]
    save()
  }

  return { isShielded, toggleShield, reconcile }
}
