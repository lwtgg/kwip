<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  to?: string
  count?: string
  headingId?: string
}>(), { to: undefined, count: undefined, headingId: undefined })
</script>

<template>
  <!-- One short header over a group of rows: the title, linked when the group has a page, and a quiet count. -->
  <div class="flex flex-wrap items-center justify-between gap-x-(--card-gap)">
    <h2 :id="headingId" class="text-base font-semibold text-fg">
      <NuxtLink v-if="to" :to="to" class="inline-flex min-h-target items-center gap-1 hover:underline">
        <span>{{ title }}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" class="size-3.5 text-muted" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 3 5 5-5 5" />
        </svg>
      </NuxtLink>
      <span v-else class="inline-flex min-h-target items-center">{{ title }}</span>
    </h2>
    <span v-if="count" class="listing-numeric text-metadata text-muted">{{ count }}</span>
    <slot />
  </div>
</template>
