import { sourceHost, sourceKey, sourceLabel } from '~/utils/sourceIdentity'
import type { FeedStreamDetail, FeedSourceKind } from './useFeed'

export interface SourceOption {
  label: string
  url: string
  kind: FeedSourceKind
  host: string
  key: string
}

export function usePlayerSources(stream: Pick<FeedStreamDetail, 'sources'>): SourceOption[] {
  const uniqueSources = new Map<string, FeedStreamDetail['sources'][number]>()

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
