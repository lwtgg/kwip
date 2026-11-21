import type { SnapshotHealth } from '~/utils/snapshotHealth'
import { sourceHost, sourceKey, sourceLabel } from '../utils/sourceIdentity.ts'
import { sourceQualityBand, type SupplementSource } from '../utils/strmfree.ts'
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

export function usePlayerSources(stream: { sources: PlayerSource[]; source_tag?: string; locale?: string; hasPublishedSupplement?: boolean }, health?: SnapshotHealth): SourceOption[] {
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
    ...((!source.origin || stream.hasPublishedSupplement) && health?.[key]?.embedOk === false ? { degraded: true as const } : {}),
    ...(source.origin === 'supplement' ? { origin: source.origin, live: source.live } : {}),
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

  const needsRanking = (option: SourceOption) => option.degraded || option.live === false
  if (!labelled.some(needsRanking)) return labelled

  // Sort only within contiguous runs of known quality and matching locale.
  const ranked = labelled.map((option, index) => {
    const source = uniqueSources.get(option.key)!
    const tag = source.sourceTag ?? source.source_tag ?? (source.default && !source.origin ? stream.source_tag : undefined)
    const quality = sourceQualityBand(tag)
    const locale = source.locale ?? (source.origin ? undefined : stream.locale)
    return {
      option,
      tier: quality ? JSON.stringify([quality, typeof locale === 'string' ? locale.trim().toLowerCase() : '']) : index,
      viewers: Number(source.viewers) || 0,
    }
  })
  const ordered: SourceOption[] = []
  for (let start = 0; start < ranked.length;) {
    let end = start + 1
    while (end < ranked.length && ranked[end]!.tier === ranked[start]!.tier) end++
    const group = ranked.slice(start, end)
    if (group.some(({ option }) => needsRanking(option))) {
      group.sort((a, b) =>
        Number(!!a.option.degraded) - Number(!!b.option.degraded)
        || Number(a.option.live === false) - Number(b.option.live === false)
        || b.viewers - a.viewers,
      )
    }
    ordered.push(...group.map(({ option }) => option))
    start = end
  }
  return ordered
}
