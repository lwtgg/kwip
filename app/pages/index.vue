<script setup lang="ts">
import { useStreams, type FeedStreamItem } from '~/composables/useFeed'

const route = useRoute()
const { siteName } = useRuntimeConfig().public
const { data, status, error, refresh } = useStreams()

const freshAt = ref<number | null>(null)
const receivedAt = ref<number | null>(null)
watch(data, (next) => {
  if (!next) return

  const arrivedAt = Math.floor(Date.now() / 1000)
  receivedAt.value ??= arrivedAt
  if (!next.fromCache) {
    freshAt.value = arrivedAt
  }
}, { immediate: true, flush: 'sync' })

const { isStale, nowSeconds, retry } = useFeedFreshness(
  () => data.value?.timestamp,
  freshAt,
  receivedAt,
)

function handleRefresh() {
  return retry(refresh, () => [data.value])
}

const activeFilter = computed(() => {
  const raw = Array.isArray(route.query.filter) ? route.query.filter[0] : route.query.filter
  if (raw === 'live' || raw === 'upcoming') return raw
  return 'all'
})

const categories = computed(() => data.value?.streams ?? [])

const normalizedCategories = computed(() =>
  categories.value.map(cat => ({
    ...cat,
    streams: cat.streams.map(stream => ({
      ...stream,
      always_live: stream.always_live ?? cat.always_live,
      category_name: stream.category_name || cat.category,
    })),
  })),
)

const allStreams = computed<FeedStreamItem[]>(() =>
  normalizedCategories.value.flatMap(cat => cat.streams),
)

function viewerCount(stream: FeedStreamItem): number {
  const n = Number.parseInt(String(stream.viewers), 10)
  return Number.isFinite(n) ? n : 0
}

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// SPEC: "Live now" rail — ordered by viewers desc, only always_live === 0 and ends_at > now (and started)
const liveNowStreams = computed(() =>
  allStreams.value
    .filter(
      (s) =>
        (s.always_live ?? 0) === 0 &&
        s.starts_at <= nowSeconds.value &&
        s.ends_at > nowSeconds.value,
    )
    .sort((a, b) => viewerCount(b) - viewerCount(a)),
)

// SPEC: "24/7" rail — always_live === 1
const alwaysLiveStreams = computed(() =>
  allStreams.value
    .filter((s) => s.always_live === 1)
    .sort((a, b) => viewerCount(b) - viewerCount(a)),
)

// SPEC: Upcoming block — starts_at > now, showing a relative countdown
const upcomingStreams = computed(() =>
  allStreams.value
    .filter((s) => (s.always_live ?? 0) === 0 && s.starts_at > nowSeconds.value)
    .sort((a, b) => a.starts_at - b.starts_at),
)

// Review #1: scheduled live first -> always_live === 1 when no scheduled is live -> highest-viewed upcoming labelled "Upcoming".
const heroEntry = computed<{
  stream: FeedStreamItem
  mode: 'live' | 'upcoming' | 'archive'
} | null>(() => {
  if (activeFilter.value !== 'upcoming' && liveNowStreams.value.length > 0) {
    return { stream: liveNowStreams.value[0]!, mode: 'live' }
  }
  if (activeFilter.value !== 'upcoming' && alwaysLiveStreams.value.length > 0) {
    return { stream: alwaysLiveStreams.value[0]!, mode: 'live' }
  }
  if (activeFilter.value !== 'live' && upcomingStreams.value.length > 0) {
    const highestViewedUpcoming = [...upcomingStreams.value].sort(
      (a, b) => viewerCount(b) - viewerCount(a),
    )[0]!
    return { stream: highestViewedUpcoming, mode: 'upcoming' }
  }
  if (activeFilter.value !== 'all') return null
  const fallback = [...allStreams.value].sort((a, b) => viewerCount(b) - viewerCount(a))[0]
  return fallback ? { stream: fallback, mode: 'archive' } : null
})

const hasVisibleStreams = computed(() =>
  activeFilter.value === 'all' ? allStreams.value.length > 0 : heroEntry.value !== null,
)

const heroStream = computed(() => heroEntry.value?.stream ?? null)
const otherLiveStreams = computed(() =>
  liveNowStreams.value.filter(stream => stream.uri_name !== heroStream.value?.uri_name),
)

const nextUpStreams = computed(() => {
  if (activeFilter.value !== 'all') return []

  const seen = new Set([heroStream.value?.uri_name])
  return upcomingStreams.value.filter((stream) => {
    if (seen.has(stream.uri_name)) return false
    seen.add(stream.uri_name)
    return true
  }).slice(0, 3)
})

const nextUpUris = computed(() => new Set(nextUpStreams.value.map((stream) => stream.uri_name)))

function withoutNextUp(streams: FeedStreamItem[]) {
  return streams.filter((stream) => !nextUpUris.value.has(stream.uri_name))
}

// Category rails omit events promoted to the strip and drop any emptied rail.
const categoryRails = computed(() =>
  normalizedCategories.value
    .map((cat) => ({ cat, streams: withoutNextUp(cat.streams) }))
    .filter((rail) => rail.streams.length > 0),
)

// The hero is filtered out of the strip; keep it out of the grid below too.
const upcomingBelowHero = computed(() =>
  withoutNextUp(upcomingStreams.value).filter((stream) => stream.uri_name !== heroStream.value?.uri_name),
)

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
]

const pageDescription = computed(
  () => `Browse live sports events, 24/7 channels, and upcoming fixtures in the ${siteName} live event directory, kept running by a few of our own ads.`,
)

useSeoMeta({
  title: 'Live sports event directory',
  description: pageDescription,
  ogTitle: () => `Live sports event directory · ${siteName}`,
  ogImageAlt: 'Live sports event directory',
  ogDescription: pageDescription,
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-(--section-gap) px-4 py-(--page-padding) sm:px-6">
    <nav aria-label="Event status filter" class="inline-flex items-center gap-1 border-b border-border">
      <NuxtLink
        v-for="opt in filterOptions"
        :key="opt.value"
        :to="{ path: route.path, query: opt.value === 'all' ? {} : { filter: opt.value } }"
        :aria-current="activeFilter === opt.value ? 'page' : undefined"
        class="inline-flex min-h-target min-w-target items-center justify-center rounded-control px-3 py-1.5 text-xs font-medium"
        :class="
          activeFilter === opt.value
            ? 'bg-surface-2 text-fg underline underline-offset-4'
            : 'text-muted hover:text-fg'
        "
      >
        {{ opt.label }}
      </NuxtLink>
    </nav>

    <template v-if="status === 'pending' && !data">
      <h1 class="listing-display text-2xl text-fg sm:text-3xl">
        Live sports event directory
      </h1>
      <StateBlock variant="skeleton" :rows="8" />
    </template>

    <template v-else-if="error && !data">
      <h1 class="listing-display text-2xl text-fg sm:text-3xl">
        Live sports event directory
      </h1>
      <StateBlock
        variant="error"
        @retry="handleRefresh"
      />
    </template>

    <template v-else>
      <StateBlock
        v-if="isStale"
        variant="stale"
        @retry="handleRefresh"
      />

      <template v-if="!hasVisibleStreams">
        <h1 class="listing-display text-2xl text-fg sm:text-3xl">
          Live sports event directory
        </h1>
        <StateBlock
          variant="empty"
          :show-current-events="activeFilter !== 'all'"
          message="No live or upcoming events are listed in the feed right now."
        />
      </template>

      <template v-else>
        <!-- Hero -->
        <section v-if="heroStream" aria-label="Featured event">
          <StreamCard :stream="heroStream" :now="nowSeconds" :stale="isStale" hero scale="hero" heading-level="h1" />
        </section>

        <AdSlot v-if="heroStream" format="leaderboard" placement="home-banner" />

        <section v-if="nextUpStreams.length" aria-labelledby="next-up-heading" class="space-y-(--card-gap)">
          <GroupHeader heading-id="next-up-heading" title="Next up" />
          <ul class="row-grid">
            <li v-for="stream in nextUpStreams" :key="stream.uri_name" class="min-w-0">
              <StreamCard :stream="stream" :now="nowSeconds" :stale="isStale" />
            </li>
          </ul>
        </section>

        <!-- Live now rail -->
        <Rail
          v-if="activeFilter !== 'upcoming' && otherLiveStreams.length > 0"
          :title="isStale ? 'Last listed availability' : 'Live now'"
          :streams="otherLiveStreams"
          :now="nowSeconds"
          :stale="isStale"
        />

        <!-- 24/7 rail -->
        <Rail
          v-if="activeFilter !== 'upcoming' && alwaysLiveStreams.length > 0"
          title="24/7"
          :streams="alwaysLiveStreams"
          :now="nowSeconds"
          :stale="isStale"
        />

        <!-- Per-category rails -->
        <Rail
          v-for="rail in activeFilter === 'all' ? categoryRails : []"
          :key="rail.cat.id"
          :title="rail.cat.category"
          :category="rail.cat.category"
          :streams="rail.streams"
          :now="nowSeconds"
          :stale="isStale"
        />

        <!-- Upcoming block with relative countdown -->
        <section v-if="activeFilter !== 'live' && upcomingBelowHero.length > 0" class="space-y-(--card-gap)">
          <GroupHeader title="Upcoming" :count="`${upcomingBelowHero.length} scheduled`" />
          <div class="row-grid">
            <StreamCard
              v-for="stream in upcomingBelowHero"
              :key="stream.id"
              :stream="stream"
              :now="nowSeconds"
              :stale="isStale"
            />
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
