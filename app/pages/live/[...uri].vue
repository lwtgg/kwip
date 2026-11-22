<script setup lang="ts">
import { isFreshSnapshotHealth, SNAPSHOT_HEALTH_MAX_AGE_MS, type SnapshotHealth } from '~/utils/snapshotHealth'
import { NuxtLink } from '#components'
import { validFeedPath } from '~~/server/utils/feed-path'
import { isSnapshotUnavailable, isSupplementSource, useStream, useVods, type FeedStreamItem } from '~/composables/useFeed'
import { usePlayerSources, type SourceOption } from '~/composables/usePlayerSources'
import { sourceHealth, type SourceHealthEntry } from '~/utils/sourceHealth'
import { sourceHost, sourceKey, sourceLabel } from '~/utils/sourceIdentity'
import type { SelectableSourceOption } from '~/components/SourceSelect.vue'
import { isCachedSupplement, isSupplementHost, loadSupplementSources, type SupplementSource } from '~/utils/strmfree'
import { slugifyCategory } from '~/utils/supplementMatch'
import { formatViewersExact } from '~/utils/viewers'
import { canClickUnder, isClickUnderEligible, openClickUnder } from '~/utils/clickUnder'

const route = useRoute()
const router = useRouter()
const { siteName, canonicalHost, feedBase, ads } = useRuntimeConfig().public

const uriName = computed(() => {
  const raw = route.params.uri
  return (Array.isArray(raw) ? raw.join('/') : String(raw || '')).replace(/^\/+|\/+$/g, '')
})

const { feed, list, detail, matchingListItem, publishedDetail } = useStream(uriName)

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
const replayLinkClass = 'text-fg underline hover:decoration-muted max-md:inline-flex max-md:min-h-11 max-md:items-center'

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

const snapshotHealth = shallowRef<SnapshotHealth>()
const hasPublishedStrmfree = computed(() => publishedDetail.value?.sources.some(source => source.origin === 'supplement') ?? false)
const playerInput = computed(() => ({
  hasPublishedSupplement: hasPublishedStrmfree.value,
  locale: detail.value?.locale,
  source_tag: detail.value?.source_tag,
  sources: [
    ...(detail.value?.sources ?? []),
    ...(!hasPublishedStrmfree.value && supplement.value.status === 'merged' ? supplement.value.sources : []),
  ],
}))
const attemptSources = computed(() => usePlayerSources(playerInput.value))
const sources = computed(() => snapshotHealth.value
  ? usePlayerSources(playerInput.value, snapshotHealth.value)
  : attemptSources.value)

onMounted(() => {
  watch([
    () => detail.value?.uri_name,
    () => publishedDetail.value?.healthGeneration,
  ], ([uri, generation], _, onCleanup) => {
    snapshotHealth.value = undefined
    if (!uri || !generation) return
    const controller = new AbortController()
    let expiry: ReturnType<typeof setTimeout> | undefined
    onCleanup(() => {
      controller.abort()
      clearTimeout(expiry)
    })
    function apply(health: SnapshotHealth) {
      if (controller.signal.aborted) return
      const now = Date.now()
      const fresh = Object.entries(health).filter(([, entry]) => isFreshSnapshotHealth(entry, now))
      if (!fresh.length) {
        snapshotHealth.value = undefined
        return
      }
      const entries = Object.fromEntries(fresh)
      snapshotHealth.value = entries
      const nextExpiry = Math.min(...fresh.map(([, entry]) => Date.parse(entry.checkedAt) + SNAPSHOT_HEALTH_MAX_AGE_MS))
      expiry = setTimeout(() => apply(entries), nextExpiry - now)
    }
    void $fetch<SnapshotHealth>('/api/source-health', {
      query: { generation },
      signal: controller.signal,
    }).then(apply).catch(() => {})
  }, { immediate: true, flush: 'sync' })
})

async function loadSupplement(skipCache = false) {
  const event = detail.value
  const now = Date.now()
  if (hasPublishedStrmfree.value || supplement.value.status !== 'idle'
    || !event || event.always_live === 1
    || !(event.starts_at > 0 && event.starts_at <= now / 1000 && event.ends_at > now / 1000)) return

  // Older entries may record failed status requests as offline.
  const storageKey = `supplement:v6:${uriName.value}`
  try {
    const cached = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
    if (!skipCache && isCachedSupplement(cached, now) && (cached.eventId === undefined || cached.eventId === String(event.id))) {
      supplement.value = cached
      return
    }
  } catch {
    // Storage may be unavailable in this browser.
  }

  const loading = { status: 'loading' } as const
  const slug = categorySlug.value
  supplement.value = loading
  function stillNeeded() {
    if (supplement.value !== loading) return false
    if (!hasPublishedStrmfree.value) return true
    supplement.value = { status: 'idle' }
    return false
  }
  try {
    const fixtures = /(?:^|\/)fixtures\/?$/.test(feedBase)
    const api = 'https://strmfree.pk/api/v1'
    const endpoint = fixtures ? '/fixtures/strmfree.json' : `${api}/streams`
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error('Second provider request failed')
    const payload = await response.json()
    if (!stillNeeded()) return
    const matched = await loadSupplementSources(event, slug, payload, fixtures ? undefined
      : key => fetch(`${api}/sources/${encodeURIComponent(key)}`))
    if (!stillNeeded()) return
    if (matched === null) {
      supplement.value = { status: 'none' }
      return
    }

    const merged = { status: 'merged', fetchedAt: Date.now(), eventId: String(event.id), sources: matched } as const
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

const feedSources = computed(() => (detail.value?.sources ?? [])
  .filter(source => source.data && !isSupplementSource(source)))

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
  if (target?.origin && !pickedSupplementKeys.has(key)) return

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
    if (sources.value.some(source => source.key === key && source.origin)) {
      pickedSupplementKeys.add(key)
    }
    forgetFailure(key)
    resetAttempt(key)
    requestedSourceKey.value = key
    selectedSourceKey.value = key
    void writeSourceQuery(key)
  },
})

const { isShielded, toggleShield, reconcile } = usePlayerShield()
const shieldSources = computed(() => {
  const identities = new Map<string, { name: string; group: string; member: string }>()
  for (const entry of playerInput.value.sources) {
    const key = sourceKey(entry.data)
    if (!key || identities.has(key) || entry.type !== 'iframe') continue

    const substreamName = 'substreamName' in entry && typeof entry.substreamName === 'string'
      ? entry.substreamName
      : undefined
    const name = sourceLabel({ data: entry.data, name: entry.name, substreamName }, 0).toLowerCase()
    const variant = 'sourceTag' in entry && typeof entry.sourceTag === 'string'
      ? entry.sourceTag.trim().toLowerCase()
      : ''
    const group = `name:${JSON.stringify([name, sourceHost(entry.data), variant])}`
    identities.set(key, { name, group, member: `source:${key}` })
  }
  return identities
})
const shieldIdentity = computed(() => {
  const source = currentSource.value
  if (source?.kind !== 'iframe') return null
  return shieldSources.value.get(source.key) ?? null
})
const shieldRoster = computed(() => {
  const group = shieldIdentity.value?.group
  return [...shieldSources.value.values()].filter(source => source.group === group).map(source => source.member)
})
const shieldEnabled = computed(() => {
  const identity = shieldIdentity.value
  return identity !== null && isShielded(identity.group, identity.member)
})

watchEffect(() => {
  const source = currentSource.value
  const identity = shieldIdentity.value
  if (!source || !identity) return

  const { name, group, member } = identity
  const roster = shieldRoster.value
  // Old name-only choices have no member information in a colliding group.
  const aliases = [member, JSON.stringify([name, source.key])]
  if (roster.length === 1) aliases.push(name, group)
  const feedIndex = feedSources.value.findIndex(candidate => candidate.data === source.url)
  const feedSource = feedSources.value[feedIndex]
  if (feedSource) aliases.push(JSON.stringify([uriName.value, feedSource.name.trim().toLowerCase(), feedIndex]))
  reconcile(group, member, roster, aliases)
})

function toggleCurrentShield() {
  const identity = shieldIdentity.value
  if (identity) toggleShield(identity.group, identity.member, shieldRoster.value)
}

const playerControlClass = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-listing border text-xs font-medium hover:border-muted md:min-h-8 md:min-w-8'

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
  const anchorAt = attemptSources.value.findIndex((source) => source.key === anchorKey.value)
  if (anchorAt < 0) return

  for (const source of attemptSources.value.slice(0, anchorAt)) beforeKeys.add(source.key)
}

function resetAttempt(key: string | null) {
  chainExhausted = false
  setAttemptAnchor(key)
  attemptFailures.clear()
  seenKeys.clear()
  for (const source of sources.value) seenKeys.add(source.key)
}

function nextPlayableKey(activeKey: string | null): string | null {
  const options = attemptSources.value
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
  selectedSourceKey.value = nextPlayableKey(key)
  chainExhausted = selectedSourceKey.value === null
  if (selectedSourceKey.value !== null) void writeSourceQuery(selectedSourceKey.value, true)
}

function handleReloadPlayer() {
  if (currentSource.value?.origin === 'pitsport' ||
    (hasPublishedStrmfree.value && currentSource.value?.origin === 'supplement')) {
    retryGeneration.value += 1
    return
  }
  if (currentSource.value?.origin === 'supplement') {
    const key = defaultSourceKey.value
    requestedSourceKey.value = key
    selectedSourceKey.value = key
    resetAttempt(key)
    if (key !== null && findRequestedSource(sources.value, route.query.source)?.origin === 'supplement') {
      void writeSourceQuery(key, true)
    }
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
let observedEvent: { uri: string; id: string } | undefined
watch([uriName, () => detail.value?.id, hasPublishedStrmfree], ([uri, id, published], previous) => {
  if (observedEvent?.uri !== uri) observedEvent = undefined
  if (id === undefined) return
  const changed = !!observedEvent && observedEvent.id !== String(id)
  observedEvent = { uri, id: String(id) }
  if (changed) supplement.value = { status: 'idle' }
  if (mounted.value && !published && (changed || previous?.[2])) {
    if (changed || !sources.value.some(source => source.key === selectedSourceKey.value)) pendingSourceQuery = true
    void loadSupplement(changed)
  }
}, { immediate: true })
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
    if (requested?.origin) pickedSupplementKeys.add(requested.key)
    if (requested) forgetFailure(requested.key, wasReady === true)
    requestedSourceKey.value = requested?.key ?? null
    resetAttempt(null)
    expireRememberedHealth()
    const preferred = defaultSourceKey.value
    selectedSourceKey.value = requestedSourceKey.value
      ?? (preferred !== null && !failedKeys.value.has(preferred) ? preferred : nextPlayableKey(null))
    setAttemptAnchor(selectedSourceKey.value)
    chainExhausted = selectedSourceKey.value === null
    pendingSourceQuery = false
    if (!automaticSource && query !== undefined && !requested && selectedSourceKey.value !== null) {
      void writeSourceQuery(selectedSourceKey.value, true)
    }
  } else if (chainExhausted) {
    expireRememberedHealth()
    const nextKey = options.find(source =>
      source.origin && !seenKeys.has(source.key) && !failedKeys.value.has(source.key),
    )?.key
    if (nextKey) {
      selectedSourceKey.value = nextKey
      chainExhausted = false
    }
  } else if (!chainExhausted && !options.some((source) => source.key === selectedSourceKey.value)) {
    const nextKey = nextPlayableKey(selectedSourceKey.value)
    selectedSourceKey.value = nextKey
    if (anchorKey.value === null) setAttemptAnchor(nextKey)
    if (nextKey !== null) void writeSourceQuery(nextKey, true)
  }

  // Compare against earlier snapshots before recording the refreshed keys.
  for (const source of options) seenKeys.add(source.key)
}, { immediate: true })
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-(--section-gap) px-4 py-(--page-padding) sm:px-6">
    <StateBlock
      v-if="isStale && detail"
      variant="stale"
      message="Directory data is older than 5 minutes."
      @retry="handleRetryFeed"
    />

    <!-- Header rendered in every state so loading, error, and empty still expose the page h1 -->
    <div class="space-y-(--stack-gap)">
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

      <div class="flex flex-col justify-between gap-x-4 gap-y-(--stack-gap) lg:flex-row lg:items-end">
        <div class="space-y-2">
          <h1 class="listing-display text-2xl text-fg sm:text-3xl">
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
              class="rounded-listing bg-surface-2 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center px-2.5 py-0.5 font-medium text-fg hover:underline"
            >
              {{ detail.category_name }}
            </NuxtLink>
            <span v-if="detail.tag">· {{ detail.tag }}</span>
            <span class="listing-numeric">· {{ formatViewersExact(detail.viewers) }} viewers</span>
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
            v-if="shieldIdentity !== null"
            type="button"
            :aria-pressed="shieldEnabled"
            aria-describedby="player-shield-description"
            class="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-listing border px-2.5 text-xs font-medium text-fg hover:border-muted sm:min-h-8"
            :class="shieldEnabled ? 'border-muted bg-surface-2 underline underline-offset-4' : 'border-border'"
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
              :class="[playerControlClass, playerHelpOpen ? 'border-muted bg-surface-2 text-fg' : 'border-border text-fg']"
              @click="playerHelpOpen = !playerHelpOpen"
            >
              <span aria-hidden="true">?</span>
            </button>
          </template>
          <p v-if="shieldIdentity !== null" id="player-shield-description" class="basis-full text-xs text-muted">
            Shield reloads this player to block popups and page redirects.
          </p>
          <p v-if="playerHelpOpen && currentSource?.kind === 'iframe'" class="basis-full text-xs text-muted">
            If the picture stays black, reload the frame or open it in a new tab.
            <button
              type="button"
              class="inline-flex items-center text-fg underline hover:decoration-muted max-md:min-h-11"
              @click="handleReloadPlayer"
            >
              Reload player
            </button>
            <a
              :href="currentSource.url"
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center text-fg underline hover:decoration-muted max-md:min-h-11"
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
              External player source
            </p>
            <a
              :href="currentSource.url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="announceAd ? `Open at source · ${currentSource.label}. Standard activation may open the source in this tab and an advertiser in a new tab` : undefined"
              class="inline-flex items-center gap-2 rounded-listing bg-accent px-6 py-3 text-sm font-semibold text-accent-fg shadow-sm hover:underline"
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
              class="aspect-video w-full rounded-listing border border-border bg-surface"
            />
          </noscript>
        </div>

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
              class="inline-flex items-center gap-2 rounded-listing bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:underline"
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
              class="rounded-listing border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-fg hover:border-muted"
              @click="handleRetryChain"
            >
              Retry sources
            </button>
          </div>
        </div>
      </section>

      <AdSlot format="leaderboard" placement="event-banner" />

      <!-- Related streams in same category -->
      <section class="space-y-(--related-heading-gap)">
        <div class="listing-rule flex items-baseline justify-between gap-(--card-gap)">
          <h2 class="listing-display text-lg text-fg">
            Related in {{ detail.category_name }}
          </h2>
          <NuxtLink
            v-if="categorySlug"
            :to="`/c/${categorySlug}`"
            class="max-sm:inline-flex max-sm:min-h-11 max-sm:items-center text-xs font-medium text-muted hover:underline"
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
