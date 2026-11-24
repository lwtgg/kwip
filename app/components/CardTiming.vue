<script setup lang="ts">
const props = defineProps<{
  startsAt: number
  endsAt: number
  alwaysLive?: number
  now?: number
  stale?: boolean
  replay?: boolean
  eventDate?: string
}>()
const initialNow = useState('ui:card-now', () => Math.floor(Date.now() / 1000))
const start = computed(() => {
  const date = new Date(props.startsAt * 1000)
  return Number.isFinite(props.startsAt) && props.startsAt > 0 && !Number.isNaN(date.getTime()) ? date : null
})
const scheduled = computed(() => start.value !== null && Number.isFinite(props.endsAt)
  && props.endsAt > props.startsAt && !Number.isNaN(new Date(props.endsAt * 1000).getTime()))
const ended = computed(() => scheduled.value && (props.now ?? initialNow.value) >= props.endsAt)
const started = computed(() => scheduled.value && (props.now ?? initialNow.value) >= props.startsAt && !ended.value)
const channel = computed(() => props.alwaysLive === 1)
const numeric = computed(() => !props.stale && !props.replay && !channel.value && start.value && !ended.value)
const kickoff = computed(() => start.value?.toLocaleTimeString('en-GB', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}))
const fact = computed(() => {
  if (props.stale) return 'Unconfirmed'
  if (props.replay) return 'Replay'
  if (channel.value) return '24/7'
  if (!start.value) return 'Time unavailable'
  if (ended.value) return 'Ended'
  return kickoff.value
})
const dateLabel = computed(() => start.value?.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }))
// One short line above the fact. Its length never changes the lane's height at kickoff or full time.
const caption = computed(() => {
  if (props.stale) return ''
  if (props.replay) return props.eventDate ? `${props.eventDate} · UTC` : ''
  if (channel.value || !dateLabel.value) return ''
  if (started.value) return 'Started at'
  if (ended.value) return `${dateLabel.value} · UTC`
  return dateLabel.value
})
const listedTime = computed(() => {
  if (props.replay) return 'Replay'
  if (channel.value) return '24/7'
  return kickoff.value ?? 'Time unavailable'
})
const schedule = computed(() => !props.stale && !props.replay && scheduled.value && !channel.value)
</script>

<template>
  <div class="card-lane" data-allow-mismatch="text children">
    <span v-if="caption" :aria-label="caption" class="card-lane-note card-lane-caption text-metadata text-muted">{{ replay ? eventDate : caption }}</span>
    <div class="card-fact">
      <template v-if="numeric && start">
        <time :datetime="start.toISOString()" class="card-time text-fg">{{ fact }}</time>
        <span class="text-metadata text-muted">UTC</span>
      </template>
      <span v-else class="card-state text-fg">{{ fact }}</span>
    </div>
    <span v-if="schedule" class="card-lane-note text-metadata">
      <StatusPill quiet :starts-at="startsAt" :ends-at="endsAt" :always-live="alwaysLive" :now="now" />
    </span>
    <span v-if="!stale && !replay && start && !scheduled && !channel" class="card-lane-note text-metadata text-muted" aria-label="Availability unconfirmed">Unconfirmed</span>
    <span v-if="stale" :aria-label="`Last listed: ${listedTime}`" class="card-lane-note text-metadata text-muted">{{ kickoff || channel || replay ? `Last listed: ${listedTime}` : 'No time listed' }}</span>
    <!-- The bar is placed on the row's bottom edge, out of the lane's flow (theme.css). -->
    <div v-if="schedule" class="card-lane-bar h-1">
      <LiveProgress v-if="started && now !== undefined"
        :starts-at="startsAt" :ends-at="endsAt" :always-live="alwaysLive" :now="now" />
    </div>
  </div>
</template>
