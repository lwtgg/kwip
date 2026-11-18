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

const datetime = computed(() => {
  const timestamp = status.value.timestamp
  return timestamp && Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : undefined
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide"
    :class="{
      'bg-live text-white shadow-sm': status.state === 'live',
      'bg-surface-2 text-fg': status.state === 'always-live' || status.state === 'event' || status.state === 'upcoming',
      'bg-surface-2 text-muted': status.state === 'ended',
      'uppercase': status.state === 'live' || status.state === 'event',
    }"
  >
    <span v-if="status.state === 'live'" aria-hidden="true" class="relative flex h-2 w-2">
      <span class="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
      <span class="relative inline-flex h-2 w-2 rounded-full bg-white" />
    </span>
    <time v-if="datetime" :datetime="datetime" :aria-label="status.aria">{{ status.text }}</time>
    <span v-else :aria-label="status.aria">{{ status.text }}</span>
  </span>
</template>
