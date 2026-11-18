<script setup lang="ts">
import { useStreams, type FeedStreamItem } from '~/composables/useFeed'
import { formatViewersCompact, formatViewersExact } from '~/utils/viewers'

const route = useRoute()
const { siteName } = useRuntimeConfig().public
const { data, status, error, refresh } = useStreams()

// Review #6 & #9: wall-clock `Date.now()` at render + ticking interval (never feed snapshot timestamp for live/upcoming).
const nowSeconds = useState('directory-now', () => Math.floor(Date.now() / 1000))
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
  }, 1_000)
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

const nextUpStreams = computed(() => {
  if (activeFilter.value !== 'all') return []

  const liveByViewers = [...liveNowStreams.value, ...alwaysLiveStreams.value]
    .sort((a, b) => viewerCount(b) - viewerCount(a))
  const seen = new Set([heroStream.value?.uri_name])
  return [...upcomingStreams.value, ...liveByViewers].filter((stream) => {
    if (seen.has(stream.uri_name)) return false
    seen.add(stream.uri_name)
    return true
  }).slice(0, 3)
})

const nextUpUris = computed(() => new Set(nextUpStreams.value.map((stream) => stream.uri_name)))

function withoutNextUp(streams: FeedStreamItem[]) {
  return streams.filter((stream) => !nextUpUris.value.has(stream.uri_name))
}

// Rails lose whatever the strip promoted, so a rail emptied by the hand-off is dropped entirely.
const liveRailStreams = computed(() => withoutNextUp(liveNowStreams.value))
const alwaysLiveRailStreams = computed(() => withoutNextUp(alwaysLiveStreams.value))
const categoryRails = computed(() =>
  categories.value
    .map((cat) => ({ cat, streams: withoutNextUp(cat.streams) }))
    .filter((rail) => rail.streams.length > 0),
)

// The hero is filtered out of the strip; keep it out of the grid below too.
const upcomingBelowHero = computed(() =>
  withoutNextUp(upcomingStreams.value).filter((stream) => stream.uri_name !== heroStream.value?.uri_name),
)
const failedNextUpPosters = reactive(new Set<string>())

const heroImgRef = ref<HTMLImageElement | null>(null)
const heroImgError = ref(false)
const heroImgLoaded = ref(false)
watch(
  () => heroStream.value?.poster,
  () => {
    heroImgError.value = false
    heroImgLoaded.value = false
  },
)

onMounted(() => {
  if (heroImgRef.value?.complete) {
    heroImgLoaded.value = heroImgRef.value.naturalWidth > 0
    heroImgError.value = !heroImgLoaded.value
  }
})

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
                ref="heroImgRef"
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
              <PosterFallback v-else :name="heroStream.name" :colors="heroStream.colors" />
              <div v-if="heroStream.poster && !heroImgError" class="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-surface/90" />
            </div>

            <div class="flex flex-col justify-center gap-4 p-6 sm:p-8 lg:col-span-5">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <StatusPill
                  :starts-at="heroStream.starts_at"
                  :ends-at="heroStream.ends_at"
                  :always-live="heroStream.always_live"
                  :now="nowSeconds"
                />

                <NuxtLink
                  :to="`/c/${slugifyCategory(heroStream.category_name)}`"
                  class="rounded bg-surface-2 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center px-2.5 py-0.5 font-medium text-muted hover:text-fg"
                >
                  {{ heroStream.category_name }}
                </NuxtLink>
                <span v-if="heroStream.tag" class="text-muted">· {{ heroStream.tag }}</span>
                <span
                  class="ml-auto text-muted"
                  role="img"
                  :aria-label="`${formatViewersExact(heroStream.viewers)} ${heroMode === 'live' ? 'watching' : 'interested'}`"
                >
                  <span aria-hidden="true">
                    {{ formatViewersCompact(heroStream.viewers) }} {{ heroMode === 'live' ? 'watching' : 'interested' }}
                  </span>
                </span>
              </div>

              <LiveProgress
                :starts-at="heroStream.starts_at"
                :ends-at="heroStream.ends_at"
                :always-live="heroStream.always_live"
                :now="nowSeconds"
              />

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

        <section v-if="nextUpStreams.length" aria-labelledby="next-up-heading" class="!mt-4 border-t border-border pt-3">
          <h2 id="next-up-heading" class="mb-2 text-xs font-semibold text-muted">
            Next up
          </h2>
          <ul class="grid grid-cols-1 gap-1 min-[641px]:grid-cols-3 min-[641px]:gap-3">
            <li v-for="stream in nextUpStreams" :key="stream.uri_name" class="min-w-0">
              <NuxtLink
                :to="`/live/${stream.uri_name}`"
                class="group flex min-h-11 items-center gap-2.5 rounded-[var(--radius)] p-1.5 hover:bg-surface"
              >
                <div class="relative h-10 w-[72px] shrink-0 overflow-hidden rounded bg-surface-2">
                  <img
                    v-if="stream.poster && !failedNextUpPosters.has(stream.poster)"
                    :src="stream.poster"
                    alt=""
                    width="72"
                    height="40"
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-cover"
                    @error="failedNextUpPosters.add(stream.poster)"
                  >
                  <PosterFallback v-else :name="stream.name" :colors="stream.colors" />
                </div>
                <div class="min-w-0">
                  <div class="line-clamp-2 break-words text-sm font-semibold leading-tight text-fg group-hover:text-accent">
                    {{ stream.name }}
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="min-w-0 truncate text-xs text-muted">{{ stream.category_name }}</span>
                    <StatusPill
                      :starts-at="stream.starts_at"
                      :ends-at="stream.ends_at"
                      :always-live="stream.always_live"
                      :now="nowSeconds"
                    />
                  </div>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <!-- Reserved AdSlot before the rails -->
        <AdSlot format="leaderboard" />

        <!-- Live now rail -->
        <Rail
          v-if="activeFilter !== 'upcoming' && liveRailStreams.length > 0"
          title="Live now"
          :streams="liveRailStreams"
          :now="nowSeconds"
        />

        <!-- 24/7 rail -->
        <Rail
          v-if="activeFilter !== 'upcoming' && alwaysLiveRailStreams.length > 0"
          title="24/7"
          :streams="alwaysLiveRailStreams"
          :now="nowSeconds"
        />

        <!-- Per-category rails -->
        <Rail
          v-for="rail in activeFilter === 'all' ? categoryRails : []"
          :key="rail.cat.id"
          :title="rail.cat.category"
          :category="rail.cat.category"
          :streams="rail.streams"
          :now="nowSeconds"
        />

        <!-- Upcoming block with relative countdown -->
        <section v-if="activeFilter !== 'live' && upcomingBelowHero.length > 0" class="space-y-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-lg font-semibold tracking-tight text-fg">
              Upcoming
            </h2>
            <span class="text-xs text-muted">{{ upcomingBelowHero.length }} scheduled</span>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StreamCard
              v-for="stream in upcomingBelowHero"
              :key="stream.id"
              :stream="stream"
              :now="nowSeconds"
            />
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
