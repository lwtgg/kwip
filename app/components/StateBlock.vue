<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant: 'skeleton' | 'empty' | 'error' | 'stale'
    rows?: number
    message?: string
  }>(),
  {
    rows: 4,
    message: '',
  },
)

const emit = defineEmits<{
  retry: []
}>()

const skeletonCount = computed(() => Math.max(1, props.rows))
</script>

<template>
  <div
    v-if="variant === 'skeleton'"
    aria-busy="true"
    aria-label="Loading events"
    class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
  >
    <div
      v-for="idx in skeletonCount"
      :key="idx"
      class="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
    >
      <div class="aspect-video w-full bg-surface-2 motion-safe:animate-pulse" />
      <div class="space-y-2.5 p-3.5">
        <div class="h-3.5 w-20 rounded bg-surface-2 motion-safe:animate-pulse" />
        <div class="h-4 w-4/5 rounded bg-surface-2 motion-safe:animate-pulse" />
        <div class="h-4 w-3/5 rounded bg-surface-2 motion-safe:animate-pulse" />
      </div>
    </div>
  </div>

  <div
    v-else-if="variant === 'stale'"
    role="status"
    class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-2 text-xs text-muted"
  >
    <span class="flex items-center gap-2">
      <span class="inline-block h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span>{{ message || 'Directory data is older than 5 minutes.' }}</span>
    </span>
    <button
      type="button"
      class="rounded px-2.5 py-1 font-medium text-fg underline decoration-border underline-offset-2 hover:decoration-accent"
      @click="emit('retry')"
    >
      Refresh
    </button>
  </div>

  <div
    v-else-if="variant === 'error'"
    role="alert"
    class="flex flex-col items-start justify-between gap-4 rounded-[var(--radius)] border border-border bg-surface p-6 sm:flex-row sm:items-center"
  >
    <div>
      <p class="font-semibold text-fg">Unable to load the feed</p>
      <p class="mt-1 text-sm text-muted">
        {{ message || 'The event feed did not respond in time. Try refreshing in a moment.' }}
      </p>
    </div>
    <button
      type="button"
      class="shrink-0 rounded-[var(--radius)] bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
      @click="emit('retry')"
    >
      Retry
    </button>
  </div>

  <div
    v-else
    role="status"
    class="rounded-[var(--radius)] border border-border bg-surface p-8 text-center"
  >
    <p class="text-sm text-muted">
      {{ message || 'No events match this view right now.' }}
    </p>
  </div>
</template>
