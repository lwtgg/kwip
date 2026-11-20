const sessionKey = 'ads:click-under'

type EventWindow = { always_live?: number; starts_at: number; ends_at: number }
type ClickSession = Pick<Storage, 'getItem' | 'setItem'>
type Popup = Pick<Window, 'opener' | 'close'> & { location: Pick<Location, 'replace'> }

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
  open: (url: string, target: string) => Popup | null,
): boolean {
  if (!canClickUnder(true, session, true)) return false
  let popup: Popup | null = null
  try {
    popup = open('about:blank', '_blank')
    if (!popup) return false
    // Disconnect the opener before any third-party content can load.
    popup.opener = null
    session.setItem(sessionKey, '1')
    // The redirect sets Referrer-Policy: no-referrer for the outbound request.
    popup.location.replace(`/go/${placement}`)
  } catch {
    try {
      popup?.close()
    } catch {
      // Cleanup must leave the original source action available.
    }
    return false
  }
  return true
}
