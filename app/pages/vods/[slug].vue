<script setup lang="ts">
import { formatViewersExact } from '~/utils/viewers'
import { validFeedPath } from '~~/server/utils/feed-path'
import {
  isSnapshotUnavailable,
  useVod,
  useVods,
  type FeedStreamItem,
  type FeedVodDetail,
  type FeedVodItem,
} from '~/composables/useFeed'

const route = useRoute()
const { siteName } = useRuntimeConfig().public

const slug = computed(() => String(route.params.slug || '').replace(/^\/+|\/+$/g, ''))

const vod = useVod(slug)
const vods = useVods()
const {
  data: vodResp,
  status: vodStatus,
  error: vodError,
  refresh: refreshVod,
} = vod

const {
  data: vodsListResp,
  refresh: refreshVodsList,
} = vods

const freshAt = ref<number | null>(null)
const receivedAt = ref<number | null>(null)
watch([vodResp, vodsListResp], (payloads, previous) => {
  if (!payloads.some(Boolean)) return

  const arrivedAt = Math.floor(Date.now() / 1000)
  receivedAt.value ??= arrivedAt
  if (payloads.some((payload, index) => payload && !payload.fromCache && payload !== previous[index])) {
    freshAt.value = arrivedAt
  }
}, { immediate: true, flush: 'sync' })

const { isStale, nowSeconds, retry } = useFeedFreshness(
  () => vodsListResp.value?.timestamp,
  freshAt,
  receivedAt,
)

const matchedListContext = computed<{ item: FeedVodItem; category: string } | null>(() => {
  for (const cat of vodsListResp.value?.vods ?? []) {
    for (const item of cat.vods) {
      if ((item.slug ?? item.uri_name) === slug.value) {
        return { item, category: cat.category }
      }
    }
  }
  return null
})

const isFixture = /(?:^|\/)fixtures\/?$/.test(useRuntimeConfig().public.feedBase)
const detail = computed<FeedVodDetail | null>(() => {
  const raw = vodResp.value?.data
  if (!raw) return null
  const matched = matchedListContext.value?.item
  // URI-less VODs can use the route's existing list metadata in unbound runs.
  if (!matched) return raw.uri_name && raw.uri_name !== slug.value ? null : raw
  if (raw.uri_name === slug.value && !isFixture) return raw
  return {
    ...raw,
    id: matched.id,
    name: matched.name,
    tag: matched.tag,
    poster: matched.poster || raw.poster,
    blurhash: matched.blurhash ?? raw.blurhash,
    colors: matched.colors?.length ? matched.colors : raw.colors,
    uri_name: matched.uri_name,
    added: matched.added,
    event_date: matched.event_date,
    views: matched.views,
  }
})

function humanizeSlug(rawSlug: string): string {
  const last = rawSlug.split('/').filter(Boolean).pop() || ''
  if (!last) return 'Event Replay'
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

// Review #11: every state renders the page `h1`, including loading, error, and empty.
const pageHeading = computed(
  () => detail.value?.name || matchedListContext.value?.item.name || humanizeSlug(slug.value),
)

const categoryName = computed(() => matchedListContext.value?.category || detail.value?.tag || 'Archive')

const sourceFailed = ref(false)
const retryNonce = ref(0)
const posterLoaded = ref(false)
const posterError = ref(false)

watch(slug, () => {
  sourceFailed.value = false
  retryNonce.value = 0
  posterLoaded.value = false
  posterError.value = false
})

watch(
  [() => detail.value?.source?.type, () => detail.value?.source?.data],
  () => {
    sourceFailed.value = false
  },
)

watch(
  () => detail.value?.poster,
  () => {
    posterLoaded.value = false
    posterError.value = false
  },
)

function handleRetrySource() {
  if (!detail.value?.source?.data) {
    refreshVod()
  }
  sourceFailed.value = false
  retryNonce.value += 1
}

function handleRetryFeed() {
  return retry(
    () => Promise.all([refreshVod(), refreshVodsList()]),
    () => [vodResp.value, vodsListResp.value],
  )
}

function parseEventDate(value: number | string | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null
  const asNum = typeof value === 'number' ? value : Number(value)
  const d =
    Number.isFinite(asNum) && asNum > 0
      ? new Date(asNum > 1e12 ? asNum : asNum * 1000)
      : new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

const parsedEventDate = computed(() => parseEventDate(detail.value?.event_date))

const formattedEventDate = computed(() => {
  if (!parsedEventDate.value) return ''
  return parsedEventDate.value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
})

const isoEventDate = computed(() =>
  parsedEventDate.value ? parsedEventDate.value.toISOString() : undefined,
)

const placeholderColor = computed(() => detail.value?.colors?.[0] || 'var(--color-surface-2)')

function vodToCardItem(vod: FeedVodItem, fallbackCat: string): FeedStreamItem {
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
    category_name: fallbackCat,
    viewers: String(vod.views ?? '0'),
  }
}

const recommendedItems = computed<FeedStreamItem[]>(() =>
  (detail.value?.recommended_vods ?? []).map((vod) => vodToCardItem(vod, categoryName.value)),
)

const recommendedDateMap = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const vod of detail.value?.recommended_vods ?? []) {
    const d = parseEventDate(vod.event_date)
    if (d) {
      out[vod.id] = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    }
  }
  return out
})

const seoTitle = computed(() => pageHeading.value)
const seoDescription = computed(() =>
  detail.value
    ? `Watch ${detail.value.name} (${detail.value.tag}) replay in the ${siteName} archive.`
    : `Archived sports event replay on ${siteName}.`,
)

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: () => `${seoTitle.value} · ${siteName}`,
  ogDescription: seoDescription,
  ogType: 'video.other',
})
useOgImage(() => detail.value?.poster, pageHeading)
await Promise.all([vod, vods])
if (!detail.value && !(validFeedPath('vods', slug.value) && isSnapshotUnavailable(vodError.value))) {
  throw createError({ statusCode: 404, fatal: true })
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-(--section-gap) px-4 py-(--page-padding) sm:px-6">
    <StateBlock
      v-if="isStale && detail"
      variant="stale"
      message="Archive data is older than 5 minutes."
      @retry="handleRetryFeed"
    />

    <!-- Header rendered in all states so loading, error, and empty still expose the page h1 -->
    <div class="space-y-(--replay-header-gap)">
      <nav aria-label="Breadcrumb" class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <NuxtLink to="/" class="hover:text-fg">Home</NuxtLink>
        <span>/</span>
        <NuxtLink to="/vods" class="hover:text-fg">Archive</NuxtLink>
        <span>/</span>
        <span class="truncate text-fg">{{ pageHeading }}</span>
      </nav>

      <h1 class="listing-display text-2xl text-fg sm:text-3xl">
        {{ pageHeading }}
      </h1>

      <div v-if="detail" class="flex flex-wrap items-center gap-2.5 text-xs text-muted">
        <span v-if="detail.tag" class="rounded bg-surface-2 px-2.5 py-0.5 font-medium text-fg">
          {{ detail.tag }}
        </span>
        <time v-if="formattedEventDate" :datetime="isoEventDate" class="listing-numeric">
          <span v-if="detail.tag">· </span>{{ formattedEventDate }}
        </time>
        <span class="listing-numeric">· {{ formatViewersExact(detail.views ?? 0) }} views</span>
      </div>
    </div>

    <StateBlock
      v-if="vodStatus === 'pending' && !detail"
      variant="skeleton"
      :rows="2"
    />

    <StateBlock
      v-else-if="vodError && !detail"
      variant="error"
      :message="vodError.message"
      @retry="handleRetryFeed"
    />

    <StateBlock
      v-else-if="!detail"
      variant="empty"
      message="This archived replay could not be found."
    />

    <template v-else>
      <!-- VOD player -->
      <section aria-label="Replay player" class="space-y-2.5">
        <template v-if="detail.source?.type === 'playlist' && detail.source.data && !sourceFailed">
          <div class="relative aspect-video w-full overflow-hidden rounded-listing border border-border bg-black">
            <video
              :key="`${detail.source.data}-${retryNonce}`"
              :src="detail.source.data"
              :poster="detail.poster || undefined"
              controls
              playsinline
              preload="metadata"
              class="h-full w-full"
              @error="sourceFailed = true"
            ></video>
          </div>
          <p class="text-xs text-muted">
            Native HLS stream — use Safari or an HLS-capable browser if it won't play.
          </p>
        </template>

        <div
          v-else-if="detail.source?.type === 'link' && detail.source.data"
          class="relative aspect-video w-full overflow-hidden rounded-listing border border-border bg-surface"
          :style="{ backgroundColor: placeholderColor }"
        >
          <img
            v-if="detail.poster && !posterError"
            :src="detail.poster"
            :alt="detail.name"
            width="1280"
            height="720"
            loading="lazy"
            decoding="async"
            class="h-full w-full object-cover"
            :class="posterLoaded ? 'opacity-100' : 'opacity-0'"
            @load="posterLoaded = true"
            @error="posterError = true"
          >
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/70 p-6 text-center backdrop-blur-xs">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              External replay source
            </p>
            <a
              :href="detail.source.data"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-listing bg-accent px-6 py-3 text-sm font-semibold text-accent-fg shadow-sm hover:underline"
            >
              <span>Open at source · {{ detail.tag || detail.name }}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-4 w-4"
              >
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </a>
          </div>
        </div>

        <PlayerFrame
          v-else-if="detail.source?.data && !sourceFailed"
          :key="`${detail.source.data}-${retryNonce}`"
          :src="detail.source.data"
          :title="detail.name"
          @error="sourceFailed = true"
        />

        <div
          v-else
          role="alert"
          class="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-listing border border-border bg-surface p-6 text-center"
        >
          <div class="max-w-md space-y-1.5">
            <p class="text-base font-semibold text-fg">
              No working source available
            </p>
            <p class="text-sm text-muted">
              The replay source is missing or could not be loaded. For HLS replays, use Safari or an HLS-capable browser.
            </p>
          </div>
          <button
            type="button"
            class="rounded-listing border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg hover:border-muted"
            @click="handleRetrySource"
          >
            Retry source
          </button>
        </div>
      </section>


      <!-- Recommended VODs rail when non-empty -->
      <Rail
        v-if="recommendedItems.length > 0"
        title="Recommended replays"
        :streams="recommendedItems"
        :now="nowSeconds"
        link-base="/vods"
        metric-label="views"
        :countdown-map="recommendedDateMap"
      />
    </template>
  </div>
</template>
