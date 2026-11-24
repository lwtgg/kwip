<script setup lang="ts">
import { matchBannerContent } from '~/composables/matchBanner'
import { cardTintStyle } from '~/composables/useCardTint'
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
    headingLevel: 'h3',
    scale: 'listing',
  },
)

const tint = computed(() => cardTintStyle(props.stream?.colors, props.scale))

const targetHref = computed(() => {
  if (props.to) return props.to
  return props.stream ? `/live/${props.stream.uri_name}` : '/'
})

const matchContent = computed(() => {
  const stream = props.stream
  if (!stream?.match) return undefined
  return matchBannerContent(stream.match, stream.viewers ?? 0, props.metricLabel, !!props.stale)
})

const compact = computed(() => formatViewersCompact(props.stream?.viewers ?? 0))
const exact = computed(() => formatViewersExact(props.stream?.viewers ?? 0))
// "1 viewer", "2 viewers": the unit follows the exact count the label reads out.
const metric = computed(() => exact.value === '1' ? props.metricLabel.replace(/s$/, '') : props.metricLabel)
const matchFacts = computed(() => {
  if (!props.stream) return ''
  const start = new Date(props.stream.starts_at * 1000)
  const time = props.stream.always_live === 1 ? '24/7'
    : props.stream.starts_at > 0 && Number.isFinite(start.getTime())
      ? `${props.stale ? 'Last listed' : 'Kickoff'} ${start.toUTCString().replace('GMT', 'UTC')}`
      : 'Time unavailable'
  return props.stale ? `Unconfirmed. ${time}` : `${exact.value} ${metric.value}. ${time}`
})
</script>

<template>
  <div
    v-if="!stream"
    aria-hidden="true"
    data-variant="skeleton"
    class="card-row min-h-target rounded-row bg-surface"
  >
    <div class="card-art bg-surface-2" />
    <div class="card-category h-3 w-16 rounded-plate bg-surface-2" />
    <div class="card-name h-4 w-4/5 rounded-plate bg-surface-2" />
    <div class="card-lane">
      <div class="h-(--card-time-size) w-full rounded-plate bg-surface-2" />
    </div>
  </div>

  <NuxtLink
    v-else
    :to="targetHref"
    :data-variant="variant"
    :style="stream.match ? undefined : tint"
    class="event-card group h-full min-h-target rounded-row"
    :class="[hero ? 'card-hero' : 'card-row', { 'card-matched': stream.match }]"
  >
    <template v-if="matchContent">
      <component :is="headingLevel" class="sr-only">{{ matchContent.label }}</component>
      <span class="sr-only">{{ matchFacts }}</span>
      <MatchBanner :stream="stream" :now="now" :stale="stale" :scale="scale" :content="matchContent" />
    </template>
    <template v-else>
      <div
        class="card-art relative w-full overflow-hidden bg-surface-2"
        :class="{ 'rounded-row': hero }"
      >
        <PosterFallback :name="stream.name" :colors="stream.colors" />
      </div>

      <div class="card-info">
        <span class="card-category text-metadata text-muted"><span>{{ stream.category_name }}</span><span v-if="stream.tag"> · {{ stream.tag }}</span></span>
        <component :is="headingLevel" class="card-name wrap-anywhere leading-snug text-fg group-hover:underline">
          {{ stream.name }}
        </component>
        <CardTiming :starts-at="stream.starts_at" :ends-at="stream.ends_at" :always-live="stream.always_live"
          :now="now" :stale="stale" :replay="metricLabel === 'views'" :event-date="countdown" />
        <div class="card-meta gap-x-3 text-metadata text-muted">
          <!-- Stale rows are qualified in the lane (Unconfirmed, Last listed) and by the page notice. -->
          <span v-if="!stale" role="img" :aria-label="`${exact} ${metric}`" class="listing-numeric">
            <span aria-hidden="true">{{ compact }} {{ metric }}</span>
          </span>
          <span class="group-hover:underline">Watch</span>
        </div>
      </div>
    </template>
  </NuxtLink>
</template>
