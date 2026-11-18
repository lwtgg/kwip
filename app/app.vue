<script setup lang="ts">
const { siteName, canonicalHost } = useRuntimeConfig().public
const route = useRoute()
const canonicalUrl = computed(() => `https://${canonicalHost}${route.path}`)

// Rule 13: canonical + og:url always point at the canonical host.
useHead({
  htmlAttrs: { lang: 'en', 'data-theme': 'dark' },
  titleTemplate: (t) => (t ? `${t} · ${siteName}` : siteName),
  link: [
    { rel: 'canonical', href: canonicalUrl },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icon-32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/icon-16.png' },
    { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/icon-48.png' },
    { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon-192.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
    { rel: 'mask-icon', href: '/icon-32.png', color: '#0b0d12' },
  ],
})
useSeoMeta({
  ogUrl: canonicalUrl,
  ogSiteName: siteName,
  ogType: 'website',
})

function revealHorizontalFocus(event: FocusEvent) {
  const target = event.target
  if (!(target instanceof HTMLElement) || !target.matches(':focus-visible')) return

  const scroller = target.closest<HTMLElement>('.overflow-x-auto, [class~="md:overflow-x-auto"]')
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return

  requestAnimationFrame(() => {
    if (document.activeElement !== target) return
    const bounds = scroller.getBoundingClientRect()
    const item = target.getBoundingClientRect()
    if (item.left < bounds.left) scroller.scrollLeft += item.left - bounds.left
    else if (item.right > bounds.right) scroller.scrollLeft += item.right - bounds.right
  })
}

onMounted(() => document.addEventListener('focusin', revealHorizontalFocus))
onBeforeUnmount(() => document.removeEventListener('focusin', revealHorizontalFocus))
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
