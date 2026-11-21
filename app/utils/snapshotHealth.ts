export interface SnapshotSourceHealth {
  embedOk: boolean
  manifestOk: boolean
  sequence: 'advancing' | 'frozen' | 'unknown'
  checkedAt: string
  segmentMs?: number
  error?: string
}

export type SnapshotHealth = Record<string, SnapshotSourceHealth>

// Allow two scheduled publication intervals before an observation becomes unknown.
export const SNAPSHOT_HEALTH_MAX_AGE_MS = 30 * 60 * 1000

export function isFreshSnapshotHealth(entry: SnapshotSourceHealth, now = Date.now()) {
  const age = now - Date.parse(entry.checkedAt)
  return age >= 0 && age < SNAPSHOT_HEALTH_MAX_AGE_MS
}
