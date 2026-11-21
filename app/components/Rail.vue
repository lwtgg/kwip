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

const categoryHref = computed(() => {
  if (!props.category) return null
  const slug = slugifyCategory(props.category)
  return props.linkBase === '/vods' ? `/vods?filter=${slug}` : `/c/${slug}`
})
</script>

<template>
  <section v-if="streams.length > 0" class="space-y-(--card-gap)">
    <div class="listing-rule flex items-baseline justify-between gap-(--card-gap)">
      <h2 class="listing-display text-lg text-fg">
        <NuxtLink
          v-if="categoryHref"
          :to="categoryHref"
          class="inline-flex items-center gap-1.5 max-sm:min-h-11 hover:underline"
        >
          <span>{{ title }}</span>
          <span aria-hidden="true" class="text-sm text-muted">→</span>
        </NuxtLink>
        <span v-else>{{ title }}</span>
      </h2>
      <NuxtLink
        v-if="categoryHref"
        :to="categoryHref"
        class="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-xs font-medium text-muted hover:underline"
      >
        View all <span class="listing-numeric">({{ streams.length }})</span>
      </NuxtLink>
    </div>

    <div
      class="flex flex-col gap-(--rail-gap) md:flex-row md:snap-x md:snap-mandatory md:overflow-x-auto md:pb-2 md:has-[:focus-visible]:snap-none"
    >
      <div
        v-for="stream in streams"
        :key="stream.id"
        class="w-full md:w-72 md:shrink-0 md:snap-start xl:w-80"
      >
        <StreamCard
          class="md:focus-visible:outline-offset-(--focus-ring-inset)"
          :stream="stream"
          :now="now"
          :to="`${linkBase}/${stream.uri_name}`"
          :metric-label="metricLabel"
          :countdown="countdownMap?.[stream.id] || ''"
        />
      </div>
    </div>
  </section>
</template>
