<script setup lang="ts">
import { NuxtLink } from '#components'
import { validFeedPath } from '~~/server/utils/feed-path'
import { isSnapshotUnavailable, useStream, useVods, type FeedStreamItem } from '~/composables/useFeed'
import { usePlayerSources, type SourceOption } from '~/composables/usePlayerSources'
import { sourceHealth, type SourceHealthEntry } from '~/utils/sourceHealth'
import { sourceHost, sourceKey } from '~/utils/sourceIdentity'
import type { SelectableSourceOption } from '~/components/SourceSelect.vue'
import { isCachedSupplement, isSupplementHost, loadSupplementSources, type SupplementSource } from '~/utils/strmfree'
import { formatViewersExact } from '~/utils/viewers'
import { canClickUnder, isClickUnderEligible, openClickUnder } from '~/utils/clickUnder'

const route = useRoute()
const router = useRouter()
const { siteName, canonicalHost, feedBase, ads } = useRuntimeConfig().public

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
      ? h(NuxtLink, { to: `/vods/${encodeURIComponent(uriName.value)}`, class: replayLinkClass }, () => 'Watch the replay')
      : replayFallback
  },
})
const replayLinkClass = 'text-fg underline hover:text-accent max-md:inline-flex max-md:min-h-11 max-md:items-center'

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

type SupplementState =
  | { status: 'idle' | 'loading' | 'none' | 'error' }
  | { status: 'merged'; fetchedAt: number; sources: SupplementSource[] }

const supplement = shallowRef<SupplementState>({ status: 'idle' })
onBeforeUnmount(() => { supplement.value = { status: 'idle' } })

const sources = computed(() => usePlayerSources({
  sources: [
    ...(detail.value?.sources ?? []),
    ...(supplement.value.status === 'merged' ? supplement.value.sources : []),
  ],
}))

async function loadSupplement() {
  const event = detail.value
  const now = Date.now()
  if (supplement.value.status !== 'idle'
    || !event || event.always_live === 1
    || !(event.starts_at > 0 && event.starts_at <= now / 1000 && event.ends_at > now / 1000)) return

  const storageKey = `supplement:v5:${uriName.value}`
  try {
    const cached = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
    if (isCachedSupplement(cached, now)) {
      supplement.value = cached
      return
    }
  } catch {
    // Storage may be unavailable in this browser.
  }

  const loading = { status: 'loading' } as const
  const slug = categorySlug.value
  supplement.value = loading
  try {
    const fixtures = /(?:^|\/)fixtures\/?$/.test(feedBase)
    const api = 'https://strmfree.pk/api/v1'
    const endpoint = fixtures ? '/fixtures/strmfree.json' : `${api}/streams`
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error('Second provider request failed')
    const payload = await response.json()
    if (supplement.value !== loading) return
    const matched = await loadSupplementSources(event, slug, payload, fixtures ? undefined
      : key => fetch(`${api}/sources/${encodeURIComponent(key)}`))
    if (supplement.value !== loading) return
    if (matched === null) {
      supplement.value = { status: 'none' }
      return
    }

    const merged = { status: 'merged', fetchedAt: Date.now(), sources: matched } as const
    supplement.value = merged
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(merged))
    } catch {
      // The current page can still use the match.
    }
  } catch {
    if (supplement.value === loading) supplement.value = { status: 'error' }
  }
}

const feedSources = computed(() => (detail.value?.sources ?? []).filter((source) => source.data))

const defaultSourceKey = computed(() => {
  const preferred = feedSources.value.find((source) => source.default)
  const first = preferred ?? feedSources.value[0]
  return first ? sourceKey(first.data) : null
})

function findRequestedSource(options: SourceOption[], query: unknown) {
  const direct = options.find(source => source.key === query)
  if (direct || typeof query !== 'string' || !/^\d+$/.test(query)) return direct
  const entry = feedSources.value[Number(query)]
  return entry ? options.find(source => source.key === sourceKey(entry.data)) : undefined
}

const renderNoscriptPlayer = import.meta.server
const initialFeedSource = computed(() =>
  findRequestedSource(sources.value, route.query.source)
    ?? sources.value.find(source => source.key === defaultSourceKey.value),
)

function isSupplementQuery(query: unknown) {
  return typeof query === 'string'
    && !feedSources.value.some(source => sourceKey(source.data) === query)
    && isSupplementHost(sourceHost('https://' + query))
}

const pickedSupplementKeys = new Set<string>()
const selectedSourceKey = ref<string | null>(null)
let chainExhausted = false
const requestedSourceKey = ref<string | null>(null)
const anchorKey = ref<string | null>(null)
const attemptFailures = reactive(new Set<string>())
const rememberedHealth = shallowRef<SourceHealthEntry | null>(null)
const rememberedFailures = computed(() => rememberedHealth.value?.keys ?? [])
const failedKeys = computed(() => new Set([...attemptFailures, ...rememberedFailures.value]))
let healthSession: Storage | null = null

function eventHealth() {
  return sourceHealth(healthSession, uriName.value)
}

function expireRememberedHealth() {
  if (rememberedHealth.value && rememberedHealth.value.expiresAt <= Date.now()) {
    rememberedHealth.value = null
  }
}

watch(rememberedHealth, (entry, _, onCleanup) => {
  if (!entry) return
  const timeout = setTimeout(expireRememberedHealth, Math.max(0, entry.expiresAt - Date.now()))
  onCleanup(() => clearTimeout(timeout))
})

function forgetFailure(key: string, remount = true) {
  expireRememberedHealth()
  if (!rememberedFailures.value.includes(key)) return
  rememberedHealth.value = eventHealth().forget(key, rememberedHealth.value)
  if (remount) retryGeneration.value += 1
}

function clearFailures() {
  eventHealth().clear()
  rememberedHealth.value = null
}
const seenKeys = new Set<string>()
const beforeKeys = new Set<string>()
let sourceWriteId = 0
let pendingTargetKey: string | null = null
const mounted = ref(false)
const retryGeneration = ref(0)
const playerWrapper = ref<HTMLElement | null>(null)
const playerHelpOpen = ref(false)
const posterLoaded = ref(false)
const posterError = ref(false)

watch(uriName, () => {
  supplement.value = { status: 'idle' }
  pickedSupplementKeys.clear()
  rememberedHealth.value = eventHealth().readEntry()
  resetAttempt(null)
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

const currentSource = computed(() =>
  sources.value.find((source) => source.key === selectedSourceKey.value) ?? null,
)

let clickSession: Storage | null = null
let openAdvertiser: Window['open'] | undefined
const adAvailable = ref(false)
const announceAd = computed(() =>
  adAvailable.value && isClickUnderEligible(detail.value, nowSeconds.value),
)

function handleAdvertiserClick(event: MouseEvent, placement: 'source' | 'play', alreadySelected = false) {
  if (!event.isTrusted || !clickSession || !openAdvertiser ||
    !canClickUnder(ads === true, clickSession,
      isClickUnderEligible(detail.value, Date.now() / 1000), alreadySelected)) return false
  const opened = openClickUnder(clickSession, placement, openAdvertiser)
  adAvailable.value = !opened && canClickUnder(true, clickSession, true)
  return opened
}

function handlePrimaryPlay(event: MouseEvent) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  if (!handleAdvertiserClick(event, 'play')) return
  // Reserve the new tab for the advertiser and let the link open in this tab.
  const link = event.currentTarget as HTMLAnchorElement
  link.target = '_self'
  setTimeout(() => { link.target = '_blank' }, 0)
}

function isAutomaticSource(uri: string, key: unknown) {
  return typeof key === 'string'
    && router.options.history.state.automaticSource === JSON.stringify([uri, key])
}

async function writeSourceQuery(key: string, replace = false) {
  const target = sources.value.find(source => source.key === key)
  if (target?.origin === 'supplement' && !pickedSupplementKeys.has(key)) return

  const clearAutomaticSelection = !replace && route.query.source === key && isAutomaticSource(uriName.value, key)
  const writeId = ++sourceWriteId
  pendingTargetKey = key

  try {
    await router.push({
      query: { ...route.query, source: key },
      replace: replace || clearAutomaticSelection,
      force: clearAutomaticSelection,
      state: { automaticSource: replace ? JSON.stringify([uriName.value, key]) : null },
    })
    await nextTick()
  } finally {
    if (writeId === sourceWriteId) pendingTargetKey = null
  }
}

onMounted(() => {
  try {
    healthSession = window.sessionStorage
  } catch {
    // Session storage may be unavailable.
  }
  rememberedHealth.value = eventHealth().readEntry()
  if (ads === true && healthSession) {
    try {
      clickSession = healthSession
      openAdvertiser = window.open.bind(window)
      adAvailable.value = canClickUnder(true, clickSession, true)
    } catch {
      // A session without storage cannot be capped reliably.
    }
  }
  void loadSupplement()
  mounted.value = true
})

const activeSourceKey = computed({
  get: () => currentSource.value?.key ?? null,
  set: (key: string | null) => {
    if (key === null) return
    if (sources.value.some(source => source.key === key && source.origin === 'supplement')) {
      pickedSupplementKeys.add(key)
    }
    forgetFailure(key)
    resetAttempt(key)
    requestedSourceKey.value = key
    selectedSourceKey.value = key
    void writeSourceQuery(key)
  },
})

const { isShielded, toggleShield } = usePlayerShield()
const shieldSourceKey = computed(() => {
  const source = currentSource.value
  if (!source || source.kind === 'link') return null
  // Keep stored preferences keyed to the original feed name and position.
  const feedIndex = feedSources.value.findIndex((entry) => entry.data === source.url)
  const feedSource = feedSources.value[feedIndex]
  return feedSource ? JSON.stringify([uriName.value, feedSource.name.trim().toLowerCase(), feedIndex]) : null
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

const firstRemainingLink = computed<SelectableSourceOption | null>(() =>
  sources.value.find((source) => source.kind === 'link') ?? null,
)

function setAttemptAnchor(key: string | null) {
  anchorKey.value = key
  beforeKeys.clear()
  const anchorAt = sources.value.findIndex((source) => source.key === anchorKey.value)
  if (anchorAt < 0) return

  for (const source of sources.value.slice(0, anchorAt)) beforeKeys.add(source.key)
}

function resetAttempt(key: string | null) {
  chainExhausted = false
  setAttemptAnchor(key)
  attemptFailures.clear()
  seenKeys.clear()
  for (const source of sources.value) seenKeys.add(source.key)
}

function nextPlayableKey(options: SourceOption[], activeKey: string | null): string | null {
  expireRememberedHealth()
  const activeAt = options.findIndex((source) => source.key === activeKey)
  return options.find((source, index) =>
    index > activeAt && !failedKeys.value.has(source.key)
    && (!seenKeys.has(source.key) || !beforeKeys.has(source.key)),
  )?.key ?? null
}

function handleFrameError() {
  const key = currentSource.value?.key
  if (!mounted.value || key === undefined) return

  expireRememberedHealth()
  rememberedHealth.value = eventHealth().record(key, rememberedHealth.value)
  attemptFailures.add(key)
  selectedSourceKey.value = nextPlayableKey(sources.value, key)
  chainExhausted = selectedSourceKey.value === null
  if (selectedSourceKey.value !== null) void writeSourceQuery(selectedSourceKey.value, true)
}

function handleReloadPlayer() {
  if (currentSource.value?.origin === 'supplement') {
    const key = defaultSourceKey.value
    requestedSourceKey.value = key
    selectedSourceKey.value = key
    resetAttempt(key)
    if (key !== null && isSupplementQuery(route.query.source)) void writeSourceQuery(key, true)
  }
  supplement.value = { status: 'idle' }
  retryGeneration.value += 1
}

function handleRetryChain() {
  clearFailures()
  if (sources.value.length === 0) {
    refreshStream()
  }
  const key = sources.value.find((source) => source.key === requestedSourceKey.value)?.key
    ?? defaultSourceKey.value
  resetAttempt(key)
  selectedSourceKey.value = key
  if (key !== null) void writeSourceQuery(key, true)
  retryGeneration.value += 1
}

function handleRetryFeed() {
  clearFailures()
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
if (!detail.value && !(validFeedPath('streams', uriName.value) && isSnapshotUnavailable(streamError.value))) {
  throw createError({ statusCode: 404, fatal: true })
}

let pendingSourceQuery = true
watch([uriName, () => route.query.source, sources, mounted, supplement], ([uri, query, options, ready], [previousUri, previousQuery, , wasReady]) => {
  if (!ready) {
    selectedSourceKey.value = initialFeedSource.value?.key ?? null
    return
  }
  if (uri !== previousUri || query !== previousQuery) {
    const internal = uri === previousUri && pendingTargetKey !== null && pendingTargetKey === query
    if (!internal) {
      sourceWriteId += 1
      pendingTargetKey = null
      pendingSourceQuery = true
    }
  }

  if (pendingSourceQuery) {
    if (options.length === 0) {
      requestedSourceKey.value = null
      selectedSourceKey.value = null
      return
    }

    const automaticSource = isAutomaticSource(uri, query)
    const requested = automaticSource ? undefined : findRequestedSource(options, query)
    if (!requested && !automaticSource && isSupplementQuery(query)) {
      if (supplement.value.status === 'idle') void loadSupplement()
      if (supplement.value.status === 'loading') return
    }
    if (requested?.origin === 'supplement') pickedSupplementKeys.add(requested.key)
    if (requested) forgetFailure(requested.key, wasReady === true)
    requestedSourceKey.value = requested?.key ?? null
    resetAttempt(null)
    expireRememberedHealth()
    const preferred = defaultSourceKey.value
    selectedSourceKey.value = requestedSourceKey.value
      ?? (preferred !== null && !failedKeys.value.has(preferred) ? preferred : nextPlayableKey(options, null))
    setAttemptAnchor(selectedSourceKey.value)
    chainExhausted = selectedSourceKey.value === null
    pendingSourceQuery = false
    if (!automaticSource && query !== undefined && !requested && selectedSourceKey.value !== null) {
      void writeSourceQuery(selectedSourceKey.value, true)
    }
  } else if (chainExhausted && supplement.value.status === 'merged') {
    expireRememberedHealth()
    const nextKey = options.find(source =>
      source.origin === 'supplement' && !seenKeys.has(source.key) && !failedKeys.value.has(source.key),
    )?.key
    if (nextKey) {
      selectedSourceKey.value = nextKey
      chainExhausted = false
    }
  } else if (!chainExhausted && !options.some((source) => source.key === selectedSourceKey.value)) {
    const nextKey = nextPlayableKey(options, selectedSourceKey.value)
    selectedSourceKey.value = nextKey
    if (anchorKey.value === null) setAttemptAnchor(nextKey)
    if (nextKey !== null) void writeSourceQuery(nextKey, true)
  }

  // Compare against earlier snapshots before recording the refreshed keys.
  for (const source of options) seenKeys.add(source.key)
}, { immediate: true })
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-(--section-gap) px-4 py-(--page-inset) sm:px-6">
    <StateBlock
      v-if="isStale && detail"
      variant="stale"
      message="Directory data is older than 5 minutes."
      @retry="handleRetryFeed"
    />

    <!-- Header rendered in every state so loading, error, and empty still expose the page h1 -->
    <div class="space-y-[calc(var(--section-gap)/2)]">
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

      <div class="flex flex-col justify-between gap-x-4 gap-y-[calc(var(--section-gap)/2)] lg:flex-row lg:items-end">
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
            v-model="activeSourceKey"
            :sources="sources"
            :click-under="announceAd"
            :failed-keys="rememberedFailures"
            :noscript-source-key="initialFeedSource?.key"
            @source-click="(event, key) => handleAdvertiserClick(event, 'source', key === activeSourceKey)"
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
              @click="handleReloadPlayer"
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
          <NuxtLink
            v-if="streamResp?.fromSnapshot && streamResp.hasSnapshotReplay"
            :to="`/vods/${encodeURIComponent(uriName)}`"
            :class="replayLinkClass"
          >Watch the replay</NuxtLink>
          <ClientOnly
            v-else-if="!streamResp?.fromSnapshot && validFeedPath('vods', uriName)"
          >
            <ReplayLink />
            <template #fallback>{{ replayFallback }}</template>
          </ClientOnly>
          <template v-else>{{ replayFallback }}</template>
        </p>
        <div
          v-if="currentSource && currentSource.kind === 'link'"
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
              :aria-label="announceAd ? `Open at source · ${currentSource.label}. Standard activation may open the source in this tab and an advertiser in a new tab` : undefined"
              class="inline-flex items-center gap-2 rounded-[var(--radius)] bg-accent px-6 py-3 text-sm font-semibold text-accent-fg shadow-sm hover:opacity-90"
              @click="handlePrimaryPlay"
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
          v-else-if="currentSource"
          ref="playerWrapper"
          class="[&:fullscreen>*]:h-full"
        >
          <PlayerFrame
            :key="`${retryGeneration}:${currentSource.key}`"
            :src="mounted && !rememberedFailures.includes(currentSource.key) ? currentSource.url : undefined"
            :poster="detail.poster"
            :title="`${detail.name} — ${currentSource.label}`"
            :sandbox="shieldEnabled ? 'allow-scripts allow-same-origin allow-presentation' : undefined"
            @error="handleFrameError"
          />
          <noscript v-once data-allow-mismatch="children">
            <iframe
              v-if="renderNoscriptPlayer"
              :src="currentSource.url"
              :title="`${detail.name} — ${currentSource.label}`"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
              class="aspect-video w-full rounded-[var(--radius)] border border-border bg-surface"
            />
          </noscript>
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
              {{ supplement.status === 'merged' && sources.some(source => source.origin === 'supplement' && failedKeys.has(source.key))
                ? 'The second provider’s players also timed out or reported an error.'
                : 'Every embedded player source in the chain timed out or reported an error.' }}
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

      <AdSlot format="leaderboard" placement="event-banner" />

      <!-- Related streams in same category -->
      <section class="space-y-[calc(var(--page-inset)/2)]">
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
          class="grid grid-cols-1 gap-(--grid-gap) sm:grid-cols-2 lg:grid-cols-4"
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
