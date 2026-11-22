const storageKey = 'kwip:shielded-sources'

type ShieldMembers = Record<string, boolean>
type ShieldGroups = Record<string, ShieldMembers>
type ShieldScopes = Record<string, ShieldGroups>

export function usePlayerShield() {
  const scopes = useState<ShieldScopes>('player-shield:scopes', () => ({}))
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
      if (stored?.scopes && typeof stored.scopes === 'object') {
        scopes.value = stored.scopes
      }
    } catch {
      // Keep the in-memory preferences if storage is unavailable or invalid.
    }
    restored.value = true
  })

  function save() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ scopes: scopes.value, legacy: legacy.value }))
    } catch {
      // The selection still applies in memory.
    }
  }

  function getGroups(scope: string) {
    return Object.hasOwn(scopes.value, scope) ? scopes.value[scope] : undefined
  }

  function isShielded(scope: string, group: string, member: string) {
    return getGroups(scope)?.[group]?.[member] === true
  }

  function writeGroup(scope: string, group: string, members: ShieldMembers) {
    const next = { ...getGroups(scope) }
    if (Object.values(members).includes(true)) next[group] = members
    else delete next[group]
    scopes.value = { ...scopes.value, [scope]: next }
    save()
  }

  function reconcile(scope: string, group: string, member: string, roster: string[], legacyAlias?: string) {
    if (!restored.value) return

    const previous = getGroups(scope)?.[group]
    const remembered = legacyAlias !== undefined && legacy.value.includes(legacyAlias)
    if (!previous && !remembered) return

    const added = roster.filter(key => !Object.hasOwn(previous ?? {}, key))
    if (added.length === 0 && !remembered) return

    const next = { ...previous }
    const missing = Object.keys(next).filter(key => !roster.includes(key))
    // Reuse a preference on a path change only when one old path and one new path in this event can be paired.
    const [oldKey] = missing
    const [newKey] = added
    if (missing.length === 1 && added.length === 1 && oldKey && newKey) {
      next[newKey] = next[oldKey] === true
      delete next[oldKey]
    }
    for (const key of added) next[key] ??= false
    if (remembered) {
      next[member] = true
      legacy.value = legacy.value.filter(alias => alias !== legacyAlias)
    }
    writeGroup(scope, group, next)
  }

  function toggleShield(scope: string, group: string, member: string, roster: string[]) {
    const next = { ...getGroups(scope)?.[group] }
    for (const key of roster) next[key] ??= false
    next[member] = !isShielded(scope, group, member)
    writeGroup(scope, group, next)
  }

  return { isShielded, toggleShield, reconcile }
}
