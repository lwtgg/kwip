<script setup lang="ts">
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
function revealSportLink(event: FocusEvent) {
  if (event.target instanceof HTMLAnchorElement) {
    event.target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
  }
}
</script>

<template>
  <div class="flex min-h-(--shell-min-height) flex-col bg-bg text-fg">
    <header class="sticky top-0 z-40 border-b border-border bg-bg">
      <div class="mx-auto flex max-w-fixtures flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-2 sm:px-6 md:flex-nowrap">
        <NuxtLink
          to="/"
          class="inline-flex shrink-0 items-center min-h-target hover:opacity-90"
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

        <div class="flex shrink-0 items-center gap-2">
          <NuxtLink
            to="/vods"
            :aria-current="route.path === '/vods' ? 'page' : undefined"
            class="inline-flex min-h-target items-center rounded-control px-2 text-metadata font-medium text-fg hover:underline"
          >
            Archive
          </NuxtLink>
          <NuxtLink
            to="/mirrors"
            aria-label="Mirror domains"
            title="Mirror domains"
            class="inline-flex size-target items-center justify-center rounded-control border border-control-canvas text-muted hover:border-control hover:bg-surface-2 hover:text-fg"
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
            class="inline-flex size-target items-center justify-center rounded-control border border-control-canvas text-muted hover:border-control hover:bg-surface-2 hover:text-fg"
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
            class="inline-flex size-target items-center justify-center rounded-control border border-control-canvas text-muted hover:border-control hover:bg-surface-2 hover:text-fg"
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
        <nav
          aria-label="Category jump bar"
          class="sport-scroll flex min-w-0 basis-full items-center gap-1 overflow-x-auto md:flex-1"
          @focusin="revealSportLink"
        >
          <NuxtLink
            to="/"
            :aria-current="route.path === '/' ? 'page' : undefined"
            class="shrink-0 inline-flex min-h-target min-w-target items-center justify-center rounded-control px-3 text-metadata font-medium whitespace-nowrap"
            :class="
              route.path === '/'
                ? 'bg-surface-2 text-fg underline underline-offset-4'
                : 'text-muted hover:bg-surface-2 hover:text-fg'
            "
          >
            All
          </NuxtLink>
          <NuxtLink
            v-for="cat in categories"
            :key="cat.id"
            :to="`/c/${cat.slug}`"
            :aria-current="isCategoryActive(cat.slug) ? 'page' : undefined"
            class="shrink-0 inline-flex min-h-target min-w-target items-center justify-center rounded-control px-3 text-metadata font-medium whitespace-nowrap"
            :class="
              isCategoryActive(cat.slug)
                ? 'bg-surface-2 text-fg underline underline-offset-4'
                : 'text-muted hover:bg-surface-2 hover:text-fg'
            "
          >
            {{ cat.name }}
          </NuxtLink>
        </nav>

      </div>
    </header>

    <div class="flex-1">
      <slot />
    </div>

    <footer class="mt-(--footer-gap) border-t border-border bg-surface">
      <div class="mx-auto flex max-w-fixtures flex-col items-start justify-between gap-4 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:px-6">
        <p>{{ siteName }} · Live sports event directory</p>
        <nav aria-label="Footer navigation" class="flex flex-wrap items-center gap-4">
          <NuxtLink to="/vods" class="inline-flex min-h-target min-w-target items-center hover:text-fg">Archive</NuxtLink>
          <NuxtLink to="/about" class="inline-flex min-h-target min-w-target items-center hover:text-fg">About</NuxtLink>
          <NuxtLink to="/mirrors" class="inline-flex min-h-target min-w-target items-center hover:text-fg">Mirrors</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
