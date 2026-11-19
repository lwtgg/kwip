import { sourceHost, sourceKey, sourceLabel } from '~/utils/sourceIdentity'
import type { SupplementSource } from '~/utils/strmfree'
import type { FeedStreamSource, FeedSourceKind } from './useFeed'

type PlayerSource = FeedStreamSource | SupplementSource

export interface SourceOption {
  label: string
  url: string
  kind: FeedSourceKind
  host: string
  key: string
  origin?: SupplementSource['origin']
  live?: boolean
}

export function usePlayerSources(stream: { sources: PlayerSource[] }): SourceOption[] {
  const uniqueSources = new Map<string, PlayerSource>()

  for (const source of stream.sources) {
    if (!source.data) continue
    const key = sourceKey(source.data)
    if (!uniqueSources.has(key)) uniqueSources.set(key, source)
  }

  const options = Array.from(uniqueSources, ([key, source], index) => ({
    label: sourceLabel(source, index),
    url: source.data,
    kind: source.type,
    host: sourceHost(source.data),
    key,
    ...('origin' in source ? { origin: source.origin, live: source.live } : {}),
  }))

  const labels = options.map(({ label }) => label.toLowerCase())
  const reserved = new Set(labels)
  const used = new Set<string>()
  return options.map((option, index) => {
    const base = labels[index]!
    if (!used.has(base)) {
      used.add(base)
      return option
    }

    let label = `${option.label} · ${index + 1}`
    while (reserved.has(label.toLowerCase())) label += ` · ${index + 1}`
    reserved.add(label.toLowerCase())
    return { ...option, label }
  })
}
