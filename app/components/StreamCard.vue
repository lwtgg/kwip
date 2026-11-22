<script setup lang="ts">
import { blurBackground } from '~/composables/usePosterBlur'
import type { FeedStreamItem } from '~/composables/useFeed'
import { formatViewersCompact, formatViewersExact } from '~/utils/viewers'

const props = withDefaults(
  defineProps<{
    stream?: FeedStreamItem
    variant?: 'default' | 'skeleton'
    now?: number
    countdown?: string
    to?: string
    metricLabel?: 'viewers' | 'views'
    layout?: 'card' | 'listing'
    headingLevel?: 'h2' | 'h3'
  }>(),
  {
    stream: undefined,
    variant: 'default',
    now: undefined,
    countdown: '',
    to: '',
    metricLabel: 'viewers',
    layout: 'card',
    headingLevel: 'h3',
  },
)

const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)
const imgError = ref(false)
const background = blurBackground(() => props.stream?.blurhash)

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

const compact = computed(() => formatViewersCompact(props.stream?.viewers ?? 0))
const exact = computed(() => formatViewersExact(props.stream?.viewers ?? 0))
</script>

<template>
  <div
    v-if="!stream"
    aria-hidden="true"
    data-variant="skeleton"
    class="overflow-hidden rounded-[var(--radius-card)] border-t border-border bg-surface"
  >
    <div class="aspect-video w-full bg-surface-2" />
    <div class="space-y-[calc(var(--card-gap)+0.125rem)] p-(--card-pad)">
      <div class="h-3.5 w-20 rounded-listing bg-surface-2" />
      <div class="h-4 w-4/5 rounded-listing bg-surface-2" />
      <div class="h-4 w-3/5 rounded-listing bg-surface-2" />
    </div>
  </div>

  <NuxtLink
    v-else
    :to="targetHref"
    :data-variant="effectiveVariant"
    class="group flex h-full rounded-card border-t border-border hover:bg-surface-2"
    :class="layout === 'listing' ? 'items-center gap-(--card-gap) px-(--card-pad)' : 'flex-col bg-surface'"
  >
    <div
      class="relative aspect-video shrink-0 overflow-hidden rounded-card"
      :class="layout === 'listing' ? 'w-listing-thumb' : 'w-full'"
      :style="{ backgroundColor: placeholderColor }"
    >
      <span
        v-if="!imgLoaded && background && effectiveVariant === 'default' && !imgError"
        aria-hidden="true"
        class="absolute inset-0 scale-105 bg-cover bg-center blur-sm"
        :style="{ backgroundImage: background }"
      />
      <img
        v-if="effectiveVariant === 'default' && !imgError"
        ref="imgRef"
        :src="stream.poster"
        alt=""
        width="640"
        height="360"
        loading="lazy"
        decoding="async"
        class="relative h-full w-full object-cover"
        :class="imgLoaded ? 'opacity-100' : 'opacity-0'"
        @load="imgLoaded = true"
        @error="imgError = true"
      >

      <PosterFallback v-else :name="stream.name" :colors="stream.colors" :blurhash="stream.blurhash" />

      <div v-if="layout === 'card'" class="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
        <StatusPill
          :starts-at="stream.starts_at"
          :ends-at="stream.ends_at"
          :always-live="stream.always_live"
          :now="now"
        />

        <span
          role="img"
          :aria-label="`${exact} ${metricLabel}`"
          class="listing-numeric inline-flex items-center gap-1 rounded-listing bg-bg px-2.5 py-0.5 text-metadata font-medium text-fg"
        >
          <span v-if="metricLabel === 'viewers'" aria-hidden="true">●</span>
          <span aria-hidden="true">{{ compact }}</span>
          <span v-if="metricLabel === 'views'" aria-hidden="true">views</span>
        </span>
      </div>
      <span
        v-if="metricLabel === 'views' && countdown"
        class="listing-numeric absolute bottom-2.5 left-2.5 rounded-listing bg-bg px-2.5 py-0.5 text-metadata font-medium text-fg"
      >
        {{ countdown }}
      </span>
    </div>

    <div class="flex min-w-0 flex-1 flex-col justify-between gap-(--card-gap) py-(--card-pad)"
      :class="{ 'px-(--card-pad)': layout === 'card' }">
      <LiveProgress
        v-if="layout === 'card' && now !== undefined"
        :starts-at="stream.starts_at"
        :ends-at="stream.ends_at"
        :always-live="stream.always_live"
        :now="now"
      />
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="font-medium text-muted">
          {{ stream.category_name }}
        </span>
        <span v-if="layout === 'card' && stream.tag" class="text-muted">
          · {{ stream.tag }}
        </span>
        <StatusPill
          v-if="layout === 'listing'"
          :starts-at="stream.starts_at"
          :ends-at="stream.ends_at"
          :always-live="stream.always_live"
          :now="now"
        />
      </div>

      <component :is="headingLevel" class="listing-display line-clamp-2 text-sm leading-snug text-fg group-hover:underline">
        {{ stream.name }}
      </component>
    </div>
  </NuxtLink>
</template>
