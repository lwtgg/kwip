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
  const live = now >= startsAt && now < endsAt
  const aria = live ? remainingLabel(endsAt, now) : label.aria
  const exactTime = new Date((live ? endsAt : startsAt) * 1000).toUTCString()
  const timing = live ? 'Ends' : now < startsAt ? 'Starts' : 'Started'
  return { percentage, live, text: label.text, aria: `${aria}. ${timing} ${exactTime}` }
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
      class="h-1 min-w-0 flex-1 overflow-hidden bg-surface-2"
      data-allow-mismatch="attribute"
    >
      <div
        class="h-full"
        :class="progress.live ? 'bg-accent' : 'bg-muted'"
        :style="{ width: `${progress.percentage}%` }"
        data-allow-mismatch="class,style"
      />
    </div>
    <span v-if="showLabel" aria-hidden="true" class="listing-numeric text-xs text-muted" data-allow-mismatch="text">{{ progress.text }}</span>
  </div>
</template>
