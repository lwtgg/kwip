<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useStreams } from '~/composables/useFeed'

const { siteName } = useRuntimeConfig().public
const route = useRoute()
const { theme, toggleTheme } = useTheme()
const { density, toggleDensity } = useDensity()
const isCompact = computed(() => density.value === 'compact')
const densityAction = computed(() => isCompact.value ? 'Switch to comfortable layout' : 'Switch to compact layout')
const error = useError()
const streamsData = error.value ? undefined : useStreams().data

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const isCategoryActive = (slug: string) => route.path === `/c/${slug}`

const categories = computed(() => {
  const visible = []
  for (const category of streamsData?.value?.streams ?? []) {
    const chip = {
      id: category.id,
      name: category.category,
      slug: slugifyCategory(category.category),
    }
    if (category.streams.length > 0) {
      visible.push(chip)
    } else if (isCategoryActive(chip.slug)) {
      visible.unshift(chip)
    }
  }
  return visible
})

const categoryNav = ref<HTMLElement>()
const showMoreCategories = ref(false)
let categoryNavObserver: ResizeObserver | undefined

function updateCategoryOverflow() {
  const nav = categoryNav.value
  showMoreCategories.value = !!nav && nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 1
}

watch(categories, updateCategoryOverflow, { flush: 'post' })
onMounted(() => {
  if (!categoryNav.value) return
  categoryNavObserver = new ResizeObserver(updateCategoryOverflow)
  categoryNavObserver.observe(categoryNav.value)
  updateCategoryOverflow()
})
onBeforeUnmount(() => categoryNavObserver?.disconnect())
</script>

<template>
  <div class="flex min-h-(--shell-min-height) flex-col bg-bg text-fg">
    <header class="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
      <div class="mx-auto grid max-w-7xl grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <NuxtLink
          to="/"
          class="inline-flex shrink-0 items-center min-h-11 hover:opacity-90"
        >
          <img
            src="/logo.png"
            srcset="/logo.png 1x, /logo@2x.png 2x"
            :alt="siteName"
            width="720"
            height="314"
            class="h-7 w-auto sm:h-8"
          >
        </NuxtLink>

        <div class="flex items-center justify-self-end gap-2 md:col-start-3 md:row-start-1">
          <NuxtLink
            to="/mirrors"
            aria-label="Mirror domains"
            title="Mirror domains"
            class="inline-flex h-target w-target items-center justify-center rounded-listing border border-control-surface bg-surface text-muted hover:border-control hover:text-fg"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3.6 9h16.8M3.6 15h16.8" />
              <path d="M12 3a14.5 14.5 0 0 0 0 18 14.5 14.5 0 0 0 0-18Z" />
            </svg>
          </NuxtLink>

          <button
            type="button"
            :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            :title="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            class="inline-flex h-target w-target items-center justify-center rounded-listing border border-control-surface bg-surface text-muted hover:border-control hover:text-fg"
            @click="toggleTheme"
          >
            <svg
              v-if="theme === 'dark'"
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            <svg
              v-else
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
            </svg>
          </button>

          <button
            type="button"
            :aria-pressed="isCompact"
            :aria-label="isCompact ? 'Compact layout' : 'Comfortable layout'"
            :title="densityAction"
            class="inline-flex h-target w-target items-center justify-center rounded-[var(--radius)] border border-control-surface bg-surface text-muted hover:border-control hover:text-fg"
            @click="toggleDensity"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              class="h-4 w-4"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path :d="isCompact ? 'M7 10h10M7 14h10' : 'M7 8h10M7 16h10'" />
            </svg>
          </button>
        </div>

        <div class="relative col-span-2 min-w-0 pr-6 md:col-span-1 md:col-start-2 md:row-start-1">
          <nav
            ref="categoryNav"
            aria-label="Category jump bar"
            @scroll.passive="updateCategoryOverflow"
            class="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5"
          >
            <NuxtLink
              to="/"
              :aria-current="route.path === '/' ? 'page' : undefined"
              class="shrink-0 inline-flex min-h-target min-w-target items-center justify-center rounded-control px-3 py-1 text-xs font-medium whitespace-nowrap"
              :class="
                route.path === '/'
                  ? 'bg-surface-2 text-fg underline underline-offset-4'
                  : 'bg-surface text-muted hover:bg-surface-2 hover:text-fg'
              "
            >
              All
            </NuxtLink>
            <NuxtLink
              v-for="cat in categories"
              :key="cat.id"
              :to="`/c/${cat.slug}`"
              :aria-current="isCategoryActive(cat.slug) ? 'page' : undefined"
              class="shrink-0 inline-flex min-h-target min-w-target items-center justify-center rounded-control px-3 py-1 text-xs font-medium whitespace-nowrap"
              :class="
                isCategoryActive(cat.slug)
                  ? 'bg-surface-2 text-fg underline underline-offset-4'
                  : 'bg-surface text-muted hover:bg-surface-2 hover:text-fg'
              "
            >
              {{ cat.name }}
            </NuxtLink>
          </nav>
          <svg
            v-if="showMoreCategories"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-muted"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </div>
      </div>
    </header>

    <div class="flex-1">
      <slot />
    </div>

    <footer class="mt-(--footer-gap) border-t border-border bg-surface">
      <div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:px-6">
        <p>{{ siteName }} · Live sports event directory</p>
        <nav aria-label="Footer navigation" class="flex flex-wrap items-center gap-4">
          <NuxtLink to="/vods" class="hover:text-fg inline-flex min-h-11 items-center">Archive</NuxtLink>
          <NuxtLink to="/about" class="hover:text-fg inline-flex min-h-11 items-center">About</NuxtLink>
          <NuxtLink to="/mirrors" class="hover:text-fg inline-flex min-h-11 items-center">Mirrors</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
