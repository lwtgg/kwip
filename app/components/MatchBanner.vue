<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { matchBannerStyle } from '~/composables/useMatchBannerStyle'
import { bannerAbbreviation, teamInitials } from '~/composables/matchBanner'
import type { FeedStreamItem } from '~/composables/useFeed'
import type { matchBannerContent } from '~/composables/matchBanner'

const props = defineProps<{ stream: FeedStreamItem; now?: number; stale?: boolean; scale?: 'listing' | 'hero'; content: ReturnType<typeof matchBannerContent> }>()
const logoImages: HTMLImageElement[] = []
const lineupElement = ref<HTMLElement | null>(null)
const failed = ref<Record<string, boolean>>({})
const match = computed(() => props.stream.match!)
const initialNow = useState('ui:card-now', () => Math.floor(Date.now() / 1000))
const art = computed(() => matchBannerStyle(match.value, props.scale))
const cssNumber = (style: CSSStyleDeclaration, name: string, fallback: number) => Number.parseFloat(style.getPropertyValue(name)) || fallback
/** Width a line may draw in: its parent's content box. */
function room(line: HTMLElement) {
  const parent = line.parentElement!
  const style = getComputedStyle(parent)
  return parent.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
}
function fitText() {
  const lineup = lineupElement.value
  if (!lineup) return
  const style = getComputedStyle(lineup)
  const floor = cssNumber(style, '--banner-fit-floor', 0.6)
  const compression = cssNumber(style, '--banner-score-compression', 0.85)
  const lines = [...lineup.querySelectorAll<HTMLElement>('.banner-fit-text')]
  // Natural widths are read unwrapped. offsetWidth rounds down, so leave a pixel spare.
  for (const line of lines) {
    observer?.observe(line) // idempotent; picks up lines added after mount
    delete line.dataset.wrap
  }
  const natural = new Map(lines.map(line => [line, line.offsetWidth + 1]))
  // Both scores share one scale, sized for the wider of the two, and their columns never go below the floor.
  const scores = lines.filter(line => line.classList.contains('banner-score'))
  if (scores.length) {
    const widest = Math.max(...scores.map(line => natural.get(line)!))
    const slot = getComputedStyle(scores[0]!.parentElement!)
    const padding = Number.parseFloat(slot.paddingLeft) + Number.parseFloat(slot.paddingRight)
    lineup.style.setProperty('--banner-score-min', `${Math.ceil(widest * floor + padding)}px`)
    const fit = Math.min(compression, ...scores.map(line => room(line) / widest))
    for (const line of scores) line.style.setProperty('--banner-line-fit', String(Math.max(floor, fit)))
  } else lineup.style.removeProperty('--banner-score-min')
  for (const line of lines) {
    if (scores.includes(line)) continue
    const fit = room(line) / natural.get(line)!
    // Initials sit in a fixed logo box and have nowhere to wrap; every other line wraps at the floor.
    if (fit >= floor || line.parentElement!.classList.contains('banner-initials')) {
      line.style.setProperty('--banner-line-fit', String(Math.min(1, fit)))
    } else {
      line.dataset.wrap = ''
      line.style.setProperty('--banner-line-fit', String(floor))
    }
  }
}
let observer: ResizeObserver | undefined
onMounted(() => {
  for (const [index, side] of [match.value.away, match.value.home].entries()) {
    const image = logoImages[index]
    if (side.logo && image?.complete && image.naturalWidth === 0) failed.value[side.logo] = true
  }
  fitText()
  observer = new ResizeObserver(fitText)
  if (lineupElement.value) observer.observe(lineupElement.value)
  void document.fonts.ready.then(fitText)
})
watch([match, () => props.content, failed], fitText, { flush: 'post', deep: true })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="match-banner" :style="art" :data-scale="scale">
    <div ref="lineupElement" class="banner-lineup" aria-hidden="true">
      <template v-for="(side, index) in [match.away, match.home]" :key="index">
        <div class="banner-team" :class="index === 0 ? 'banner-away-team' : 'banner-home-team'">
          <img v-if="side.logo && !failed[side.logo]" :ref="el => { if (el) logoImages[index] = el as HTMLImageElement }" :src="side.logo" alt="" width="116" height="116"
            loading="lazy" decoding="async" @error="failed[side.logo!] = true">
          <span v-else class="banner-initials"><span class="banner-fit-text">{{ teamInitials(side.name) }}</span></span>
        </div>
        <span class="banner-abbreviation" :class="index === 0 ? 'banner-away-label' : 'banner-home-label'"><span class="banner-fit-text">{{ bannerAbbreviation(side) }}</span></span>
        <span v-if="content.hasScores" class="banner-score-slot" :class="index === 0 ? 'banner-away-score' : 'banner-home-score'">
          <span class="banner-fit-text banner-score">{{ side.score }}</span>
        </span>
      </template>
      <div class="banner-status">
        <div v-for="(line, index) in content.tiers" :key="index" class="banner-status-tier">
          <span v-if="line" class="banner-fit-text banner-status-line" :class="{ 'banner-versus': line === 'vs' }"
            :style="{ '--banner-chars': line.length }">{{ line }}</span>
        </div>
      </div>
    </div>
    <div v-if="!stale" class="banner-progress" aria-hidden="true">
      <LiveProgress :starts-at="stream.starts_at" :ends-at="stream.ends_at" :always-live="stream.always_live" :now="now ?? initialNow" />
    </div>
  </div>
</template>
