<script setup lang="ts">
import { useStreams } from '~/composables/useFeed'

const { siteName } = useRuntimeConfig().public
const route = useRoute()
const { theme, toggleTheme } = useTheme()
const { data: streamsData } = useStreams()

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const categories = computed(() =>
  (streamsData.value?.streams ?? []).map((cat) => ({
    id: cat.id,
    name: cat.category,
    slug: slugifyCategory(cat.category),
  })),
)

const isCategoryActive = (slug: string) => route.path === `/c/${slug}`
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-fg">
    <header class="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <NuxtLink
          to="/"
          class="inline-flex shrink-0 items-center max-sm:min-h-11 hover:opacity-90"
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

        <nav
          aria-label="Category jump bar"
          class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5"
        >
          <NuxtLink
            to="/"
            :aria-current="route.path === '/' ? 'page' : undefined"
            class="shrink-0 rounded-full max-sm:inline-flex max-sm:min-h-11 max-sm:items-center px-3 py-1 text-xs font-medium whitespace-nowrap motion-safe:transition-colors"
            :class="
              route.path === '/'
                ? 'bg-accent text-accent-fg'
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
            class="shrink-0 rounded-full max-sm:inline-flex max-sm:min-h-11 max-sm:items-center px-3 py-1 text-xs font-medium whitespace-nowrap motion-safe:transition-colors"
            :class="
              isCategoryActive(cat.slug)
                ? 'bg-accent text-accent-fg'
                : 'bg-surface text-muted hover:bg-surface-2 hover:text-fg'
            "
          >
            {{ cat.name }}
          </NuxtLink>
        </nav>

        <div class="flex shrink-0 items-center gap-2">
          <NuxtLink
            to="/mirrors"
            aria-label="Mirror domains"
            title="Mirror domains"
            class="inline-flex h-9 w-9 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-[var(--radius)] border border-border bg-surface text-muted hover:border-accent hover:text-fg"
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
            class="inline-flex h-9 w-9 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-[var(--radius)] border border-border bg-surface text-muted hover:border-accent hover:text-fg"
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
        </div>
      </div>
    </header>

    <div class="flex-1">
      <slot />
    </div>

    <footer class="mt-12 border-t border-border bg-surface">
      <div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:px-6">
        <p>{{ siteName }} · Live sports event directory</p>
        <nav aria-label="Footer navigation" class="flex flex-wrap items-center gap-4">
          <NuxtLink to="/vods" class="hover:text-fg max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">Archive</NuxtLink>
          <NuxtLink to="/about" class="hover:text-fg max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">About</NuxtLink>
          <NuxtLink to="/mirrors" class="hover:text-fg max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">Mirrors</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
