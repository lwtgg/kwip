<script setup lang="ts">
import { blurBackground } from '~/composables/usePosterBlur'

const props = defineProps<{ name: string; colors?: string[]; blurhash?: string }>()

const background = blurBackground(() => props.blurhash)

const initials = computed(() =>
  props.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase(),
)
</script>

<template>
  <div
    aria-hidden="true"
    class="absolute inset-0 grid place-items-center overflow-hidden"
    :style="{ backgroundImage: `linear-gradient(135deg, ${colors?.[0] || 'var(--color-surface-2)'}, ${colors?.[1] || 'var(--color-surface)'})` }"
  >
    <span
      v-if="background"
      class="absolute inset-0 scale-105 bg-cover bg-center blur-sm"
      :style="{ backgroundImage: background }"
    />
    <span class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
    <span class="fallback-initials listing-display relative z-10 rounded-listing bg-bg px-2 text-fg">{{ initials }}</span>
  </div>
</template>
