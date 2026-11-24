<script setup lang="ts">
import { cardTintStyle } from '~/composables/useCardTint'
import { blurBackground } from '~/composables/usePosterBlur'
import type { FeedStreamItem } from '~/composables/useFeed'
import { formatViewersCompact, formatViewersExact } from '~/utils/viewers'

const props = withDefaults(
  defineProps<{
    stream?: FeedStreamItem
    variant?: 'default' | 'skeleton'
    now?: number
    stale?: boolean
    countdown?: string
    to?: string
    metricLabel?: 'viewers' | 'views'
    layout?: 'card' | 'listing'
    headingLevel?: 'h1' | 'h2' | 'h3'
    scale?: 'listing' | 'hero'
    hero?: boolean
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
    scale: 'listing',
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

const tint = computed(() => cardTintStyle(props.stream?.colors, props.scale))

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
    :style="tint"
    class="event-card group h-full min-h-target"
    :class="[hero ? 'card-hero rounded-panel' : layout === 'listing' ? 'card-listing rounded-card' : 'flex flex-col rounded-card', { 'card-scale-hero': scale === 'hero' }]"
  >
    <div
      class="card-art relative w-full shrink-0 overflow-hidden bg-surface-2"
      :class="hero ? 'rounded-panel' : 'rounded-card'"
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
        :loading="hero ? 'eager' : 'lazy'"
        decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
        :class="imgLoaded ? 'opacity-100' : 'opacity-0'"
        @load="imgLoaded = true"
        @error="imgError = true"
      >

      <PosterFallback v-else :name="stream.name" :colors="stream.colors" :blurhash="stream.blurhash" />
    </div>

    <div class="card-content flex min-w-0 flex-1 flex-col gap-(--card-gap) p-(--card-pad)">
      <component :is="headingLevel" class="card-name line-clamp-2 wrap-anywhere leading-snug text-fg group-hover:underline">
        {{ stream.name }}
      </component>
      <span class="card-category text-metadata text-muted wrap-anywhere">{{ stream.category_name }}<template v-if="stream.tag"> · {{ stream.tag }}</template></span>
      <CardTiming class="card-timing" :starts-at="stream.starts_at" :ends-at="stream.ends_at" :always-live="stream.always_live"
        :now="now" :stale="stale" :replay="metricLabel === 'views'" :event-date="countdown" />
      <div class="card-action mt-auto flex flex-wrap items-center justify-between gap-(--card-gap) text-metadata">
        <span v-if="!stale" role="img" :aria-label="`${exact} ${metricLabel}`" class="listing-numeric text-muted">
          <span aria-hidden="true">{{ compact }} {{ metricLabel }}</span>
        </span>
        <span class="ml-auto font-semibold text-fg group-hover:underline">Watch</span>
      </div>
    </div>
  </NuxtLink>
</template>
