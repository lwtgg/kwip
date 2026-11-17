import type { StreamDetail } from './useFeed'

export interface SourceOption {
  label: string
  url: string
}

/** Pure: playback chain in API.md order, `sources[]` first then `substreams[]`, empty entries dropped. */
export function usePlayerSources(stream: Pick<StreamDetail, 'sources' | 'substreams'>): SourceOption[] {
  const fromSources = (stream.sources ?? [])
    .filter((s) => s.data)
    .map((s) => ({ label: s.name, url: s.data }))
  const fromSubstreams = (stream.substreams ?? [])
    .filter((s) => s.iframe)
    .map((s) => ({ label: s.name, url: s.iframe }))
  return [...fromSources, ...fromSubstreams]
}
