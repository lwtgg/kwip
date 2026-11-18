<script setup lang="ts">
interface DomainsResponse {
  canonical: string
  mirrors: string[]
  timestamp?: number
}

const { siteName, canonicalHost } = useRuntimeConfig().public
const requestFetch = useRequestFetch()

// Review #3: non-awaited fetch so the page shell renders immediately without blocking.
const { data, status, error, refresh } = useAsyncData('domains', () =>
  requestFetch<DomainsResponse>('/api/domains'),
)

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
  const originTs = data.value?.timestamp || fetchedAtSeconds.value
  return Boolean(originTs && nowSeconds.value - originTs > 300)
})

const current = computed(() => canonicalHost || data.value?.canonical)
const mirrors = computed(() =>
  (data.value?.mirrors ?? []).filter((d) => d && d !== current.value),
)

useSeoMeta({
  title: 'Mirrors',
  description: `Alternate domains for ${siteName}. Every address serves the same live event directory.`,
  ogTitle: `Mirrors · ${siteName}`,
  ogDescription: `Alternate domains for ${siteName}. Every address serves the same live event directory.`,
})
</script>

<template>
  <section class="mx-auto max-w-2xl space-y-6 px-4 py-10">
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold text-fg">Mirrors</h1>
      <p class="text-sm text-muted">
        These addresses all serve the same site. Requests to a mirror redirect to the current domain;
        if one address is unreachable, try another.
      </p>
    </div>

    <StateBlock
      v-if="status === 'pending' && !data"
      variant="skeleton"
      :rows="2"
    />

    <StateBlock
      v-else-if="error && !data"
      variant="error"
      message="The domain list could not be loaded."
      @retry="handleRefresh"
    />

    <template v-else>
      <StateBlock
        v-if="isStale"
        variant="stale"
        message="Domain list is older than 5 minutes."
        @retry="handleRefresh"
      />

      <StateBlock
        v-if="!data"
        variant="empty"
        message="No mirror domains are listed right now."
      />

      <ul v-else class="space-y-2 rounded-[var(--radius)] border border-border bg-surface p-5">
        <li class="flex items-center gap-2">
          <span class="font-medium text-fg">{{ current }}</span>
          <span class="text-xs text-muted">(current)</span>
        </li>
        <li v-for="domain in mirrors" :key="domain">
          <a
            :href="`https://${domain}/`"
            rel="nofollow noopener"
            class="text-accent underline underline-offset-2 hover:opacity-90"
          >
            {{ domain }}
          </a>
        </li>
        <li v-if="!mirrors.length" class="text-sm text-muted">
          No mirrors listed right now.
        </li>
      </ul>
    </template>
  </section>
</template>
