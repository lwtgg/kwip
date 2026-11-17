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
  <div
    aria-hidden="true"
    :data-ad-format="format"
    class="mx-auto flex max-w-full shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-dashed border-border bg-surface text-xs uppercase tracking-wide text-muted"
    :style="{ width: `${size.w}px`, height: `${size.h}px` }"
  >
    Advertisement
  </div>
</template>
