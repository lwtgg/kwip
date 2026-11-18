<script setup lang="ts">
import { useVods, type FeedStreamItem, type FeedVodItem } from '~/composables/useFeed'

const { siteName } = useRuntimeConfig().public
const { data, status, error, refresh } = useVods()

const wallClockSeconds = ref(Math.floor(Date.now() / 1000))
onMounted(() => {
  wallClockSeconds.value = Math.floor(Date.now() / 1000)
})

const feedNow = computed(() => data.value?.timestamp || wallClockSeconds.value)

const isStale = computed(() => {
  const ts = data.value?.timestamp
  return Boolean(ts && wallClockSeconds.value - ts > 300)
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

const categoryRails = computed(() =>
  (data.value?.vods ?? [])
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
      @retry="refresh()"
    />

    <template v-else>
      <StateBlock
        v-if="isStale"
        variant="stale"
        message="Archive data is older than 5 minutes."
        @retry="refresh()"
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
          :now="feedNow"
          link-base="/vods"
          metric-label="views"
          :countdown-map="rail.dateLabels"
        />

        <div>
          <div class="hidden md:block">
            <AdSlot format="leaderboard" />
          </div>
          <div class="md:hidden">
            <AdSlot format="mobile" />
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
