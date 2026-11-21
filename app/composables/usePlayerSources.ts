import type { SnapshotHealth } from '~/utils/snapshotHealth'
import { sourceHost, sourceKey, sourceLabel } from '~/utils/sourceIdentity'
import type { SupplementSource } from '~/utils/strmfree'
import type { FeedStreamSource, FeedSourceKind } from './useFeed'

type PlayerSource = (FeedStreamSource | SupplementSource) & {
  sourceTag?: string
  source_tag?: string
  locale?: string
  viewers?: string | number
}

export interface SourceOption {
  label: string
  url: string
  kind: FeedSourceKind
  host: string
  key: string
  origin?: SupplementSource['origin']
  live?: boolean
  degraded?: true
}

export function usePlayerSources(stream: { sources: PlayerSource[]; source_tag?: string; locale?: string }, health?: SnapshotHealth): SourceOption[] {
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
    ...(health?.[key]?.embedOk === false ? { degraded: true as const } : {}),
    ...('origin' in source ? { origin: source.origin, live: source.live } : {}),
  }))

  const labels = options.map(({ label }) => label.toLowerCase())
  const reserved = new Set(labels)
  const used = new Set<string>()
  const labelled = options.map((option, index) => {
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

  if (!labelled.some(option => option.degraded)) return labelled

  // Keep the feed's existing slots for each quality and locale, and only reorder peers.
  const peers = new Map<string, { index: number; option: SourceOption; viewers: number }[]>()
  for (const [index, option] of labelled.entries()) {
    const source = uniqueSources.get(option.key)!
    const tag = source.sourceTag ?? source.source_tag ?? ('origin' in source ? '' : stream.source_tag ?? '')
    const quality = typeof tag === 'string'
      ? /^(fhd|uhd|hd|sd|\d{3,4}p)\b/i.exec(tag.trim())?.[1]?.toLowerCase() ?? ''
      : ''
    const locale = source.locale ?? ('origin' in source ? '' : stream.locale ?? '')
    const tier = JSON.stringify([quality, typeof locale === 'string' ? locale.toLowerCase() : ''])
    if (!peers.has(tier)) peers.set(tier, [])
    peers.get(tier)!.push({ index, option, viewers: Number(source.viewers) || 0 })
  }
  const ordered: SourceOption[] = [...labelled]
  for (const group of peers.values()) {
    if (!group.some(({ option }) => option.degraded)) continue
    const ranked = [...group].sort((a, b) => Number(!!a.option.degraded) - Number(!!b.option.degraded)
      || b.viewers - a.viewers)
    group.forEach(({ index }, rank) => { ordered[index] = ranked[rank]!.option })
  }
  return ordered
}
