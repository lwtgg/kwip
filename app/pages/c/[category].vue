<script setup lang="ts">
import { useStreams, type FeedStreamItem } from '~/composables/useFeed'

type FilterMode = 'all' | 'live' | 'upcoming'

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

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const categorySlug = computed(() => slugifyCategory(String(route.params.category || '')))

const activeFilter = computed<FilterMode>(() => {
  const raw = Array.isArray(route.query.filter) ? route.query.filter[0] : route.query.filter
  if (raw === 'live' || raw === 'upcoming') return raw
  return 'all'
})

const matchedCategory = computed(() =>
  (data.value?.streams ?? []).find((cat) => slugifyCategory(cat.category) === categorySlug.value) ??
  null,
)

const categoryTitle = computed(() => {
  if (matchedCategory.value) return matchedCategory.value.category
  const slug = categorySlug.value
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ') : 'Category'
})

const categoryStreams = computed<FeedStreamItem[]>(() => {
  const cat = matchedCategory.value
  if (!cat) return []
  return cat.streams.map((s) => ({
    ...s,
    always_live: s.always_live ?? cat.always_live,
    category_name: s.category_name || cat.category,
  }))
})

function isStreamLive(s: FeedStreamItem): boolean {
  if (s.always_live === 1) return true
  return s.starts_at <= nowSeconds.value && s.ends_at > nowSeconds.value
}

function isStreamUpcoming(s: FeedStreamItem): boolean {
  if (s.always_live === 1) return false
  return s.starts_at > nowSeconds.value
}

const filteredStreams = computed(() => {
  if (activeFilter.value === 'live') {
    return categoryStreams.value.filter(isStreamLive)
  }
  if (activeFilter.value === 'upcoming') {
    return categoryStreams.value.filter(isStreamUpcoming)
  }
  return categoryStreams.value
})

const filterOptions: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
]

const seoDescription = computed(
  () => `Live and upcoming ${categoryTitle.value} events in the ${siteName} directory.`,
)

useSeoMeta({
  title: () => `${categoryTitle.value} Events`,
  description: seoDescription,
  ogTitle: () => `${categoryTitle.value} Events · ${siteName}`,
  ogImageAlt: () => `${categoryTitle.value} Events`,
  ogDescription: seoDescription,
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
    <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div class="space-y-1">
        <nav aria-label="Breadcrumb" class="text-xs text-muted">
          <NuxtLink to="/" class="hover:text-fg">Home</NuxtLink>
          <span class="mx-1.5">/</span>
          <span class="text-fg">{{ categoryTitle }}</span>
        </nav>
        <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {{ categoryTitle }}
        </h1>
      </div>

      <nav aria-label="Event status filter" class="inline-flex items-center gap-1 rounded-[var(--radius)] border border-border bg-surface p-1">
        <NuxtLink
          v-for="opt in filterOptions"
          :key="opt.value"
          :to="{ path: route.path, query: opt.value === 'all' ? {} : { filter: opt.value } }"
          :aria-current="activeFilter === opt.value ? 'page' : undefined"
          class="rounded-[calc(var(--radius)-4px)] max-sm:inline-flex max-sm:min-h-11 max-sm:items-center px-3 py-1.5 text-xs font-medium motion-safe:transition-colors"
          :class="
            activeFilter === opt.value
              ? 'bg-accent text-accent-fg'
              : 'text-muted hover:text-fg'
          "
        >
          {{ opt.label }}
        </NuxtLink>
      </nav>
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
        message="Directory data is older than 5 minutes."
        @retry="handleRefresh"
      />

      <StateBlock
        v-if="filteredStreams.length === 0"
        variant="empty"
        :message="
          !matchedCategory
            ? `No events found for category &quot;${categoryTitle}&quot;.`
            : activeFilter === 'all'
              ? `No ${categoryTitle} events are listed right now.`
              : `No ${activeFilter} ${categoryTitle} events right now.`
        "
      />

      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StreamCard
          v-for="stream in filteredStreams"
          :key="stream.id"
          :stream="stream"
          :now="nowSeconds"
        />
      </div>
    </template>
  </div>
</template>
