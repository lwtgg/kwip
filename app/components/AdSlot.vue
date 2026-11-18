<script setup lang="ts">
// Rule 6: reserved, empty in v1; exact dimensions so v2 fills without reflow.
const props = defineProps<{ format: 'leaderboard' | 'mobile' | 'rail' }>()

const SIZES = {
  leaderboard: { w: 970, h: 90 },
  mobile: { w: 320, h: 100 },
  rail: { w: 300, h: 250 },
} as const

const size = computed(() => SIZES[props.format])
</script>

<template>
  <template v-if="format === 'leaderboard'">
    <div
      aria-hidden="true"
      data-ad-format="leaderboard"
      class="mx-auto hidden max-w-full shrink-0 overflow-hidden rounded-[var(--radius)] border border-dashed border-border bg-surface md:flex"
      :style="{ width: `${SIZES.leaderboard.w}px`, height: `${SIZES.leaderboard.h}px` }"
    />
    <div
      aria-hidden="true"
      data-ad-format="mobile"
      class="mx-auto flex max-w-full shrink-0 overflow-hidden rounded-[var(--radius)] border border-dashed border-border bg-surface md:hidden"
      :style="{ width: `${SIZES.mobile.w}px`, height: `${SIZES.mobile.h}px` }"
    />
  </template>
  <div
    v-else
    aria-hidden="true"
    :data-ad-format="format"
    class="mx-auto flex max-w-full shrink-0 overflow-hidden rounded-[var(--radius)] border border-dashed border-border bg-surface"
    :style="{ width: `${size.w}px`, height: `${size.h}px` }"
  />
</template>
