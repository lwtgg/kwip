export interface StrmfreeStream {
  name: string
  category: string
  match_timestamp: number
  stream_key?: string
  iframe?: string
  additional_sources?: { url: string; quality?: string }[]
}

const categories = new Map([
  ['basketball', 'basketball'],
  ['football', 'american-football'],
  ['soccer', 'football'],
  ['hockey', 'hockey'],
  ['tennis', 'tennis'],
  ['cricket', 'cricket'],
  ['racing', 'motorsport'],
  ['combat', 'boxing'],
])
function teams(name: string): string[] {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .split(/(?<![\p{L}\p{N}])(?:vs|v|at)(?![\p{L}\p{N}])/u)
    .map(team => team.trim().split(/\s+/)
      .map(token => token.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(token => token && !/^(?:fc|afc|cf|sc)$/.test(token))
      .join(' '))
    .sort()
}

type SupplementEvent = { name: string; starts_at: number }
type SupplementListing = { streams: StrmfreeStream[] }

function* matchingStreams(event: SupplementEvent, payload: SupplementListing) {
  const pair = teams(event.name)
  if (pair.length !== 2 || !pair[0] || !pair[1]) return

  for (const stream of payload.streams) {
    if (!(Math.abs(stream.match_timestamp - event.starts_at) <= 3 * 3600)) continue
    const other = teams(stream.name)
    if (other.length === 2 && other[0] === pair[0] && other[1] === pair[1]) yield stream
  }
}

export function hasSupplementCandidate(event: SupplementEvent, payload: SupplementListing): boolean {
  return matchingStreams(event, payload).next().done === false
}

export function findSupplement(
  event: SupplementEvent,
  categorySlug: string,
  payload: SupplementListing,
): StrmfreeStream | undefined {
  const candidates = [...matchingStreams(event, payload)]
  const tied = candidates.length > 1
    ? candidates.filter(stream => categories.get(stream.category) === categorySlug)
    : candidates
  return tied.length === 1 ? tied[0] : undefined
}

export function slugifyCategory(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
