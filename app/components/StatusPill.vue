<script setup lang="ts">
import { endedLabel, formatRelative, kickoffDelayed, windowLabel } from '~/composables/useEventWindow'

const props = defineProps<{
  startsAt: number
  endsAt: number
  alwaysLive?: number
  now?: number
  stale?: boolean
  matchState?: 'pre' | 'in' | 'post'
  /** Lane form: no chip and a short fixed-width text; the accessible label keeps the full wording. */
  quiet?: boolean
}>()
const initialNow = useState('status-pill-now', () => Math.floor(Date.now() / 1000))

const status = computed(() => {
  const now = props.now ?? initialNow.value
  const { startsAt, endsAt, alwaysLive, matchState } = props
  if (matchState === 'post') return { text: 'Final', aria: 'Final', state: 'final' }
  if (matchState === 'in') {
    if (props.stale) return { text: 'Listed live', aria: 'Listed live', state: 'live' }
    return { text: 'Live', aria: 'Live', state: 'live', timestamp: endsAt }
  }
  const label = windowLabel({ startsAt, endsAt, alwaysLive, now })

  if (alwaysLive === 1) return { ...label, state: 'always-live' }
  if (startsAt === 0) return { ...label, state: 'event' }
  // A `pre` match keeps Upcoming past kickoff until the provider catches up; well past it, say so.
  if (matchState === 'pre' && now >= startsAt) {
    return kickoffDelayed(matchState, startsAt, now)
      ? { text: 'Delayed', aria: 'Kickoff delayed', state: 'upcoming' }
      : { text: 'Upcoming', aria: 'Upcoming', state: 'upcoming' }
  }
  if (now < startsAt) return { ...label, state: 'upcoming', timestamp: startsAt }
  if (now < endsAt) {
    if (props.stale) return { text: 'Listed live', aria: 'Listed live', state: 'live' }
    return { ...label, state: 'live', text: 'Live', timestamp: endsAt }
  }
  return { ...endedLabel(endsAt, now), state: 'ended', timestamp: endsAt }
})

// "Upcoming in 1h 58m" becomes "In 1h 58m" and "Ended 3h ago" becomes "3h ago": the lane's
// fact already says the time or Ended, and one line keeps the lane's height across kickoff.
const shortText = computed(() => {
  const now = props.now ?? initialNow.value
  if (status.value.state === 'upcoming') {
    if (props.matchState === 'pre' && now >= props.startsAt) {
      return kickoffDelayed(props.matchState, props.startsAt, now) ? 'Delayed' : 'Upcoming'
    }
    return `In ${formatRelative(props.startsAt - now)}`
  }
  if (status.value.state === 'ended' && now > props.endsAt) return `${formatRelative(now - props.endsAt)} ago`
  return status.value.text
})
const text = computed(() => props.quiet ? shortText.value : status.value.text)

const statusTime = computed(() => {
  const timestamp = status.value.timestamp
  return timestamp && Number.isFinite(timestamp) ? new Date(timestamp * 1000) : undefined
})

const accessibleTime = computed(() => {
  if (!statusTime.value) return status.value.aria

  const action = status.value.state === 'upcoming' ? 'Starts' : status.value.state === 'live' ? 'Ends' : 'Ended'
  return `${status.value.aria}. ${action} ${statusTime.value.toUTCString()}`
})
</script>

<template>
  <span
    class="inline-flex flex-wrap items-center gap-x-1 text-metadata tabular-nums"
    :class="quiet ? 'text-muted' : 'rounded-control bg-surface-2 px-2.5 py-0.5 font-semibold text-fg'"
  >
    <!-- The clock moves between the server render and hydration. -->
    <time v-if="statusTime" :datetime="statusTime.toISOString()" :aria-label="accessibleTime" data-allow-mismatch="text attribute">{{ text }}</time>
    <span v-else :aria-label="status.aria" data-allow-mismatch="text attribute">{{ text }}</span>
    <span v-if="stale" class="text-muted">· Unconfirmed</span>
  </span>
</template>
