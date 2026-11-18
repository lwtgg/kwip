<script setup lang="ts">
import { useStreams, type FeedStreamItem } from '~/composables/useFeed'

const route = useRoute()
const { siteName } = useRuntimeConfig().public
const { data, status, error, refresh } = useStreams()

// Review #6 & #9: wall-clock `Date.now()` at render + ticking interval (never feed snapshot timestamp for live/upcoming).
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
  if (!originTs) return false
  return nowSeconds.value - originTs > 300
})

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

function formatViewers(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function formatCountdown(startsAt: number, now: number): string {
  const diff = Math.max(0, startsAt - now)
  if (diff < 60) return 'Starting soon'
  const minutes = Math.floor(diff / 60)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  if (hours < 24) return remMinutes > 0 ? `in ${hours}h ${remMinutes}m` : `in ${hours}h`
  const days = Math.floor(hours / 24)
  return `in ${days}d`
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
const heroMode = computed(() => heroEntry.value?.mode ?? 'archive')

const heroImgError = ref(false)
const heroImgLoaded = ref(false)
watch(
  () => heroStream.value?.poster,
  () => {
    heroImgError.value = false
    heroImgLoaded.value = false
  },
)

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
]

const pageDescription = computed(
  () => `Browse live sports events, 24/7 channels, and upcoming fixtures in the ${siteName} live event directory.`,
)

useSeoMeta({
  title: 'Live Sports Event Directory',
  description: pageDescription,
  ogTitle: () => `Live Sports Event Directory · ${siteName}`,
  ogDescription: pageDescription,
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
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

    <template v-if="status === 'pending' && !data">
      <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        Live Sports Event Directory
      </h1>
      <StateBlock variant="skeleton" :rows="8" />
    </template>

    <template v-else-if="error && !data">
      <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        Live Sports Event Directory
      </h1>
      <StateBlock
        variant="error"
        :message="error.message"
        @retry="handleRefresh"
      />
    </template>

    <template v-else>
      <StateBlock
        v-if="isStale"
        variant="stale"
        message="Directory data is older than 5 minutes."
        @retry="handleRefresh"
      />

      <template v-if="!hasVisibleStreams">
        <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Live Sports Event Directory
        </h1>
        <StateBlock
          variant="empty"
          message="No live or upcoming events are listed in the feed right now."
        />
      </template>

      <template v-else>
        <!-- Hero -->
        <section
          v-if="heroStream"
          aria-label="Featured event"
          class="relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface"
        >
          <div class="grid grid-cols-1 lg:grid-cols-12">
            <div
              class="relative aspect-video lg:col-span-7 lg:aspect-auto lg:min-h-[320px]"
              :style="{ backgroundColor: heroStream.colors?.[0] || 'var(--color-surface-2)' }"
            >
              <img
                v-if="heroStream.poster && !heroImgError"
                :src="heroStream.poster"
                :alt="heroStream.name"
                width="960"
                height="540"
                loading="eager"
                decoding="async"
                class="h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-300"
                :class="heroImgLoaded ? 'opacity-100' : 'opacity-0'"
                @load="heroImgLoaded = true"
                @error="heroImgError = true"
              >
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-surface/90" />
            </div>

            <div class="flex flex-col justify-center gap-4 p-6 sm:p-8 lg:col-span-5">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span
                  v-if="heroMode === 'live'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-0.5 font-semibold uppercase tracking-wide text-white"
                >
                  <span class="relative flex h-2 w-2">
                    <span class="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
                    <span class="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  <span>Live</span>
                </span>
                <span
                  v-else-if="heroMode === 'upcoming'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold uppercase tracking-wide text-fg"
                >
                  <span>Upcoming</span>
                  <span class="font-normal normal-case text-muted">
                    · {{ formatCountdown(heroStream.starts_at, nowSeconds) }}
                  </span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold uppercase tracking-wide text-muted"
                >
                  Event
                </span>

                <NuxtLink
                  :to="`/c/${slugifyCategory(heroStream.category_name)}`"
                  class="rounded bg-surface-2 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center px-2.5 py-0.5 font-medium text-muted hover:text-fg"
                >
                  {{ heroStream.category_name }}
                </NuxtLink>
                <span v-if="heroStream.tag" class="text-muted">· {{ heroStream.tag }}</span>
                <span class="ml-auto text-muted">
                  {{ formatViewers(heroStream.viewers) }} {{ heroMode === 'live' ? 'watching' : 'interested' }}
                </span>
              </div>

              <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {{ heroStream.name }}
              </h1>

              <div class="pt-1">
                <NuxtLink
                  :to="`/live/${heroStream.uri_name}`"
                  class="inline-flex items-center gap-2 rounded-[var(--radius)] bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:opacity-90"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="h-4 w-4"
                  >
                    <path d="M8 5.14v14l11-7-11-7Z" />
                  </svg>
                  <span>{{ heroMode === 'live' ? 'Watch live event' : 'Open event page' }}</span>
                </NuxtLink>
              </div>
            </div>
          </div>
        </section>

        <!-- Reserved AdSlot between hero and first rail -->
        <AdSlot format="leaderboard" />

        <!-- Live now rail -->
        <Rail
          v-if="activeFilter !== 'upcoming' && liveNowStreams.length > 0"
          title="Live now"
          :streams="liveNowStreams"
          :now="nowSeconds"
        />

        <!-- 24/7 rail -->
        <Rail
          v-if="activeFilter !== 'upcoming' && alwaysLiveStreams.length > 0"
          title="24/7"
          :streams="alwaysLiveStreams"
          :now="nowSeconds"
        />

        <!-- Per-category rails -->
        <Rail
          v-for="cat in activeFilter === 'all' ? categories : []"
          :key="cat.id"
          :title="cat.category"
          :category="cat.category"
          :streams="cat.streams"
          :now="nowSeconds"
        />

        <!-- Upcoming block with relative countdown -->
        <section v-if="activeFilter !== 'live' && upcomingStreams.length > 0" class="space-y-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-lg font-semibold tracking-tight text-fg">
              Upcoming
            </h2>
            <span class="text-xs text-muted">{{ upcomingStreams.length }} scheduled</span>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StreamCard
              v-for="stream in upcomingStreams"
              :key="stream.id"
              :stream="stream"
              :now="nowSeconds"
              :countdown="formatCountdown(stream.starts_at, nowSeconds)"
            />
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
