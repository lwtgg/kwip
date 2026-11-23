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
function foldName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function teams(name: string): string[] {
  return foldName(name)
    .split(/(?<![\p{L}\p{N}])(?:vs|v|at)(?![\p{L}\p{N}])/u)
    .map(team => team.trim().split(/\s+/)
      .map(token => token.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(token => token && !/^(?:fc|afc|cf|sc)$/.test(token))
      .join(' '))
    .sort()
}

export function findSupplement(
  event: { name: string; starts_at: number },
  categorySlug: string,
  payload: { streams: StrmfreeStream[] },
): StrmfreeStream | undefined {
  const pair = teams(event.name)
  if (pair.length !== 2 || !pair[0] || !pair[1]) return

  const candidates = payload.streams.filter((stream) => {
    if (!(Math.abs(stream.match_timestamp - event.starts_at) <= 3 * 3600)) return false
    const other = teams(stream.name)
    return other.length === 2 && other[0] === pair[0] && other[1] === pair[1]
  })
  const tied = candidates.length > 1
    ? candidates.filter(stream => categories.get(stream.category) === categorySlug)
    : candidates
  return tied.length === 1 ? tied[0] : undefined
}

export function slugifyCategory(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
const channelSuffix = /(?:\s+(?:fhd|hd|uhd|sd|4k|uk|us|usa|gb|backup(?: \d+)?|if .+ lags?))+$/u
const backupLabel = /\b(?:backup(?: \d+)?|if .+ lags?)\b/u

function foldChannelName(name: string) {
  return foldName(name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function channelName(name: string) {
  return foldChannelName(name).replace(channelSuffix, '')
}

export function isChannelBackup(name: string) {
  return backupLabel.test(foldChannelName(name).match(channelSuffix)?.[0] ?? '')
}
