const sessionKey = 'ads:click-under'

type EventWindow = { always_live?: number; starts_at: number; ends_at: number }
type ClickSession = Pick<Storage, 'getItem' | 'setItem'>

export function isClickUnderEligible(event: EventWindow | null | undefined, now: number): boolean {
  return !!event && event.always_live !== 1 && event.starts_at > 0 &&
    event.ends_at > event.starts_at && event.ends_at > now
}

export function canClickUnder(enabled: boolean, session: ClickSession | null, eligible: boolean, alreadySelected = false): boolean {
  if (!enabled || !eligible || alreadySelected || !session) return false
  try {
    return session.getItem(sessionKey) === null
  } catch {
    return false
  }
}

export function openClickUnder(
  session: ClickSession,
  placement: 'source' | 'play',
  open: (url: string, target: string, features: string) => unknown,
): boolean {
  if (!canClickUnder(true, session, true)) return false
  try {
    session.setItem(sessionKey, '1')
  } catch {
    return false
  }
  try {
    open(`/go/${placement}`, '_blank', 'noopener,noreferrer')
  } catch {
    // The source action continues even when the browser rejects the attempt.
  }
  return true
}
