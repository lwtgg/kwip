<script setup lang="ts">
const { siteName, canonicalHost } = useRuntimeConfig().public
const route = useRoute()
const canonicalUrl = computed(() => `https://${canonicalHost}${route.path}`)

// Rule 13: canonical + og:url always point at the canonical host.
useHead({
  htmlAttrs: { lang: 'en', 'data-theme': 'dark' },
  titleTemplate: (t) => (t ? `${t} · ${siteName}` : siteName),
  link: [{ rel: 'canonical', href: canonicalUrl }],
})
useSeoMeta({
  ogUrl: canonicalUrl,
  ogSiteName: siteName,
  ogType: 'website',
})
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius)] focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
  >Skip to content</a>
  <NuxtLayout>
    <main id="main">
      <NuxtPage />
    </main>
  </NuxtLayout>
</template>
