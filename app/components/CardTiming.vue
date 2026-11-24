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
const numeric = computed(() => !props.stale && !props.replay && (props.alwaysLive === 1 || (start.value && !ended.value)))
const kickoff = computed(() => start.value?.toLocaleTimeString('en-GB', {
  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}))
const fact = computed(() => {
  if (props.stale) return 'Unconfirmed'
  if (props.replay) return 'Replay'
  if (props.alwaysLive === 1) return '24/7'
  if (!start.value) return 'Time unavailable'
  if (ended.value) return 'Ended'
  return kickoff.value
})
const dateLabel = computed(() => start.value?.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }))
const listedTime = computed(() => {
  if (props.replay) return 'Replay'
  if (props.alwaysLive === 1) return '24/7'
  return kickoff.value ?? 'Time unavailable'
})
</script>

<template>
  <div class="flex min-w-0 flex-col gap-(--card-gap)" data-allow-mismatch="text children">
    <time v-if="numeric && alwaysLive !== 1 && start" :datetime="start.toISOString()" class="card-time text-fg">{{ fact }}</time>
    <span v-else :class="numeric ? 'card-time' : 'card-state'" class="text-fg">{{ fact }}</span>
    <div class="flex min-w-0 flex-col items-start gap-(--card-gap) text-metadata text-muted wrap-anywhere">
      <span v-if="stale">Last listed: {{ listedTime }}</span>
      <span v-if="replay && eventDate">{{ eventDate }} · UTC</span>
      <span v-else-if="alwaysLive !== 1 && dateLabel">{{ started && !stale ? 'Started at · ' : '' }}{{ dateLabel }} · UTC</span>
      <StatusPill v-if="!stale && !replay && scheduled && alwaysLive !== 1"
        :starts-at="startsAt" :ends-at="endsAt" :always-live="alwaysLive" :now="now" />
      <span v-if="!stale && !replay && start && !scheduled && alwaysLive !== 1">Availability unconfirmed</span>
      <span v-if="stale">Listings may be out of date</span>
    </div>
    <!-- Reserve the schedule bar before kickoff and after the window closes. -->
    <div v-if="!stale && !replay && scheduled && alwaysLive !== 1" class="h-1">
      <LiveProgress v-if="started && now !== undefined"
        :starts-at="startsAt" :ends-at="endsAt" :always-live="alwaysLive" :now="now" />
    </div>
  </div>
</template>
