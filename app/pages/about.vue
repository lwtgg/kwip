<script setup lang="ts">
const { siteName } = useRuntimeConfig().public

useSeoMeta({
  title: 'About',
  description: `What ${siteName} is: a directory of live and upcoming sports events with links to their sources.`,
  ogTitle: `About · ${siteName}`,
  ogImageAlt: 'About',
  ogDescription: `What ${siteName} is: a directory of live and upcoming sports events with links to their sources.`,
})
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-10">
    <h1 class="mb-4 text-2xl font-semibold">About</h1>
    <p class="mb-4">
      {{ siteName }} is a live event directory: a schedule of live, upcoming and recent sports events,
      grouped by category, with each event pointing to the sources that carry it.
    </p>
    <p class="opacity-80">
      A source is either an outbound link or a third-party player embedded by iframe;
      {{ siteName }} does not host any media.
    </p>
  </section>
</template>
