<script setup lang="ts">
const error = useError()
const route = useRoute()
const { canonicalHost } = useRuntimeConfig().public
const isNotFound = computed(() => error.value?.statusCode === 404)
const title = computed(() => isNotFound.value ? 'Page not found' : 'Something went wrong')

useSeoMeta({ title, robots: 'noindex' })

// Rule 13 still applies: the canonical host, even on a dead URL.
useHead({ link: [{ rel: 'canonical', href: `https://${canonicalHost}${route.path}` }] })

function retry() {
  return clearError({ redirect: '/' })
}
</script>

<template>
  <NuxtLayout name="default">
    <main id="main" class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 class="mb-4 text-2xl font-semibold">{{ title }}</h1>
      <StateBlock
        class="[&_button]:min-h-11"
        :variant="isNotFound ? 'not-found' : 'error'"
        @retry="retry"
      />
    </main>
  </NuxtLayout>
</template>
