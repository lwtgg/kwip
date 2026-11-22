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

const allStreams = computed<FeedStreamItem[]>(() =>
  categories.value.flatMap((cat) =>
    cat.streams.map((s) => ({
      ...s,
      always_live: s.always_live ?? cat.always_live,
      category_name: s.category_name || cat.category,
    })),
  ),
)

function viewerCount(stream: FeedStreamItem): number {
  const n = Number.parseInt(String(stream.viewers), 10)
  return Number.isFinite(n) ? n : 0
}

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

const featuredUri = computed(() =>
  liveNowStreams.value[0]?.uri_name ?? alwaysLiveStreams.value[0]?.uri_name,
)

const nextUpStreams = computed(() => upcomingStreams.value.slice(0, 3))
const nextUpUris = computed(() => new Set(nextUpStreams.value.map(stream => stream.uri_name)))
const activeUris = computed(() => new Set(
  [...liveNowStreams.value, ...alwaysLiveStreams.value, ...upcomingStreams.value]
    .map(stream => stream.uri_name),
))

const otherCategories = computed(() =>
  categories.value.map(cat => ({
    cat,
    streams: cat.streams.filter(stream => !activeUris.value.has(stream.uri_name)),
  })),
)

const hasVisibleStreams = computed(() => {
  if (activeFilter.value === 'live') return liveNowStreams.value.length + alwaysLiveStreams.value.length > 0
  if (activeFilter.value === 'upcoming') return upcomingStreams.value.length > 0
  return allStreams.value.length > 0
})

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
]

const pageDescription = computed(
  () => `Browse live sports events, 24/7 channels, and upcoming fixtures in the ${siteName} live event directory, kept running by a few of our own ads.`,
)

useSeoMeta({
  title: 'Live Sports Event Directory',
  description: pageDescription,
  ogTitle: () => `Live Sports Event Directory · ${siteName}`,
  ogImageAlt: 'Live Sports Event Directory',
  ogDescription: pageDescription,
})
</script>

<template>
  <div class="mx-auto max-w-fixtures space-y-(--section-gap) px-4 py-(--page-padding) sm:px-6">
    <div class="space-y-(--stack-gap)">
      <h1 class="text-event font-semibold text-fg">Live sports events</h1>
      <nav aria-label="Event status filter" class="flex flex-wrap items-center gap-1">
        <NuxtLink
          v-for="opt in filterOptions"
          :key="opt.value"
          :to="{ path: route.path, query: opt.value === 'all' ? {} : { filter: opt.value } }"
          :aria-current="activeFilter === opt.value ? 'page' : undefined"
          class="inline-flex min-h-target min-w-target items-center justify-center rounded-control px-3 text-metadata font-medium hover:bg-surface-2 hover:text-fg"
          :class="activeFilter === opt.value ? 'bg-surface-2 text-fg underline underline-offset-4' : 'text-muted'"
        >
          {{ opt.label }}
        </NuxtLink>
      </nav>
      <StateBlock v-if="data && isStale" variant="stale" @retry="handleRefresh" />
    </div>

    <StateBlock v-if="status === 'pending' && !data" variant="skeleton" :rows="8" />
    <StateBlock v-else-if="error && !data" variant="error" @retry="handleRefresh" />
    <StateBlock
      v-else-if="!hasVisibleStreams"
      variant="empty"
      :show-current-events="activeFilter !== 'all'"
      message="No events are listed for this view right now."
    />
    <template v-else>
      <Rail
        v-if="activeFilter !== 'upcoming'"
        title="Live now"
        :streams="liveNowStreams"
        :now="nowSeconds"
        :featured-uri="featuredUri"
      />
      <Rail
        v-if="activeFilter !== 'upcoming'"
        title="24/7"
        :streams="alwaysLiveStreams"
        :now="nowSeconds"
        :featured-uri="featuredUri"
      />
      <Rail
        v-if="activeFilter === 'all'"
        title="Next up"
        :streams="nextUpStreams"
        :now="nowSeconds"
      />

      <AdSlot format="leaderboard" placement="home-banner" />

      <Rail
        v-if="activeFilter !== 'live'"
        title="Upcoming"
        :streams="activeFilter === 'upcoming' ? upcomingStreams : upcomingStreams.filter(stream => !nextUpUris.has(stream.uri_name))"
        :now="nowSeconds"
      />
      <Rail
        v-for="rail in activeFilter === 'all' ? otherCategories : []"
        :key="rail.cat.id"
        :title="rail.cat.category"
        :category="rail.cat.category"
        :streams="rail.streams"
        :now="nowSeconds"
      />
    </template>
  </div>
</template>
