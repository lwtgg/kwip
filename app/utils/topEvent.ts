import { parseSourceUrl, sourceHost, sourceKey } from './sourceIdentity.ts'

type Source = { type: string; data: string }
type SourceList = { iframe?: string; sources?: Source[] }
export type EventSources = SourceList & { hero_embed?: string; substreams?: SourceList[] }
type Event = EventSources & { viewers: string; starts_at: number }

export function isZliveEmbed(url: string): boolean {
  return sourceHost(url) === 'zlive.st' && /^zlive\.st\/embed\/[^/]+$/.test(sourceKey(url))
}

export function resolveHeroEmbed(item: EventSources, detail?: EventSources): string | undefined {
  function embeds({ iframe, sources, substreams }: EventSources) {
    return [
      iframe,
      ...sources?.filter(source => source.type === 'iframe').map(source => source.data) ?? [],
      ...substreams?.flatMap(substream => [
        substream.iframe,
        ...substream.sources?.filter(source => source.type === 'iframe').map(source => source.data) ?? [],
      ]) ?? [],
    ]
  }
  const urls = [item.hero_embed, ...embeds(item), ...(detail ? embeds(detail) : [])]
    .flatMap(value => {
      if (!value) return []
      const url = parseSourceUrl(value)
      return url && (url.protocol === 'https:' || url.protocol === 'http:') ? [url.href] : []
    })
  return urls.find(isZliveEmbed) ?? urls[0]
}

export function viewerCount(stream: Event): number {
  const viewers = Number.parseInt(String(stream.viewers), 10)
  return Number.isFinite(viewers) ? viewers : 0
}

export function selectTopEvent<T extends Event>(
  live: readonly T[], alwaysLive: readonly T[], upcoming: readonly T[],
  all: readonly T[], filter: 'all' | 'live' | 'upcoming',
): { stream: T; mode: 'live' | 'upcoming' | 'archive' } | null {
  if (filter !== 'upcoming') {
    const ranked = [...live].sort((a, b) => viewerCount(b) - viewerCount(a))
    const stream = ranked.find(event => isZliveEmbed(resolveHeroEmbed(event) ?? '')) ?? ranked[0] ?? alwaysLive[0]
    if (stream) return { stream, mode: 'live' }
  }
  if (filter !== 'live' && upcoming.length) {
    const stream = upcoming.reduce((first, event) => {
      const precedes = filter === 'upcoming'
        ? viewerCount(event) > viewerCount(first)
        : event.starts_at < first.starts_at
      return precedes ? event : first
    })
    return { stream, mode: 'upcoming' }
  }
  if (filter !== 'all' || !all.length) return null
  return { stream: all.reduce((first, event) => viewerCount(event) > viewerCount(first) ? event : first), mode: 'archive' }
}

export function heroFrameUrl(source: string, live: boolean, sound: boolean): string {
  if (!isZliveEmbed(source)) return source
  const url = new URL(source)
  if (sound) url.searchParams.delete('muted')
  else url.searchParams.set('muted', '1')
  if (!live) url.searchParams.set('autoplay', '0')
  else if (/^(0|false|off|no)$/i.test(url.searchParams.get('autoplay') ?? '')) {
    url.searchParams.set('autoplay', '1')
  }
  return url.href
}

export function canMountHeroFrame(inViewport: boolean, visible: boolean, autoplay: boolean, saveData: boolean): boolean {
  return inViewport && visible && !(autoplay && saveData)
}
