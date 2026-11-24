<script setup lang="ts">
import type { FeedStreamItem } from '~/composables/useFeed'

const props = withDefaults(
  defineProps<{
    title: string
    category?: string
    streams: FeedStreamItem[]
    now?: number
    stale?: boolean
    linkBase?: string
    metricLabel?: 'viewers' | 'views'
    countdownMap?: Record<number, string>
  }>(),
  {
    category: undefined,
    now: undefined,
    linkBase: '/live',
    metricLabel: 'viewers',
    countdownMap: undefined,
  },
)

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const countLabel = computed(() => {
  const n = props.streams.length
  return props.metricLabel === 'views' ? `${n} ${n === 1 ? 'replay' : 'replays'}` : `${n} listed`
})
// At md and up the scroller holds columns of up to three rows.
const railRows = computed(() => `repeat(${Math.min(props.streams.length, 3)}, auto)`)

const categoryHref = computed(() => {
  if (!props.category) return null
  const slug = slugifyCategory(props.category)
  return props.linkBase === '/vods' ? `/vods?filter=${slug}` : `/c/${slug}`
})
</script>

<template>
  <section v-if="streams.length > 0" class="space-y-(--card-gap)">
    <GroupHeader :title="title" :to="categoryHref ?? undefined" :count="countLabel" />

    <div
      class="rail-track md:snap-x md:snap-mandatory md:overflow-x-auto md:p-(--focus-scroll-gutter) md:has-[:focus-visible]:snap-none"
      :style="{ '--rail-rows': railRows }"
    >
      <div
        v-for="stream in streams"
        :key="stream.id"
        class="min-w-0 md:snap-start"
      >
        <StreamCard
          :stream="stream"
          :now="now"
          :stale="stale"
          :to="`${linkBase}/${stream.uri_name}`"
          :metric-label="metricLabel"
          :countdown="countdownMap?.[stream.id] || ''"
        />
      </div>
    </div>
  </section>
</template>
