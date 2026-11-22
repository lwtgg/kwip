<script setup lang="ts">
import { endedLabel, windowLabel } from '~/composables/useEventWindow'

const props = defineProps<{
  startsAt: number
  endsAt: number
  alwaysLive?: number
  now?: number
}>()
const initialNow = useState('status-pill-now', () => Math.floor(Date.now() / 1000))

const status = computed(() => {
  const now = props.now ?? initialNow.value
  const { startsAt, endsAt, alwaysLive } = props
  const label = windowLabel({ startsAt, endsAt, alwaysLive, now })

  if (alwaysLive === 1) return { ...label, state: 'always-live' }
  if (startsAt === 0) return { ...label, state: 'event' }
  if (now < startsAt) return { ...label, state: 'upcoming', timestamp: startsAt }
  if (now < endsAt) return { ...label, state: 'live', text: 'Live', timestamp: endsAt }
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
  <span
    class="listing-numeric inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-metadata font-semibold tracking-wide"
    :class="{
      'bg-live text-live-fg': status.state === 'live',
      'bg-surface-2 text-fg': status.state === 'always-live' || status.state === 'event' || status.state === 'upcoming',
      'bg-surface-2 text-muted': status.state === 'ended',
      'uppercase': status.state === 'live' || status.state === 'event',
    }"
  >
    <span v-if="status.state === 'live'" aria-hidden="true">●</span>
    <!-- The clock moves between the server render and hydration. -->
    <time v-if="statusTime" :datetime="statusTime.toISOString()" :aria-label="accessibleTime" data-allow-mismatch="text attribute">{{ status.text }}</time>
    <span v-else :aria-label="status.aria" data-allow-mismatch="text attribute">{{ status.text }}</span>
  </span>
</template>
