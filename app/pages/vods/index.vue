<script setup lang="ts">
import { useVods, type FeedStreamItem, type FeedVodItem } from '~/composables/useFeed'

const route = useRoute()
const { siteName } = useRuntimeConfig().public
const { data, status, error, refresh } = useVods()

// Review #6: wall-clock at render + ticking interval so open pages age into stale.
const nowSeconds = ref(Math.floor(Date.now() / 1000))
const fetchedAtSeconds = ref<number | null>(data.value ? Math.floor(Date.now() / 1000) : null)
let clockTimer: ReturnType<typeof setInterval> | null = null

watch(data, (next) => {
  if (next) {
    fetchedAtSeconds.value = Math.floor(Date.now() / 1000)
  }
})

onMounted(() => {
  nowSeconds.value = Math.floor(Date.now() / 1000)
  if (data.value && fetchedAtSeconds.value === null) {
    fetchedAtSeconds.value = nowSeconds.value
  }
  clockTimer = setInterval(() => {
    nowSeconds.value = Math.floor(Date.now() / 1000)
  }, 15_000)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})

async function handleRefresh() {
  await refresh()
  fetchedAtSeconds.value = Math.floor(Date.now() / 1000)
  nowSeconds.value = fetchedAtSeconds.value
}

const isStale = computed(() => {
  if (data.value?.fromCache) return true
  const originTs = data.value?.timestamp || fetchedAtSeconds.value
  return Boolean(originTs && nowSeconds.value - originTs > 300)
})

function formatEventDate(value: number | string): string {
  const asNum = typeof value === 'number' ? value : Number(value)
  const date =
    Number.isFinite(asNum) && asNum > 0
      ? new Date(asNum > 1e12 ? asNum : asNum * 1000)
      : new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function vodToCardItem(vod: FeedVodItem, categoryName: string): FeedStreamItem {
  return {
    id: vod.id,
    name: vod.name,
    tag: vod.tag,
    poster: vod.poster,
    blurhash: vod.blurhash ?? '',
    colors: vod.colors ?? [],
    uri_name: vod.uri_name,
    starts_at: 0,
    ends_at: 0,
    always_live: 0,
    locale: 'en',
    category_name: categoryName,
    viewers: String(vod.views ?? '0'),
  }
}

const activeFilter = computed(() => {
  const raw = Array.isArray(route.query.filter) ? route.query.filter[0] : route.query.filter
  return raw || ''
})

const categoryRails = computed(() =>
  (data.value?.vods ?? [])
    .filter((cat) => !activeFilter.value || cat.category.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') === activeFilter.value)
    .map((cat) => {
      const dateLabels: Record<number, string> = {}
      const items = cat.vods.map((vod) => {
        const formatted = formatEventDate(vod.event_date)
        if (formatted) dateLabels[vod.id] = formatted
        return vodToCardItem(vod, cat.category)
      })
      return {
        id: cat.id,
        category: cat.category,
        items,
        dateLabels,
      }
    })
    .filter((cat) => cat.items.length > 0),
)

const totalVods = computed(() =>
  categoryRails.value.reduce((sum, cat) => sum + cat.items.length, 0),
)

const pageDescription = computed(
  () => `Archived full-event replays by sport in the ${siteName} event directory.`,
)

useSeoMeta({
  title: 'Event Archive',
  description: pageDescription,
  ogTitle: () => `Event Archive · ${siteName}`,
  ogDescription: pageDescription,
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
    <div class="space-y-1">
      <nav aria-label="Breadcrumb" class="text-xs text-muted">
        <NuxtLink to="/" class="hover:text-fg">Home</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-fg">Archive</span>
      </nav>
      <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        Event Archive
      </h1>
      <NuxtLink
        v-if="activeFilter"
        to="/vods"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-muted max-sm:min-h-11 hover:text-accent"
      >
        <span aria-hidden="true">←</span>
        <span>All categories</span>
      </NuxtLink>
    </div>

    <StateBlock
      v-if="status === 'pending' && !data"
      variant="skeleton"
      :rows="4"
    />

    <StateBlock
      v-else-if="error && !data"
      variant="error"
      :message="error.message"
      @retry="handleRefresh"
    />

    <template v-else>
      <StateBlock
        v-if="isStale"
        variant="stale"
        message="Archive data is older than 5 minutes."
        @retry="handleRefresh"
      />

      <StateBlock
        v-if="totalVods === 0"
        variant="empty"
        message="No archived event replays are listed right now."
      />

      <template v-else>
        <Rail
          v-for="rail in categoryRails"
          :key="rail.id"
          :title="rail.category"
          :category="rail.category"
          :streams="rail.items"
          :now="nowSeconds"
          class="[--rail-gap:var(--grid-gap)]"
          link-base="/vods"
          metric-label="views"
          :countdown-map="rail.dateLabels"
        />

        <AdSlot format="leaderboard" />
      </template>
    </template>
  </div>
</template>
