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

let inkContext: CanvasRenderingContext2D | null | undefined

/** Measure the visible text independently of the grid track that holds it. */
function inkBounds(line: HTMLElement, context: CanvasRenderingContext2D) {
  const text = line.firstChild
  if (!(text instanceof Text)) return null
  const style = getComputedStyle(line)
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const range = document.createRange()
  range.selectNodeContents(text)
  // A zero-height inline block ends at the first line's baseline. The range rects
  // give subsequent lines' Y offsets even when the text wraps.
  const probe = document.createElement('span')
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
  line.prepend(probe)
  const baseline = probe.getBoundingClientRect().top
  probe.remove()
  const rects = [...range.getClientRects()].filter(rect => rect.height > 0)
  if (!rects.length) return null
  const rows = new Map<number, string>()
  if (rects.length === 1) {
    rows.set(rects[0]!.top, text.data)
  } else {
    // Read the text on each visual line after wrapping and horizontal fitting.
    let index = 0
    for (const character of text.data) {
      range.setStart(text, index)
      index += character.length
      range.setEnd(text, index)
      const { top, height } = range.getBoundingClientRect()
      if (!height) continue
      rows.set(top, (rows.get(top) ?? '') + character)
    }
  }
  let top = Infinity
  let bottom = -Infinity
  let lineCount = 0
  for (const [rowTop, content] of rows) {
    if (!content.trim()) continue
    lineCount++
    const metrics = context.measureText(content.trim())
    const rowBaseline = baseline + rowTop - rects[0]!.top
    top = Math.min(top, rowBaseline - metrics.actualBoundingBoxAscent)
    bottom = Math.max(bottom, rowBaseline + metrics.actualBoundingBoxDescent)
  }
  return Number.isFinite(top) ? { top, bottom, lineCount } : null
}

function fitText() {
  const lineup = lineupElement.value
  if (!lineup?.clientWidth) return
  lineup.dataset.fitted = ''
  const style = getComputedStyle(lineup)
  const floor = cssNumber(style, '--banner-fit-floor', 0.6)
  const compression = cssNumber(style, '--banner-score-compression', 0.85)
  const lines = [...lineup.querySelectorAll<HTMLElement>('.banner-fit-text')]
  const scores = lines.filter(line => line.classList.contains('banner-score'))
  const labels = lines.filter(line => line.parentElement!.classList.contains('banner-abbreviation'))
  const status = lines.filter(line => line.classList.contains('banner-status-line'))
  delete lineup.dataset.stacked
  delete lineup.dataset.wideDetail
  delete lineup.dataset.wideScoreDetail
  delete lineup.dataset.wideAudience
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
  const sideMin = Math.max(logo, labelMin) + scoreMin + gutter
  const statusRoom = available - 2 * sideMin
  // The compact layout lets each abbreviation span its team and score tracks, and lets the logo
  // shrink to the text size, so the middle column keeps the state between the scores.
  const compactSide = Math.max(labelMin, scoreMin + gutter + Math.min(logo, parseFloat(style.fontSize)))
  const compactMiddle = Math.max(0, available - 2 * compactSide)
  const share = Number.parseFloat(style.getPropertyValue('--banner-status-width')) / 100
  const stateLine = status[0]
  const detailLine = lineup.querySelector<HTMLElement>('.banner-status-tier:nth-child(2) .banner-status-line')
  const audienceLine = lineup.querySelector<HTMLElement>('.banner-status-tier:nth-child(3) .banner-status-line')
  const wordMin = (width: number) => Math.ceil(width * floor) + 1
  const widestWord = wordMin(Math.max(...statusWidths))
  const lowerTierMin = (line: HTMLElement | null) => line === null ? 0 : wordMin(statusWidths[status.indexOf(line)]!)
  // On a roomy card a long detail can take its own row while the teams keep their tracks.
  const fixedMiddleMin = Math.max(wordMin(statusWidths[0]!), lowerTierMin(audienceLine))
  const compact = statusRoom < widestWord && (compactMiddle < widestWord || statusRoom < fixedMiddleMin)
  const middleRoom = compact ? compactMiddle : statusRoom
  const wideDetail = lowerTierMin(detailLine) > middleRoom
  const wideAudience = compact && lowerTierMin(audienceLine) > middleRoom
  const middleLines = status.filter(line =>
    !(wideDetail && line === detailLine) && !(wideAudience && line === audienceLine))
  const middleMin = wordMin(Math.max(...middleLines.map(line => statusWidths[status.indexOf(line)]!)))
  const statusPreferred = Math.ceil(Math.max(...middleLines.map(line => natural.get(line)!)) * floor)
  const statusMin = Math.max(middleMin, Math.min(preferredRoom - 2 * sideMin, statusPreferred))
  const middleWidth = Number.isFinite(share) ? Math.max(middleMin, available * share) : middleMin
  lineup.style.setProperty('--banner-lineup-min', `${2 * sideMin + statusMin}px`)
  lineup.toggleAttribute('data-stacked', compact)
  lineup.toggleAttribute('data-wide-detail', wideDetail || wideAudience)
  lineup.toggleAttribute('data-wide-score-detail', wideDetail)
  lineup.toggleAttribute('data-wide-audience', wideAudience)
  lineup.style.setProperty('--banner-compact-middle', `${Math.min(compactMiddle, middleWidth)}px`)
  lineup.style.setProperty('--banner-label-min', `${labelMin}px`)
  lineup.style.setProperty('--banner-score-min', `${scoreMin}px`)
  lineup.style.setProperty('--banner-status-min', `${statusMin}px`)

  const scoreFit = Math.max(floor, Math.min(compression, ...scores.map(line => room(line.parentElement!) / widestScore)))
  for (const line of lines) {
    if (scores.includes(line)) {
      line.style.setProperty('--banner-line-fit', String(scoreFit))
      continue
    }
    fitLine(line)
  }
  function fitLine(line: HTMLElement) {
    const fit = room(line.parentElement!) / natural.get(line)!
    line.toggleAttribute('data-wrap', fit < floor && status.includes(line))
    const minimum = line.parentElement!.classList.contains('banner-initials') ? 0 : floor
    line.style.setProperty('--banner-line-fit', String(Math.max(minimum, Math.min(1, fit))))
  }
  // A tall wrapped detail cannot share the row without pushing its logos down.
  if (detailLine?.hasAttribute('data-wrap') && scores.length && !wideDetail
      && detailLine.offsetHeight > Math.max(logo, ...scores.map(score => score.offsetHeight))) {
    lineup.dataset.wideDetail = ''
    lineup.dataset.wideScoreDetail = ''
    fitLine(detailLine)
  }
  // Measure the final tracks, including any wrapped text. Changes to the
  // balancing padding leave these intrinsic track heights unchanged.
  const [upperHeight, , ...lowerTracks] = style.gridTemplateRows.split(' ').map(parseFloat)
  const lowerHeight = lowerTracks.reduce((height, track) => height + track, 0)
  lineup.style.setProperty('--banner-upper-block', `${upperHeight}px`)
  lineup.style.setProperty('--banner-lower-block', `${lowerHeight}px`)

  stateLine?.style.removeProperty('--banner-ink-offset')
  if (!scores.length || !stateLine) return
  if (inkContext === undefined) inkContext = document.createElement('canvas').getContext('2d')
  const context = inkContext
  if (!context) return
  const digits = scores.flatMap(score => inkBounds(score, context) ?? [])
  const stateInk = inkBounds(stateLine, context)
  if (stateInk && digits.length) {
    // A wrapped state still leaves one line's worth of clearance.
    const lineInkHeight = (stateInk.bottom - stateInk.top) / stateInk.lineCount
    const gap = Number(style.getPropertyValue('--banner-state-ink-gap')) * lineInkHeight
    const offset = Math.min(...digits.map(ink => ink.top)) - gap - stateInk.bottom
    stateLine.style.setProperty('--banner-ink-offset', `${offset.toFixed(3)}px`)
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
        <div v-if="!stale" class="banner-progress">
          <LiveProgress :starts-at="stream.starts_at" :ends-at="stream.ends_at" :always-live="stream.always_live" :now="now ?? initialNow" />
        </div>
      </div>
    </div>
  </div>
</template>
