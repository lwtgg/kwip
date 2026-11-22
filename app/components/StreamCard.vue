<script setup lang="ts">
import type { FeedStreamItem } from '~/composables/useFeed'
import { formatViewersCompact, formatViewersExact } from '~/utils/viewers'

const props = withDefaults(defineProps<{
  stream: FeedStreamItem
  now?: number
  to?: string
  metricLabel?: 'viewers' | 'views'
  replayDate?: string
  featured?: boolean
  headingLevel?: 'h2' | 'h3'
}>(), {
  metricLabel: 'viewers',
  headingLevel: 'h3',
})

const posterImage = ref<HTMLImageElement | null>(null)
const loadedPoster = ref<string>()

function updatePoster() {
  const image = posterImage.value
  loadedPoster.value = image?.complete && image.naturalWidth > 0
    ? props.stream.poster
    : undefined
}

// A cached or failed poster can settle before Vue attaches the load listener.
onMounted(updatePoster)

const targetHref = computed(() => props.to || `/live/${props.stream.uri_name}`)
const compact = computed(() => formatViewersCompact(props.stream.viewers))
const exact = computed(() => formatViewersExact(props.stream.viewers))
</script>

<template>
  <NuxtLink
    :to="targetHref"
    :data-featured="featured || undefined"
    class="fixture-row group focus-visible:outline-offset-(--focus-ring-inset) hover:bg-surface-2"
  >
    <span
      v-if="metricLabel === 'views' && replayDate"
      class="text-metadata font-medium text-muted tabular-nums"
    >{{ replayDate }}</span>
    <span v-else-if="metricLabel === 'views'" class="text-metadata text-muted">Replay</span>
    <div v-else class="space-y-1">
      <StatusPill
        :starts-at="stream.starts_at"
        :ends-at="stream.ends_at"
        :always-live="stream.always_live"
        :now="now"
      />
      <LiveProgress
        v-if="now !== undefined && stream.starts_at > 0 && stream.starts_at <= now && now < stream.ends_at"
        :starts-at="stream.starts_at"
        :ends-at="stream.ends_at"
        :always-live="stream.always_live"
        :now="now"
      />
    </div>

    <div class="min-w-0">
      <component
        :is="headingLevel"
        class="line-clamp-2 wrap-anywhere text-fixture font-semibold text-fg group-hover:underline"
      >
        {{ stream.name }}
      </component>
      <div class="flex flex-wrap gap-x-2 text-metadata text-muted">
        <span>{{ stream.category_name }}</span>
        <span class="tabular-nums">
          <span class="sr-only">{{ exact }} {{ metricLabel }}</span>
          <span aria-hidden="true">{{ compact }} {{ metricLabel }}</span>
        </span>
      </div>
    </div>

    <span
      v-if="featured"
      class="inline-flex min-h-target items-center gap-1 rounded-control bg-accent px-2 text-metadata font-semibold text-accent-fg group-hover:underline"
    >
      <span>Watch</span><span aria-hidden="true">→</span>
    </span>

    <div
      aria-hidden="true"
      class="aspect-video w-fixture-poster overflow-hidden rounded-control"
      :class="featured ? 'hidden sm:block' : undefined"
    >
      <img
        v-if="stream.poster"
        ref="posterImage"
        :src="stream.poster"
        alt=""
        width="640"
        height="360"
        loading="lazy"
        decoding="async"
        class="size-full object-cover"
        :class="{ 'opacity-0': loadedPoster !== stream.poster }"
        @load="updatePoster"
        @error="updatePoster"
      >
    </div>
  </NuxtLink>
</template>
