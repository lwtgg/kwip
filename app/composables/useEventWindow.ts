interface EventWindow {
  startsAt: number
  endsAt: number
  alwaysLive?: number
  now: number
}

function relativeParts(deltaSeconds: number) {
  const seconds = Math.floor(Math.abs(deltaSeconds))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return [[days, 'd', 'day']] as const
  if (hours > 0) {
    const remainder = minutes % 60
    return remainder
      ? [[hours, 'h', 'hour'], [remainder, 'm', 'minute']] as const
      : [[hours, 'h', 'hour']] as const
  }
  if (minutes > 0) return [[minutes, 'm', 'minute']] as const
  return [[seconds, 's', 'second']] as const
}

export function formatRelative(deltaSeconds: number): string {
  return relativeParts(deltaSeconds).map(([value, unit]) => `${value}${unit}`).join(' ')
}

function formatDuration(deltaSeconds: number): string {
  return relativeParts(deltaSeconds)
    .map(([value, , unit]) => `${value} ${unit}${value === 1 ? '' : 's'}`)
    .join(' ')
}

function relativeLabel(prefix: string, delta: number, suffix = '') {
  return {
    text: `${prefix}${formatRelative(delta)}${suffix}`,
    aria: `${prefix}${formatDuration(delta)}${suffix}`,
  }
}

export function windowLabel({ startsAt, endsAt, alwaysLive, now }: EventWindow) {
  if (alwaysLive === 1) return { text: '24/7', aria: 'Live 24 hours a day, 7 days a week' }
  if (startsAt === 0) return { text: 'Event', aria: 'Event' }
  if (now < startsAt) return relativeLabel('Upcoming in ', startsAt - now)
  if (now < endsAt) return relativeLabel('Ends in ', endsAt - now)
  const elapsed = now - startsAt
  return elapsed === 0
    ? { text: 'Started now', aria: 'Started now' }
    : relativeLabel('Started ', elapsed, ' ago')
}

export function endedLabel(endsAt: number, now: number) {
  if (now === endsAt) return { text: 'Ended just now', aria: 'Ended just now' }
  return relativeLabel('Ended ', now - endsAt, ' ago')
}

export function remainingLabel(endsAt: number, now: number): string {
  return `${formatDuration(endsAt - now)} remaining`
}
