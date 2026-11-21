export interface SnapshotSourceHealth {
  embedOk: boolean
  manifestOk: boolean
  sequence: 'advancing' | 'frozen' | 'unknown'
  checkedAt: string
  segmentMs?: number
  error?: string
}

export type SnapshotHealth = Record<string, SnapshotSourceHealth>
