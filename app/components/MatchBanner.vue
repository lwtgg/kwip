<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { matchBannerStyle } from '~/composables/useMatchBannerStyle'
import type { FeedStreamItem } from '~/composables/useFeed'
import { formatViewersCompact } from '~/utils/viewers'

const props = defineProps<{ stream: FeedStreamItem; now?: number; stale?: boolean; scale?: 'listing' | 'hero' }>()
const logoImages: HTMLImageElement[] = []
const statusElement = ref<HTMLElement | null>(null)
const failed = ref<Record<string, boolean>>({})
const match = computed(() => props.stream.match!)
const initialNow = useState('ui:card-now', () => Math.floor(Date.now() / 1000))
const art = computed(() => matchBannerStyle(match.value, props.scale))
const state = computed(() => ({ pre: 'Upcoming', in: 'Live', post: 'Final' })[match.value.state])
const viewers = computed(() => formatViewersCompact(props.stream.viewers ?? 0))
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase()
const hasScores = computed(() => match.value.away.score !== null && match.value.home.score !== null)
const statusLines = computed(() => [
  hasScores.value ? state.value : 'vs',
  ...(match.value.detail && match.value.detail !== state.value ? [match.value.detail] : []),
  ...(!props.stale ? [`${viewers.value} ${Number(props.stream.viewers) === 1 ? 'viewer' : 'viewers'}`] : []),
])
function fitStatus() {
  const status = statusElement.value
  if (!status) return
  for (const line of status.children) {
    const element = line as HTMLElement
    element.style.setProperty('--banner-line-fit', String(Math.min(1, status.clientWidth / element.scrollWidth)))
  }
}
let observer: ResizeObserver | undefined
onMounted(() => {
  for (const [index, side] of [match.value.away, match.value.home].entries()) {
    const image = logoImages[index]
    if (side.logo && image?.complete && image.naturalWidth === 0) failed.value[side.logo] = true
  }
  fitStatus()
  observer = new ResizeObserver(fitStatus)
  if (statusElement.value) observer.observe(statusElement.value)
})
watch(statusLines, async () => { await nextTick(); fitStatus() })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="match-banner" :style="art">
    <div class="banner-lineup" aria-hidden="true">
      <template v-for="(side, index) in [match.away, match.home]" :key="index">
        <div class="banner-team" :class="index === 0 ? 'banner-away-team' : 'banner-home-team'">
          <img v-if="side.logo && !failed[side.logo]" :ref="el => { if (el) logoImages[index] = el as HTMLImageElement }" :src="side.logo" alt="" width="116" height="116"
            loading="lazy" decoding="async" @error="failed[side.logo!] = true">
          <span v-else class="banner-initials">{{ initials(side.name) }}</span>
          <span class="banner-abbreviation">{{ side.abbreviation }}</span>
        </div>
        <span v-if="hasScores" class="banner-score" :style="{ '--banner-digits': String(side.score).length }" :class="index === 0 ? 'banner-away-score' : 'banner-home-score'">{{ side.score }}</span>
      </template>
      <div ref="statusElement" class="banner-status">
        <span v-for="(line, index) in statusLines" :key="index" :class="{ 'banner-versus': line === 'vs' }"
          :style="{ '--banner-chars': line.length }">{{ line }}</span>
      </div>
    </div>
    <div v-if="!stale" class="banner-progress">
      <LiveProgress :starts-at="stream.starts_at" :ends-at="stream.ends_at" :always-live="stream.always_live" :now="now ?? initialNow" />
    </div>
  </div>
</template>
