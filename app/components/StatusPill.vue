<script setup lang="ts">
import { endedLabel, windowLabel } from '~/composables/useEventWindow'

const props = defineProps<{
  startsAt: number
  endsAt: number
  alwaysLive?: number
  now?: number
  stale?: boolean
}>()
const initialNow = useState('status-pill-now', () => Math.floor(Date.now() / 1000))

const status = computed(() => {
  const now = props.now ?? initialNow.value
  const { startsAt, endsAt, alwaysLive } = props
  const label = windowLabel({ startsAt, endsAt, alwaysLive, now })

  if (alwaysLive === 1) return { ...label, state: 'always-live' }
  if (startsAt === 0) return { ...label, state: 'event' }
  if (now < startsAt) return { ...label, state: 'upcoming', timestamp: startsAt }
  if (now < endsAt) return { ...label, state: 'live', text: props.stale ? 'Listed live' : 'Live', timestamp: endsAt }
  return { ...endedLabel(endsAt, now), state: 'ended', timestamp: endsAt }
})

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
  <span class="text-metadata font-medium text-muted tabular-nums">
    <!-- The clock moves between the server render and hydration. -->
    <time v-if="statusTime" :datetime="statusTime.toISOString()" :aria-label="accessibleTime" data-allow-mismatch="text attribute">{{ status.text }}</time>
    <span v-else :aria-label="status.aria" data-allow-mismatch="text attribute">{{ status.text }}</span>
    <span v-if="stale" class="block">Unconfirmed</span>
  </span>
</template>
