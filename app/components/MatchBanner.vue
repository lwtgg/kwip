<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { matchBannerStyle } from '~/composables/useMatchBannerStyle'
import { bannerAbbreviation, teamInitials } from '~/composables/matchBanner'
import type { FeedStreamItem } from '~/composables/useFeed'
import type { matchBannerContent } from '~/composables/matchBanner'

const props = defineProps<{ stream: FeedStreamItem; now?: number; stale?: boolean; scale?: 'listing' | 'hero'; content: ReturnType<typeof matchBannerContent> }>()
const hangul = /\p{Script=Hangul}/u
const logoImages: HTMLImageElement[] = []
const lineupElement = ref<HTMLElement | null>(null)
const failed = ref<Record<string, boolean>>({})
const match = computed(() => props.stream.match!)
const initialNow = useState('ui:card-now', () => Math.floor(Date.now() / 1000))
const art = computed(() => matchBannerStyle(match.value, props.scale))
const cssNumber = (style: CSSStyleDeclaration, name: string, fallback: number) => Number.parseFloat(style.getPropertyValue(name)) || fallback
/** Width available inside a slot, excluding its gutters. */
function room(slot: HTMLElement) {
  const style = getComputedStyle(slot)
  return slot.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
}

/** Ask the layout engine for the widest unit it will keep together. */
function unbreakableWidth(line: HTMLElement) {
  line.style.whiteSpace = 'normal'
  line.style.width = 'min-content'
  const width = line.offsetWidth
  line.style.removeProperty('width')
  line.style.removeProperty('white-space')
  return width
}

function fitText() {
  const lineup = lineupElement.value
  if (!lineup) return
  const style = getComputedStyle(lineup)
  const floor = cssNumber(style, '--banner-fit-floor', 0.6)
  const compression = cssNumber(style, '--banner-score-compression', 0.85)
  const lines = [...lineup.querySelectorAll<HTMLElement>('.banner-fit-text')]
  const scores = lines.filter(line => line.classList.contains('banner-score'))
  const labels = lines.filter(line => line.parentElement!.classList.contains('banner-abbreviation'))
  const status = lines.filter(line => line.classList.contains('banner-status-line'))
  delete lineup.dataset.stacked
  lineup.style.removeProperty('--banner-lineup-min')
  const preferredRoom = room(lineup)
  // Reserve the full width to read the minimum padding resolved by the CSS clamp.
  lineup.style.setProperty('--banner-lineup-min', '100%')
  const available = room(lineup)
  for (const line of lines) {
    observer?.observe(line)
    delete line.dataset.wrap
    delete line.dataset.mono
    line.style.setProperty('--banner-line-fit', '1')
  }
  const statusWidths = status.map(line => {
    const width = unbreakableWidth(line)
    // Try monospace when a unit exceeds the full row at the fit floor.
    if (Math.ceil(width * floor) + 1 <= available) return width
    line.dataset.mono = ''
    const monoWidth = unbreakableWidth(line)
    if (monoWidth < width) return monoWidth
    delete line.dataset.mono
    return width
  })

  const natural = new Map(lines.map(line => [line, line.offsetWidth + 1]))
  const widestScore = Math.max(0, ...scores.map(line => natural.get(line)!))
  const scoreMin = Math.ceil(widestScore * floor)
  const gutter = scores.length ? parseFloat(getComputedStyle(scores[0]!.parentElement!).paddingInlineEnd) : 0
  const labelMin = Math.ceil(Math.max(...labels.map(line => natural.get(line)!)) * floor)
  const logo = lineup.querySelector('.banner-team > *')!.getBoundingClientRect().width
  const wordMin = Math.ceil(Math.max(...statusWidths) * floor) + 1
  const statusPreferred = Math.ceil(Math.max(...status.map(line => natural.get(line)!)) * floor)
  const sideMin = Math.max(logo, labelMin) + scoreMin + gutter
  const statusRoom = available - 2 * sideMin
  const statusMin = Math.max(wordMin, Math.min(preferredRoom - 2 * sideMin, statusPreferred))
  lineup.style.setProperty('--banner-lineup-min', `${2 * sideMin + statusMin}px`)
  lineup.toggleAttribute('data-stacked', statusRoom < wordMin)
  lineup.style.setProperty('--banner-label-min', `${labelMin}px`)
  lineup.style.setProperty('--banner-score-min', `${scoreMin}px`)
  lineup.style.setProperty('--banner-status-min', `${statusMin}px`)

  const scoreFit = Math.max(floor, Math.min(compression, ...scores.map(line => room(line.parentElement!) / widestScore)))
  for (const line of lines) {
    if (scores.includes(line)) {
      line.style.setProperty('--banner-line-fit', String(scoreFit))
      continue
    }
    const fit = room(line.parentElement!) / natural.get(line)!
    if (fit < floor && status.includes(line)) line.dataset.wrap = ''
    const minimum = line.parentElement!.classList.contains('banner-initials') ? 0 : floor
    line.style.setProperty('--banner-line-fit', String(Math.max(minimum, Math.min(1, fit))))
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
            :data-hangul="hangul.test(line) ? '' : undefined" :style="{ '--banner-chars': line.length }">{{ line }}</span>
        </div>
      </div>
    </div>
    <div v-if="!stale" class="banner-progress" aria-hidden="true">
      <LiveProgress :starts-at="stream.starts_at" :ends-at="stream.ends_at" :always-live="stream.always_live" :now="now ?? initialNow" />
    </div>
  </div>
</template>
