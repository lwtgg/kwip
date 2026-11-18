<script setup lang="ts">
import { useStream, useStreams, type FeedStreamDetail, type FeedStreamItem } from '~/composables/useFeed'
import { usePlayerSources } from '~/composables/usePlayerSources'
import type { SelectableSourceOption } from '~/components/SourceSelect.vue'

const route = useRoute()
const { siteName, canonicalHost } = useRuntimeConfig().public

const uriName = computed(() => {
  const raw = route.params.uri
  return (Array.isArray(raw) ? raw.join('/') : String(raw || '')).replace(/^\/+|\/+$/g, '')
})

const {
  data: streamResp,
  status: streamStatus,
  error: streamError,
  refresh: refreshStream,
} = useStream(uriName)

const {
  data: listResp,
  refresh: refreshList,
} = useStreams()

const wallClockSeconds = ref(Math.floor(Date.now() / 1000))
onMounted(() => {
  wallClockSeconds.value = Math.floor(Date.now() / 1000)
})

const feedNow = computed(() => listResp.value?.timestamp || wallClockSeconds.value)
const isStale = computed(() => {
  const ts = listResp.value?.timestamp
  return Boolean(ts && wallClockSeconds.value - ts > 300)
})

// Match stream metadata from the list feed when the single-file fixture returns a generic detail payload.
const matchingListItem = computed<FeedStreamItem | null>(() => {
  for (const cat of listResp.value?.streams ?? []) {
    for (const item of cat.streams) {
      if (item.uri_name === uriName.value) {
        return {
          ...item,
          always_live: item.always_live ?? cat.always_live,
          category_name: item.category_name || cat.category,
        }
      }
    }
  }
  return null
})

const detail = computed<FeedStreamDetail | null>(() => {
  const raw = streamResp.value?.data
  if (!raw) return null
  const matched = matchingListItem.value
  if (matched && raw.uri_name !== uriName.value) {
    return {
      ...raw,
      id: matched.id,
      name: matched.name,
      tag: matched.tag,
      source_tag: matched.source_tag,
      poster: matched.poster || raw.poster,
      blurhash: matched.blurhash || raw.blurhash,
      colors: matched.colors?.length ? matched.colors : raw.colors,
      uri_name: matched.uri_name,
      starts_at: matched.starts_at,
      ends_at: matched.ends_at,
      always_live: matched.always_live,
      locale: matched.locale || raw.locale,
      category_name: matched.category_name,
      viewers: matched.viewers,
      substreams: matched.substreams?.length ? matched.substreams : raw.substreams,
    }
  }
  return raw
})

const sources = computed<SelectableSourceOption[]>(() => {
  const d = detail.value
  if (!d) return []
  const nonEmptyPrimary = (d.sources ?? []).filter((s) => s.data)
  return usePlayerSources(d).map((option, idx) => ({
    ...option,
    kind:
      idx < nonEmptyPrimary.length && nonEmptyPrimary[idx]?.type === 'link'
        ? 'link'
        : 'iframe',
  }))
})

const defaultSourceIndex = computed(() => {
  const nonEmptyPrimary = (detail.value?.sources ?? []).filter((s) => s.data)
  const idx = nonEmptyPrimary.findIndex((s) => s.default)
  return idx >= 0 ? idx : 0
})

const selectedSourceIndex = ref<number | null>(null)
const failedSourceIndices = ref<number[]>([])
const lastFailedIndex = ref(-1)
const retryGeneration = ref(0)
const posterLoaded = ref(false)
const posterError = ref(false)

watch(uriName, () => {
  selectedSourceIndex.value = null
  failedSourceIndices.value = []
  lastFailedIndex.value = -1
  retryGeneration.value = 0
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

const activeSourceIndex = computed({
  get: () => selectedSourceIndex.value ?? defaultSourceIndex.value,
  set: (next: number) => {
    selectedSourceIndex.value = next
  },
})

const chainExhausted = computed(
  () => sources.value.length === 0 || activeSourceIndex.value >= sources.value.length,
)

const currentSource = computed(() =>
  !chainExhausted.value ? sources.value[activeSourceIndex.value] ?? null : null,
)

const firstRemainingLink = computed<SelectableSourceOption | null>(() => {
  const afterFailed = sources.value.find(
    (s, idx) => idx > lastFailedIndex.value && s.kind === 'link',
  )
  if (afterFailed) return afterFailed
  return sources.value.find((s) => s.kind === 'link') ?? null
})

function handleFrameError() {
  const failedAt = activeSourceIndex.value
  lastFailedIndex.value = failedAt
  if (!failedSourceIndices.value.includes(failedAt)) {
    failedSourceIndices.value = [...failedSourceIndices.value, failedAt]
  }
  const nextAfter = sources.value.findIndex(
    (s, idx) =>
      idx > failedAt && s.kind === 'iframe' && !failedSourceIndices.value.includes(idx),
  )
  if (nextAfter !== -1) {
    selectedSourceIndex.value = nextAfter
    return
  }
  const anyRemainingIframe = sources.value.findIndex(
    (s, idx) => s.kind === 'iframe' && !failedSourceIndices.value.includes(idx),
  )
  selectedSourceIndex.value =
    anyRemainingIframe !== -1 ? anyRemainingIframe : sources.value.length
}

function handleRetryChain() {
  if (sources.value.length === 0) {
    refreshStream()
  }
  failedSourceIndices.value = []
  lastFailedIndex.value = -1
  selectedSourceIndex.value = null
  retryGeneration.value += 1
}

function handleRetryFeed() {
  refreshStream()
  refreshList()
}

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatViewers(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

const categorySlug = computed(() =>
  detail.value?.category_name ? slugifyCategory(detail.value.category_name) : '',
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

const seoTitle = computed(() => detail.value?.name || 'Live Event')
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
  ogImage: () => detail.value?.poster || undefined,
})

function parseCompetitors(name: string) {
  const parts = name.split(/\s+(?:vs\.?|v\.?|@)\s+/i).map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return [
      { '@type': 'SportsTeam', name: parts[0] },
      { '@type': 'SportsTeam', name: parts[1] },
    ]
  }
  return [{ '@type': 'SportsTeam', name }]
}

const sportsEventJsonLd = computed(() => {
  const d = detail.value
  if (!d) return null
  const baseTs = feedNow.value
  const startSec = d.starts_at > 0 ? d.starts_at : baseTs
  const endSec = d.ends_at > 0 ? d.ends_at : startSec + 10_800
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: d.name,
    sport: d.category_name,
    startDate: new Date(startSec * 1000).toISOString(),
    endDate: new Date(endSec * 1000).toISOString(),
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'VirtualLocation',
      url: canonicalPageUrl.value,
    },
    competitor: parseCompetitors(d.name),
  }
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
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
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
      <StateBlock
        v-if="isStale"
        variant="stale"
        message="Directory data is older than 5 minutes."
        @retry="handleRetryFeed"
      />

      <!-- Header: Breadcrumb, title, source select, viewer count, category -->
      <div class="space-y-4">
        <nav aria-label="Breadcrumb" class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <NuxtLink to="/" class="hover:text-fg">Home</NuxtLink>
          <span>/</span>
          <NuxtLink
            v-if="categorySlug"
            :to="`/c/${categorySlug}`"
            class="hover:text-fg"
          >
            {{ detail.category_name }}
          </NuxtLink>
          <span v-if="categorySlug">/</span>
          <span class="truncate text-fg">{{ detail.name }}</span>
        </nav>

        <div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div class="space-y-2">
            <h1 class="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {{ detail.name }}
            </h1>
            <div class="flex flex-wrap items-center gap-2.5 text-xs text-muted">
              <NuxtLink
                v-if="categorySlug"
                :to="`/c/${categorySlug}`"
                class="rounded bg-surface-2 px-2.5 py-0.5 font-medium text-fg hover:text-accent"
              >
                {{ detail.category_name }}
              </NuxtLink>
              <span v-if="detail.tag">· {{ detail.tag }}</span>
              <span>· {{ formatViewers(detail.viewers) }} viewers</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <SourceSelect
              v-model="activeSourceIndex"
              :sources="sources"
            />
          </div>
        </div>
      </div>

      <!-- Player frame (iframe) or outbound link block or exhausted-chain fallback -->
      <section aria-label="Event player">
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

        <PlayerFrame
          v-else-if="!chainExhausted && currentSource"
          :key="`${activeSourceIndex}-${retryGeneration}`"
          :src="currentSource.url"
          :title="`${detail.name} — ${currentSource.label}`"
          @error="handleFrameError"
        />

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

      <!-- Related streams in same category -->
      <section class="space-y-3">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-lg font-semibold tracking-tight text-fg">
            Related in {{ detail.category_name }}
          </h2>
          <NuxtLink
            v-if="categorySlug"
            :to="`/c/${categorySlug}`"
            class="text-xs font-medium text-muted hover:text-accent"
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
            :now="feedNow"
          />
        </div>
        <StateBlock
          v-else
          variant="empty"
          :message="`No other ${detail.category_name} events are listed right now.`"
        />
      </section>

      <!-- Reserved AdSlot below -->
      <div>
        <div class="hidden md:block">
          <AdSlot format="leaderboard" />
        </div>
        <div class="md:hidden">
          <AdSlot format="mobile" />
        </div>
      </div>
    </template>
  </div>
</template>
