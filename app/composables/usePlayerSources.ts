import type { FeedStreamDetail, FeedSourceKind } from './useFeed'

export interface SourceOption {
  label: string
  url: string
  kind: FeedSourceKind
}

export function usePlayerSources(stream: Pick<FeedStreamDetail, 'sources'>): SourceOption[] {
  return stream.sources
    .filter((source) => source.data)
    .map((source) => ({ label: source.name, url: source.data, kind: source.type }))
}
