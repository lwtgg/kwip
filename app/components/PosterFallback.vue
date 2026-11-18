<script setup lang="ts">
const props = defineProps<{ name: string; colors?: string[] }>()

const initials = computed(() =>
  props.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase(),
)
</script>

<template>
  <div
    aria-hidden="true"
    class="absolute inset-0 grid place-items-center"
    :style="{ backgroundImage: `linear-gradient(135deg, ${colors?.[0] || 'var(--color-surface-2)'}, ${colors?.[1] || 'var(--color-surface)'})` }"
  >
    <span class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
    <span class="relative text-2xl font-bold text-white/70">{{ initials }}</span>
  </div>
</template>
