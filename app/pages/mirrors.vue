<script setup lang="ts">
interface DomainsResponse {
  canonical: string
  mirrors: string[]
}

const { siteName, canonicalHost } = useRuntimeConfig().public
const { data, error, refresh } = await useAsyncData('domains', () => $fetch<DomainsResponse>('/api/domains'))

const current = computed(() => canonicalHost || data.value?.canonical)
const mirrors = computed(() => (data.value?.mirrors ?? []).filter((d) => d && d !== current.value))

useSeoMeta({
  title: 'Mirrors',
  description: `Alternate domains for ${siteName}. Every address serves the same live event directory.`,
  ogTitle: `Mirrors · ${siteName}`,
  ogDescription: `Alternate domains for ${siteName}. Every address serves the same live event directory.`,
})
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-10">
    <h1 class="mb-4 text-2xl font-semibold">Mirrors</h1>
    <p class="mb-6 opacity-80">
      These addresses all serve the same site. Requests to a mirror redirect to the current domain;
      if one address is unreachable, try another.
    </p>

    <div v-if="error" role="alert" class="space-y-3">
      <p>The domain list could not be loaded.</p>
      <button type="button" class="underline" @click="refresh()">Retry</button>
    </div>

    <ul v-else class="space-y-2">
      <li>
        <span class="font-medium">{{ current }}</span>
        <span class="ml-2 text-sm opacity-70">(current)</span>
      </li>
      <li v-for="domain in mirrors" :key="domain">
        <a :href="`https://${domain}/`" rel="nofollow noopener" class="underline">{{ domain }}</a>
      </li>
      <li v-if="!mirrors.length" class="opacity-70">No mirrors listed right now.</li>
    </ul>
  </section>
</template>
