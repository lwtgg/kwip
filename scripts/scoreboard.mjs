// Verified against ESPN's public scoreboards; only leagues carried by our feed.
export const leaguePaths = Object.freeze({
  NFL: 'football/nfl', 'College Football': 'football/college-football',
  NBA: 'basketball/nba', 'College Basketball': 'basketball/mens-college-basketball',
  'Champions League': 'soccer/uefa.champions', 'Europa League': 'soccer/uefa.europa',
  'Conference League': 'soccer/uefa.europa.conf', 'Premier League': 'soccer/eng.1',
  LaLiga: 'soccer/esp.1', 'Serie A': 'soccer/ita.1', Bundesliga: 'soccer/ger.1',
  'Ligue 1': 'soccer/fra.1', Eredivisie: 'soccer/ned.1', MLS: 'soccer/usa.1',
  Allsvenskan: 'soccer/swe.1', NHL: 'hockey/nhl',
})

export function normalizeTeam(name, soccer = false) {
  let value = String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (soccer) value = value.replace(/^(?:fc|afc|cf) /, '').replace(/ fc$/, '').trim()
  return value
}

export function scoreboardEligible(item) {
  return item.always_live === 0 && Object.hasOwn(leaguePaths, item.tag)
    && typeof item.name === 'string' && item.name.split(/ vs\. | vs | at /).length === 2
}

function eventTime(item) {
  return Number(item.starts_at) > 0 ? Number(item.starts_at) * 1000 : Date.parse(item.date ?? item.event_date)
}

function side(competitor, fallback, state) {
  const team = competitor.team ?? {}
  const color = typeof team.color === 'string' && /^#?[0-9a-f]{6}$/i.test(team.color)
    ? '#' + team.color.replace(/^#/, '').toLowerCase() : null
  const logo = typeof team.logo === 'string' && URL.parse(team.logo)?.protocol === 'https:' ? team.logo : null
  const score = typeof competitor.score === 'string' && /^\d+$/.test(competitor.score)
    ? Number(competitor.score) : competitor.score
  return {
    name: typeof team.displayName === 'string' && team.displayName ? team.displayName : fallback,
    abbreviation: typeof team.abbreviation === 'string' ? team.abbreviation.slice(0, 5) : '',
    color, logo, score: state !== 'pre' && Number.isInteger(score) && score >= 0 && score <= 999 ? score : null,
  }
}

function matchValue(competition, away, home, names) {
  const status = competition.status
  const state = status?.type?.state
  if (!['pre', 'in', 'post'].includes(state)) return
  const description = status.type.description ?? ''
  const regulation = competition.periodLabel === 'H' ? 2 : competition.periodLabel === 'P' ? 3 : 4
  const overtime = Number(status.period) - regulation
  const period = overtime > 0 ? (overtime > 1 ? overtime : '') + 'OT' : competition.periodLabel + status.period
  const detail = state === 'post' ? 'Final' : state === 'pre' ? ''
    : /halftime/i.test(description) ? 'Halftime'
      : status.period && status.displayClock && !['0:00', '0'].includes(status.displayClock)
        ? `${competition.periodLabel ? period + ' ' : ''}${status.displayClock}` : description
  const result = { state, detail: String(detail).slice(0, 24),
    away: side(away, names[0], state), home: side(home, names[1], state) }
  if (result.away.name.length > 60 || result.home.name.length > 60) return
  return result
}

// Mutates eligible items only. A failed league is deliberately indistinguishable from no match.
export async function enrichScoreboards(items, { deadline = performance.now() + 8000, fetcher = fetch,
  maxRequests = Infinity, onRequest = () => {} } = {}) {
  const groups = new Map()
  for (const item of items) {
    if (!scoreboardEligible(item)) continue
    delete item.match
    if (!groups.has(item.tag)) groups.set(item.tag, [])
    groups.get(item.tag).push(item)
  }
  const summary = { leagues: groups.size, requests: 0, matched: 0, unmatched: 0 }
  const queue = [...groups]
  async function worker() {
    while (queue.length && performance.now() < deadline && summary.requests < maxRequests) {
      const [tag, events] = queue.shift()
      const soccer = leaguePaths[tag].startsWith('soccer/')
      let payload
      try {
        summary.requests++
        onRequest()
        const response = await fetcher(`https://site.api.espn.com/apis/site/v2/sports/${leaguePaths[tag]}/scoreboard`, {
          signal: AbortSignal.timeout(Math.max(1, Math.ceil(deadline - performance.now()))), redirect: 'error',
        })
        if (response.status !== 200) { await response.body?.cancel(); continue }
        payload = await response.json()
      } catch { continue }
      if (!Array.isArray(payload?.events) || performance.now() >= deadline) continue
      const candidates = []
      for (const providerEvent of payload.events) {
        if (!providerEvent || !Array.isArray(providerEvent.competitions)) continue
        for (const [index, raw] of providerEvent.competitions.entries()) {
          if (!raw || typeof raw !== 'object') continue
          const competitors = raw.competitors
          if (!Array.isArray(competitors) || competitors.length !== 2) continue
          const away = competitors.find(side => side?.homeAway === 'away')
          const home = competitors.find(side => side?.homeAway === 'home')
          if (!away || !home) continue
          const aliases = competitor => [competitor.team?.displayName, competitor.team?.shortDisplayName,
            competitor.team?.name].filter(name => typeof name === 'string' && name).map(name => normalizeTeam(name, soccer))
          const awayNames = aliases(away), homeNames = aliases(home)
          const date = Date.parse(raw.date ?? providerEvent.date)
          for (const event of events) {
            const names = event.name.split(/ vs\. | vs | at /)
            const normalized = names.map(name => normalizeTeam(name, soccer))
            const direct = awayNames.includes(normalized[0]) && homeNames.includes(normalized[1])
            const reverse = homeNames.includes(normalized[0]) && awayNames.includes(normalized[1])
            const distance = Math.abs(eventTime(event) - date)
            if ((!direct && !reverse) || distance > 36 * 3600_000 || !Number.isFinite(distance)) continue
            const match = matchValue({ ...raw, status: raw.status ?? providerEvent.status,
              periodLabel: soccer ? '' : tag === 'NHL' ? 'P' : tag === 'College Basketball' ? 'H' : 'Q' }, away, home,
              reverse ? [names[1], names[0]] : names)
            if (match) candidates.push({ event, key: `${providerEvent.id ?? date}:${index}`, distance, match })
          }
        }
      }
      const used = new Set()
      for (const candidate of candidates.sort((a, b) => a.distance - b.distance)) {
        if (candidate.event.match || used.has(candidate.key)) continue
        candidate.event.match = candidate.match
        used.add(candidate.key)
        summary.matched++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker))
  summary.unmatched = [...groups.values()].reduce((sum, events) => sum + events.length, 0) - summary.matched
  return summary
}
