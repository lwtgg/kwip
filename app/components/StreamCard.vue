<script setup lang="ts">
import type { FeedStreamItem } from '~/composables/useFeed'

const props = withDefaults(
  defineProps<{
    stream?: FeedStreamItem
    variant?: 'default' | 'skeleton'
    now?: number
    countdown?: string
    to?: string
    metricLabel?: 'viewers' | 'views'
  }>(),
  {
    stream: undefined,
    variant: 'default',
    now: undefined,
    countdown: '',
    to: '',
    metricLabel: 'viewers',
  },
)

const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)
const imgError = ref(false)

watch(
  () => props.stream?.poster,
  () => {
    imgLoaded.value = false
    imgError.value = false
  },
)

onMounted(() => {
  if (imgRef.value?.complete) {
    imgLoaded.value = imgRef.value.naturalWidth > 0
    imgError.value = !imgLoaded.value
  }
})

const effectiveVariant = computed<'default' | 'skeleton'>(() => {
  if (!props.stream || props.variant === 'skeleton' || !props.stream.poster) {
    return 'skeleton'
  }
  return 'default'
})

const placeholderColor = computed(() => props.stream?.colors?.[0] || 'var(--color-surface-2)')

const targetHref = computed(() => {
  if (props.to) return props.to
  return props.stream ? `/live/${props.stream.uri_name}` : '/'
})

function formatViewers(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

const formattedViewers = computed(() => (props.stream ? formatViewers(props.stream.viewers) : '0'))
</script>

<template>
  <div
    v-if="!stream"
    aria-hidden="true"
    data-variant="skeleton"
    class="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
  >
    <div class="aspect-video w-full bg-surface-2 motion-safe:animate-pulse" />
    <div class="space-y-2.5 p-3.5">
      <div class="h-3.5 w-20 rounded bg-surface-2 motion-safe:animate-pulse" />
      <div class="h-4 w-4/5 rounded bg-surface-2 motion-safe:animate-pulse" />
      <div class="h-4 w-3/5 rounded bg-surface-2 motion-safe:animate-pulse" />
    </div>
  </div>

  <NuxtLink
    v-else
    :to="targetHref"
    :data-variant="effectiveVariant"
    class="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface motion-safe:transition-[border-color] hover:border-accent"
  >
    <div
      class="relative aspect-video w-full overflow-hidden"
      :style="{ backgroundColor: placeholderColor }"
    >
      <img
        v-if="effectiveVariant === 'default' && !imgError"
        ref="imgRef"
        :src="stream.poster"
        :alt="stream.name"
        width="640"
        height="360"
        loading="lazy"
        decoding="async"
        class="h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-300"
        :class="imgLoaded ? 'opacity-100' : 'opacity-0'"
        @load="imgLoaded = true"
        @error="imgError = true"
      >

      <PosterFallback v-else :name="stream.name" :colors="stream.colors" />

      <div class="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
        <StatusPill
          :starts-at="stream.starts_at"
          :ends-at="stream.ends_at"
          :always-live="stream.always_live"
          :now="now"
        />

        <span
          class="inline-flex items-center gap-1 rounded-full bg-bg/85 px-2.5 py-0.5 text-[11px] font-medium text-fg backdrop-blur-xs"
        >
          <span v-if="metricLabel === 'viewers'" aria-hidden="true">●</span>
          <span>{{ formattedViewers }}</span>
          <span v-if="metricLabel === 'views'">views</span>
          <span v-else class="sr-only">viewers</span>
        </span>
      </div>
      <span
        v-if="metricLabel === 'views' && countdown"
        class="absolute bottom-2.5 left-2.5 rounded-full bg-bg/85 px-2.5 py-0.5 text-[11px] font-medium text-fg backdrop-blur-xs"
      >
        {{ countdown }}
      </span>
    </div>

    <div class="flex flex-1 flex-col justify-between gap-2 p-3.5">
      <LiveProgress
        v-if="now !== undefined"
        :starts-at="stream.starts_at"
        :ends-at="stream.ends_at"
        :always-live="stream.always_live"
        :now="now"
      />
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="rounded bg-surface-2 px-2 py-0.5 font-medium text-muted">
          {{ stream.category_name }}
        </span>
        <span v-if="stream.tag" class="text-muted">
          · {{ stream.tag }}
        </span>
      </div>

      <h3 class="line-clamp-2 text-sm font-semibold leading-snug text-fg group-hover:text-accent">
        {{ stream.name }}
      </h3>
    </div>
  </NuxtLink>
</template>
