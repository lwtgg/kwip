<script setup lang="ts">
import { NuxtLink } from '#components'
import { useStream, useVods, type FeedStreamItem } from '~/composables/useFeed'
import { usePlayerSources } from '~/composables/usePlayerSources'
import type { SelectableSourceOption } from '~/components/SourceSelect.vue'
import { formatViewersExact } from '~/utils/viewers'

const route = useRoute()
const router = useRouter()
const { siteName, canonicalHost } = useRuntimeConfig().public

const uriName = computed(() => {
  const raw = route.params.uri
  return (Array.isArray(raw) ? raw.join('/') : String(raw || '')).replace(/^\/+|\/+$/g, '')
})

const { feed, list, detail, matchingListItem } = useStream(uriName)

const {
  data: streamResp,
  status: streamStatus,
  error: streamError,
  refresh: refreshStream,
} = feed

const {
  data: listResp,
  refresh: refreshList,
} = list

const freshAt = ref<number | null>(null)
const receivedAt = ref<number | null>(null)
watch([streamResp, listResp], (payloads, previous) => {
  if (!payloads.some(Boolean)) return

  const arrivedAt = Math.floor(Date.now() / 1000)
  receivedAt.value ??= arrivedAt
  if (payloads.some((payload, index) => payload && !payload.fromCache && payload !== previous[index])) {
    freshAt.value = arrivedAt
  }
}, { immediate: true, flush: 'sync' })

const { isStale, nowSeconds, retry } = useFeedFreshness(
  () => listResp.value?.timestamp,
  freshAt,
  receivedAt,
)

const hasEnded = computed(() => {
  const event = detail.value
  return event?.always_live === 0 && event.ends_at > 0 && nowSeconds.value >= event.ends_at
})
const replayFallback = 'Replays usually appear shortly after the final whistle.'
const ReplayLink = defineComponent({
  setup() {
    const { data } = useVods()
    const hasReplay = computed(() => data.value?.vods.some(category =>
      category.vods.some(vod => vod.uri_name === uriName.value),
    ))

    return () => hasReplay.value
      ? h(NuxtLink, {
          to: `/vods/${uriName.value}`,
          class: 'text-fg underline hover:text-accent max-md:inline-flex max-md:min-h-11 max-md:items-center',
        }, () => 'Watch the replay')
      : replayFallback
  },
})
function humanizeUri(uri: string): string {
  const last = uri.split('/').filter(Boolean).pop() || ''
  if (!last) return 'Live Event'
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

// Review #11: every state (loading, error, empty, content) renders the page `h1`.
const pageHeading = computed(
  () => detail.value?.name || matchingListItem.value?.name || humanizeUri(uriName.value),
)

const sources = computed(() => detail.value ? usePlayerSources(detail.value) : [])

const defaultSourceIndex = computed(() => {
  const nonEmptyPrimary = (detail.value?.sources ?? []).filter((s) => s.data)
  const idx = nonEmptyPrimary.findIndex((s) => s.default)
  return idx >= 0 ? idx : 0
})

const selectedSourceIndex = ref<number | null>(null)
const lastFailedIndex = ref(-1)
const retryGeneration = ref(0)
const playerWrapper = ref<HTMLElement | null>(null)
const playerHelpOpen = ref(false)
const posterLoaded = ref(false)
const posterError = ref(false)

watch(uriName, () => {
  selectedSourceIndex.value = null
  lastFailedIndex.value = -1
  retryGeneration.value = 0
  playerHelpOpen.value = false
  posterLoaded.value = false
  posterError.value = false
})

watch(
  () => detail.value?.poster,
  () => {
    posterLoaded.value = false
    posterError.value = false
  },
)

const requestedSourceIndex = computed(() => {
  const raw = route.query.source
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const index = Number(raw)
  return index < sources.value.length ? index : null
})

watch(() => route.query.source, () => {
  selectedSourceIndex.value = null
})

const activeSourceIndex = computed({
  get: () => selectedSourceIndex.value ?? requestedSourceIndex.value ?? defaultSourceIndex.value,
  set: (next: number) => {
    selectedSourceIndex.value = next
    void router.push({ query: { ...route.query, source: String(next) } })
  },
})

const chainExhausted = computed(
  () => sources.value.length === 0 || activeSourceIndex.value >= sources.value.length,
)

const currentSource = computed(() =>
  !chainExhausted.value ? sources.value[activeSourceIndex.value] ?? null : null,
)

const { isShielded, toggleShield } = usePlayerShield()
const shieldSourceKey = computed(() => {
  const source = currentSource.value
  if (!source || source.kind === 'link') return null
  return JSON.stringify([uriName.value, source.label.trim().toLowerCase(), activeSourceIndex.value])
})
const shieldEnabled = computed(() => shieldSourceKey.value !== null && isShielded(shieldSourceKey.value))

function toggleCurrentShield() {
  if (shieldSourceKey.value !== null) toggleShield(shieldSourceKey.value)
}

const playerControlClass = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius)] border text-xs font-medium hover:border-accent md:min-h-8 md:min-w-8'

async function enterFullscreen() {
  const wrapper = playerWrapper.value
  if (!wrapper || !currentSource.value?.url) return

  try {
    if (wrapper.requestFullscreen) {
      await wrapper.requestFullscreen()
      return
    }
  } catch {
    // Some in-app browsers expose fullscreen but reject requests.
  }
  const url = currentSource.value?.url
  if (!url) return

  const tab = window.open(url, '_blank')
  if (tab === null) {
    playerHelpOpen.value = true
  } else {
    tab.opener = null
  }
}

const firstRemainingLink = computed<SelectableSourceOption | null>(() => {
  return (
    sources.value.find((s, idx) => idx > lastFailedIndex.value && s.kind === 'link') ??
    sources.value.find((s) => s.kind === 'link') ??
    null
  )
})

// Review #8: advance linearly in chain order without skipping `link` entries and without wrapping to earlier iframes.
function handleFrameError() {
  const failedAt = activeSourceIndex.value
  lastFailedIndex.value = failedAt
  selectedSourceIndex.value = failedAt + 1
}

function handleRetryChain() {
  if (sources.value.length === 0) {
    refreshStream()
  }
  lastFailedIndex.value = -1
  selectedSourceIndex.value = null
  retryGeneration.value += 1
}

function handleRetryFeed() {
  return retry(
    () => Promise.all([refreshStream(), refreshList()]),
    () => [streamResp.value, listResp.value],
  )
}

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const categoryLabel = computed(
  () => detail.value?.category_name || matchingListItem.value?.category_name || '',
)

const categorySlug = computed(() =>
  categoryLabel.value ? slugifyCategory(categoryLabel.value) : '',
)

const placeholderColor = computed(() => detail.value?.colors?.[0] || 'var(--color-surface-2)')

const relatedStreams = computed<FeedStreamItem[]>(() => {
  const d = detail.value
  if (!d) return []
  const targetSlug = slugifyCategory(d.category_name)
  const out: FeedStreamItem[] = []
  for (const cat of listResp.value?.streams ?? []) {
    if (slugifyCategory(cat.category) === targetSlug) {
      for (const item of cat.streams) {
        if (item.uri_name !== d.uri_name) {
          out.push({
            ...item,
            always_live: item.always_live ?? cat.always_live,
            category_name: item.category_name || cat.category,
          })
        }
      }
    }
  }
  return out
})

const canonicalPageUrl = computed(() => `https://${canonicalHost}/live/${uriName.value}`)

const seoTitle = computed(() => pageHeading.value)
const seoDescription = computed(() =>
  detail.value
    ? `Watch ${detail.value.name} (${detail.value.category_name}) via available player sources on ${siteName}.`
    : `Live sports event player page on ${siteName}.`,
)

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: () => `${seoTitle.value} · ${siteName}`,
  ogDescription: seoDescription,
  ogType: 'video.other',
})
useOgImage(() => detail.value?.poster, pageHeading)

function parseMatchupCompetitors(name: string): { '@type': 'SportsTeam'; name: string }[] {
  const parts = name.split(/\s+(?:vs\.?|v\.?|@)\s+/i).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 2) {
    return [
      { '@type': 'SportsTeam', name: parts[0]! },
      { '@type': 'SportsTeam', name: parts[1]! },
    ]
  }
  return []
}

// Review #12: omit `startDate` / `endDate` for 24/7 channels (`starts_at === 0`), and omit `competitor` when there is no matchup.
const sportsEventJsonLd = computed(() => {
  const d = detail.value
  if (!d) return null
  const is24x7 = d.always_live === 1
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: d.name,
    url: canonicalPageUrl.value,
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'VirtualLocation',
      url: canonicalPageUrl.value,
    },
  }
  if (d.category_name) {
    ld.sport = d.category_name
  }
  if (!is24x7 && d.starts_at > 0) {
    ld.startDate = new Date(d.starts_at * 1000).toISOString()
  }
  if (!is24x7 && d.ends_at > 0) {
    ld.endDate = new Date(d.ends_at * 1000).toISOString()
  }
  const competitors = parseMatchupCompetitors(d.name)
  if (competitors.length > 0) {
    ld.competitor = competitors
  }
  return ld
})

useHead({
  script: () =>
    sportsEventJsonLd.value
      ? [
          {
            key: 'ld-sports-event',
            type: 'application/ld+json',
            innerHTML: JSON.stringify(sportsEventJsonLd.value),
          },
        ]
      : [],
})
await Promise.all([feed, list])
if (!detail.value) throw createError({ statusCode: 404, fatal: true })
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
    <StateBlock
      v-if="isStale && detail"
      variant="stale"
      message="Directory data is older than 5 minutes."
      @retry="handleRetryFeed"
    />

    <!-- Header rendered in every state so loading, error, and empty still expose the page h1 -->
    <div class="space-y-4">
      <nav aria-label="Breadcrumb" class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <NuxtLink to="/" class="hover:text-fg">Home</NuxtLink>
        <span>/</span>
        <NuxtLink
          v-if="categorySlug"
          :to="`/c/${categorySlug}`"
          class="hover:text-fg max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
        >
          {{ categoryLabel }}
        </NuxtLink>
        <span v-if="categorySlug">/</span>
        <span class="truncate text-fg">{{ pageHeading }}</span>
      </nav>

      <div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div class="space-y-2">
          <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            {{ pageHeading }}
          </h1>
          <div v-if="detail" class="flex flex-wrap items-center gap-2.5 text-xs text-muted">
            <StatusPill
              :starts-at="detail.starts_at || 0"
              :ends-at="detail.ends_at || 0"
              :always-live="detail.always_live"
              :now="nowSeconds"
            />
            <NuxtLink
              v-if="categorySlug"
              :to="`/c/${categorySlug}`"
              class="rounded bg-surface-2 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center px-2.5 py-0.5 font-medium text-fg hover:text-accent"
            >
              {{ detail.category_name }}
            </NuxtLink>
            <span v-if="detail.tag">· {{ detail.tag }}</span>
            <span>· {{ formatViewersExact(detail.viewers) }} viewers</span>
          </div>
          <LiveProgress
            v-if="detail"
            :starts-at="detail.starts_at"
            :ends-at="detail.ends_at"
            :always-live="detail.always_live"
            :now="nowSeconds"
            show-label
          />
        </div>

        <div v-if="detail" class="relative z-10 flex flex-wrap items-center gap-3">
          <SourceSelect
            v-model="activeSourceIndex"
            :sources="sources"
          />
          <button
            v-if="shieldSourceKey !== null"
            type="button"
            :aria-pressed="shieldEnabled"
            title="Reload the player to block popups and page redirects"
            class="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 text-xs font-medium hover:border-accent sm:min-h-8"
            :class="shieldEnabled ? 'border-accent text-accent' : 'border-border text-fg'"
            @click="toggleCurrentShield"
          >
            <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
              <path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z" />
            </svg>
            Shield
          </button>
          <template v-if="currentSource?.kind === 'iframe'">
            <button
              type="button"
              aria-label="Fullscreen"
              title="Fullscreen"
              :class="[playerControlClass, 'border-border text-fg']"
              @click="enterFullscreen"
            >
              <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Player help"
              :aria-pressed="playerHelpOpen"
              title="Not playing?"
              :class="[playerControlClass, playerHelpOpen ? 'border-accent text-accent' : 'border-border text-fg']"
              @click="playerHelpOpen = !playerHelpOpen"
            >
              <span aria-hidden="true">?</span>
            </button>
          </template>
          <p v-if="shieldEnabled" class="basis-full text-xs text-muted">
            Popups and page redirects are blocked. Some players may stop working.
            <button type="button" class="text-fg underline hover:text-accent" @click="toggleCurrentShield">
              Reload without shield
            </button>
          </p>
          <p v-if="playerHelpOpen && currentSource?.kind === 'iframe'" class="basis-full text-xs text-muted">
            If the picture stays black, reload the frame or open it in a new tab.
            <button
              type="button"
              class="inline-flex items-center text-fg underline hover:text-accent max-md:min-h-11"
              @click="retryGeneration += 1"
            >
              Reload player
            </button>
            <a
              :href="currentSource.url"
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center text-fg underline hover:text-accent max-md:min-h-11"
            >
              Open in new tab
            </a>
          </p>
        </div>
      </div>
    </div>

    <StateBlock
      v-if="streamStatus === 'pending' && !detail"
      variant="skeleton"
      :rows="2"
    />

    <StateBlock
      v-else-if="streamError && !detail"
      variant="error"
      :message="streamError.message"
      @retry="handleRetryFeed"
    />

    <StateBlock
      v-else-if="!detail"
      variant="empty"
      message="This event could not be found in the feed."
    />

    <template v-else>
      <!-- Player frame (iframe) or outbound link block or exhausted-chain fallback -->
      <section aria-label="Event player">
        <p v-if="hasEnded" class="w-full border-t border-border py-2 text-xs text-muted">
          This event has ended.
          <ClientOnly>
            <ReplayLink />
            <template #fallback>{{ replayFallback }}</template>
          </ClientOnly>
        </p>
        <div
          v-if="!chainExhausted && currentSource && currentSource.kind === 'link'"
          class="relative aspect-video w-full overflow-hidden rounded-[var(--radius)] border border-border bg-surface"
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
            class="h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-300"
            :class="posterLoaded ? 'opacity-100' : 'opacity-0'"
            @load="posterLoaded = true"
            @error="posterError = true"
          >
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/70 p-6 text-center backdrop-blur-xs">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              External player source
            </p>
            <a
              :href="currentSource.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-[var(--radius)] bg-accent px-6 py-3 text-sm font-semibold text-accent-fg shadow-sm hover:opacity-90"
            >
              <span>Open at source · {{ currentSource.label }}</span>
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

        <div
          v-else-if="!chainExhausted && currentSource"
          ref="playerWrapper"
          class="[&:fullscreen>*]:h-full"
        >
          <PlayerFrame
            :key="`${activeSourceIndex}-${retryGeneration}`"
            :src="currentSource.url"
            :title="`${detail.name} — ${currentSource.label}`"
            :sandbox="shieldEnabled ? 'allow-scripts allow-same-origin allow-presentation' : undefined"
            @error="handleFrameError"
          />
        </div>

        <div
          v-else
          role="alert"
          class="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-[var(--radius)] border border-border bg-surface p-6 text-center"
        >
          <div class="max-w-md space-y-1.5">
            <p class="text-base font-semibold text-fg">
              No working source available
            </p>
            <p class="text-sm text-muted">
              Every embedded player source in the chain timed out or reported an error.
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <a
              v-if="firstRemainingLink"
              :href="firstRemainingLink.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-[var(--radius)] bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:opacity-90"
            >
              <span>Open at source · {{ firstRemainingLink.label }}</span>
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
            <button
              type="button"
              class="rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg hover:border-accent"
              @click="handleRetryChain"
            >
              Retry sources
            </button>
          </div>
        </div>
      </section>

      <!-- Review #2: Reserved 970×90 / 320×100 AdSlot immediately below player, before related streams -->
      <AdSlot format="leaderboard" />

      <!-- Related streams in same category -->
      <section class="space-y-3">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-lg font-semibold tracking-tight text-fg">
            Related in {{ detail.category_name }}
          </h2>
          <NuxtLink
            v-if="categorySlug"
            :to="`/c/${categorySlug}`"
            class="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-xs font-medium text-muted hover:text-accent"
          >
            More {{ detail.category_name }} →
          </NuxtLink>
        </div>

        <div
          v-if="relatedStreams.length > 0"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StreamCard
            v-for="stream in relatedStreams"
            :key="stream.id"
            :stream="stream"
            :now="nowSeconds"
          />
        </div>
        <StateBlock
          v-else
          variant="empty"
          :message="`No other ${detail.category_name} events are listed right now.`"
        />
      </section>
    </template>
  </div>
</template>
