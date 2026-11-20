<script setup lang="ts">
import { onMounted } from 'vue'
import { getBannerCreative, type BannerPlacement } from '#shared/utils/banner'

const props = defineProps<{ format: 'leaderboard' | 'mobile' | 'rail'; placement: BannerPlacement }>()
const config = useRuntimeConfig().public
const image = ref<HTMLImageElement>()
const failedImage = ref('')
const creative = computed(() => getBannerCreative(
  config.ads === true, config.bannerCreatives, props.placement,
))
const clickUrl = computed(() => creative.value?.key
  ? `/go/${props.placement}?${new URLSearchParams({ creative: creative.value.key })}`
  : '')
const mobileSize = 'h-(--banner-mobile-height) w-(--banner-mobile-width)'
const formats = {
  leaderboard: {
    width: 970,
    height: 90,
    classes: `${mobileSize} md:h-(--banner-leaderboard-height) md:w-(--banner-leaderboard-width)`,
  },
  mobile: { width: 320, height: 100, classes: mobileSize },
  rail: { width: 300, height: 250, classes: 'h-(--banner-rail-height) w-(--banner-rail-width)' },
} as const

function settleImage() {
  const source = image.value?.getAttribute('src')
  if (source && image.value?.complete && image.value.naturalWidth === 0) failedImage.value = source
}

// A cached image can finish before hydration registers its listeners.
onMounted(settleImage)
</script>

<template>
  <div
    v-if="creative"
    :data-ad-format="format"
    :class="formats[format].classes"
    class="relative mx-auto max-w-full shrink-0 overflow-hidden rounded-(--radius) bg-surface"
  >
    <span
      :id="`label-${placement}`"
      class="pointer-events-none absolute top-0 left-0 z-10 bg-surface px-2 py-1 text-xs text-muted"
    >Advertisement</span>
    <a
      v-if="clickUrl && creative.image !== failedImage"
      :href="clickUrl"
      :aria-describedby="`label-${placement}`"
      rel="sponsored noopener noreferrer"
      target="_blank"
      class="block size-full focus-visible:outline-offset-(--focus-ring-inset)"
    >
      <img
        ref="image"
        :src="creative.image"
        :alt="creative.alt"
        :width="formats[format].width"
        :height="formats[format].height"
        loading="lazy"
        decoding="async"
        class="banner-image relative block size-full object-cover"
        @error="settleImage"
      >
    </a>
  </div>
</template>

<style scoped>
/* Broken images can render a pseudo-element while loaded images remain replaced elements. */
.banner-image::before {
  position: absolute;
  inset: 0;
  background: var(--color-surface);
  content: "";
}
</style>
