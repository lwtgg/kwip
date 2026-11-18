<script setup lang="ts">
import { remainingLabel, windowLabel } from '~/composables/useEventWindow'

const props = defineProps<{
  startsAt: number
  endsAt: number
  alwaysLive?: number
  now: number
  showLabel?: boolean
}>()

const progress = computed(() => {
  const { alwaysLive, startsAt, endsAt, now } = props
  if (alwaysLive === 1 || !startsAt || !(endsAt > startsAt)) return null

  const percentage = Math.min(100, Math.max(0, (now - startsAt) / (endsAt - startsAt) * 100))
  const label = windowLabel(props)
  const aria = now >= startsAt && now < endsAt ? remainingLabel(endsAt, now) : label.aria
  return { percentage, text: label.text, aria }
})
</script>

<template>
  <div v-if="progress" class="flex w-full items-center gap-2">
    <div
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress.percentage)"
      :aria-label="progress.aria"
      class="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
    >
      <div class="h-full rounded-full bg-live" :style="{ width: `${progress.percentage}%` }" />
    </div>
    <span v-if="showLabel" aria-hidden="true" class="text-xs text-muted">{{ progress.text }}</span>
  </div>
</template>
