<script setup lang="ts">
import type { FeedStreamItem } from '~/composables/useFeed'

const props = withDefaults(
  defineProps<{
    title: string
    category?: string
    streams: FeedStreamItem[]
    now?: number
    linkBase?: string
    metricLabel?: 'viewers' | 'views'
    featuredUri?: string
    replayDateMap?: Record<number, string>
  }>(),
  {
    category: undefined,
    now: undefined,
    linkBase: '/live',
    metricLabel: 'viewers',
    replayDateMap: undefined,
  },
)

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const categoryHref = computed(() => {
  if (!props.category) return null
  const slug = slugifyCategory(props.category)
  return props.linkBase === '/vods' ? `/vods?filter=${slug}` : `/c/${slug}`
})
</script>

<template>
  <section v-if="streams.length" class="space-y-(--card-gap)">
    <div class="flex flex-wrap items-center justify-between gap-x-4">
      <h2 class="text-section font-semibold text-fg">{{ title }}</h2>
      <NuxtLink
        v-if="categoryHref"
        :to="categoryHref"
        class="inline-flex min-h-target items-center gap-1 text-metadata font-medium text-muted hover:text-fg hover:underline"
      >
        {{ linkBase === '/vods' ? `${category} replays` : `All ${category} events` }}
        <span aria-hidden="true">→</span>
      </NuxtLink>
    </div>
    <div class="fixture-list">
      <StreamCard
        v-for="stream in streams"
        :key="stream.id"
        :stream="stream"
        :now="now"
        :to="`${linkBase}/${stream.uri_name}`"
        :metric-label="metricLabel"
        :replay-date="replayDateMap?.[stream.id]"
        :featured="featuredUri === stream.uri_name"
      />
    </div>
  </section>
</template>
