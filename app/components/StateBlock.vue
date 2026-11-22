<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant: 'skeleton' | 'empty' | 'error' | 'stale' | 'not-found'
  rows?: number
  message?: string
  showCurrentEvents?: boolean
}>(), {
  rows: 4,
  message: '',
})

const emit = defineEmits<{ retry: [] }>()
const skeletonCount = computed(() => Math.max(1, props.rows))
</script>

<template>
  <div
    v-if="variant === 'skeleton'"
    aria-busy="true"
    aria-label="Loading events"
    class="fixture-list"
  >
    <div v-for="idx in skeletonCount" :key="idx" class="fixture-row" aria-hidden="true">
      <div class="h-3 w-8 rounded-control bg-surface-2" />
      <div class="h-4 w-2/3 rounded-control bg-surface-2" />
    </div>
  </div>

  <div
    v-else-if="variant === 'stale'"
    role="status"
    class="flex flex-wrap items-center justify-between gap-x-3 rounded-card bg-surface-2 px-4 text-metadata text-muted"
  >
    <span>{{ message || 'Listings may be out of date. The last update was more than 20 minutes ago.' }}</span>
    <button
      type="button"
      class="min-h-target rounded-control px-2 font-medium text-fg underline hover:decoration-muted"
      @click="emit('retry')"
    >
      Refresh
    </button>
  </div>

  <div
    v-else
    :role="variant === 'error' ? 'alert' : 'status'"
    class="flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface p-4 sm:p-6"
  >
    <div v-if="variant === 'error'" class="space-y-1">
      <p class="font-semibold text-fg">Unable to load the event directory</p>
      <p class="text-sm text-muted">Current listings are unavailable. Try again in a moment.</p>
    </div>
    <p v-else class="text-sm text-muted">
      {{ message || (variant === 'not-found' ? 'That event is no longer listed.' : 'No events match this view right now.') }}
    </p>
    <button
      v-if="variant === 'error'"
      type="button"
      class="min-h-target rounded-control bg-accent px-4 text-sm font-semibold text-accent-fg hover:underline"
      @click="emit('retry')"
    >
      Retry
    </button>
    <NuxtLink
      v-else-if="showCurrentEvents || variant === 'not-found'"
      to="/"
      class="inline-flex min-h-target items-center gap-1 rounded-control bg-accent px-4 text-sm font-semibold text-accent-fg hover:underline"
    >
      Current events <span aria-hidden="true">→</span>
    </NuxtLink>
  </div>
</template>
