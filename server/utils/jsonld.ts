import type { FeedStreamItem } from '../../app/composables/useFeed'

export interface SportsEventLd {
  '@context': 'https://schema.org'
  '@type': 'SportsEvent'
  name: string
  url: string
  startDate: string
  endDate: string
  eventStatus: string
  eventAttendanceMode: string
  location: { '@type': 'VirtualLocation'; url: string }
  competitor: { '@type': 'SportsTeam'; name: string }[]
  sport?: string
  image?: string
}

const toIso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString()

// "Home vs. Away", "Home vs Away", "Away @ Home" → two teams; anything else → none.
function competitorsFrom(name: string): string[] {
  const parts = name.split(/\s+(?:vs\.?|v\.?|@)\s+/i).map((p) => p.trim()).filter(Boolean)
  return parts.length === 2 ? parts : []
}

/**
 * Pure: safe to import from pages (Agent A) and server routes alike.
 * `canonicalUrl` is the absolute canonical URL of the player page (rule 13).
 */
export function sportsEventLd(stream: FeedStreamItem, canonicalUrl: string): SportsEventLd {
  const ld: SportsEventLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: stream.name,
    url: canonicalUrl,
    startDate: toIso(stream.starts_at),
    endDate: toIso(stream.ends_at),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: canonicalUrl },
    competitor: competitorsFrom(stream.name).map((name) => ({ '@type': 'SportsTeam', name })),
  }
  if (stream.category_name) ld.sport = stream.category_name
  if (stream.poster && /^https?:\/\//.test(stream.poster)) ld.image = stream.poster
  return ld
}
