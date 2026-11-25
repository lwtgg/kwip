<script setup lang="ts">
import { watch } from 'vue'
import { matchBannerContent } from '~/composables/matchBanner'
import { cardTintStyle } from '~/composables/useCardTint'
import type { FeedStreamItem } from '~/composables/useFeed'
import { playerShieldSandbox } from '~/utils/sourceIdentity'
import { canMountHeroFrame, heroFrameUrl, isZliveEmbed } from '~/utils/topEvent'
import { formatViewersCompact, formatViewersExact } from '~/utils/viewers'

const props = withDefaults(
  defineProps<{
    stream?: FeedStreamItem
    variant?: 'default' | 'skeleton'
    now?: number
    stale?: boolean
    countdown?: string
    to?: string
    metricLabel?: 'viewers' | 'views'
    headingLevel?: 'h1' | 'h2' | 'h3'
    scale?: 'listing' | 'hero'
    hero?: boolean
    heroEmbed?: string
    heroLive?: boolean
  }>(),
  {
    stream: undefined,
    variant: 'default',
    now: undefined,
    countdown: '',
    to: '',
    metricLabel: 'viewers',
    headingLevel: 'h3',
    scale: 'listing',
  },
)

const tint = computed(() => cardTintStyle(props.stream?.colors, props.scale))

const targetHref = computed(() => {
  if (props.to) return props.to
  return props.stream ? `/live/${props.stream.uri_name}` : '/'
})

const matchContent = computed(() => {
  const stream = props.stream
  if (!stream?.match) return undefined
  return matchBannerContent(stream.match, stream.viewers ?? 0, props.metricLabel, !!props.stale)
})

const compact = computed(() => formatViewersCompact(props.stream?.viewers ?? 0))
const exact = computed(() => formatViewersExact(props.stream?.viewers ?? 0))
// "1 viewer", "2 viewers": the unit follows the exact count the label reads out.
const metric = computed(() => exact.value === '1' ? props.metricLabel.replace(/s$/, '') : props.metricLabel)
const matchFacts = computed(() => {
  if (!props.stream) return ''
  const start = new Date(props.stream.starts_at * 1000)
  const time = props.stream.always_live === 1 ? '24/7'
    : props.stream.starts_at > 0 && Number.isFinite(start.getTime())
      ? `${props.stale ? 'Last listed' : 'Kickoff'} ${start.toUTCString().replace('GMT', 'UTC')}`
      : 'Time unavailable'
  return props.stale ? `Unconfirmed. ${time}.` : `${time}.`
})

const reservesPlayer = computed(() => props.hero && !!props.heroEmbed)
const playerBox = ref<HTMLElement | null>(null)
const inViewport = ref(false)
const visible = ref(false)
const saveData = ref(false)
const startedKey = ref<string>()
const sound = ref(false)
const soundOnLabel = 'Sound on'
const frameKey = ref(0)
const zlive = computed(() => !!props.heroEmbed && isZliveEmbed(props.heroEmbed))
const heroKey = computed(() => props.heroEmbed && JSON.stringify([props.stream?.uri_name, props.heroEmbed]))
const held = computed(() => saveData.value && zlive.value && startedKey.value !== heroKey.value)
const mountedPlayer = computed<string | undefined>((previous) => {
  const key = heroKey.value
  // A Save-Data change can hold the next mount without interrupting the current frame.
  if (key && canMountHeroFrame(inViewport.value, visible.value, held.value && previous !== key)) {
    return key
  }
})
const frameMounted = computed(() => !!mountedPlayer.value)
const frameSrc = computed(() => props.heroEmbed && heroFrameUrl(props.heroEmbed, !!props.heroLive, sound.value))

function handlePlayback(event: MouseEvent) {
  if (!frameMounted.value) {
    startedKey.value = heroKey.value
    const button = event.currentTarget as HTMLButtonElement
    const top = button.getBoundingClientRect().top
    const clearance = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
    if (top < clearance || (playerBox.value && playerBox.value.getBoundingClientRect().top >= window.innerHeight)) {
      window.scrollBy({ top: top - clearance, behavior: 'instant' })
    }
    return
  }
  sound.value = !sound.value
  frameKey.value++
}

if (props.hero) {
  watch(heroKey, () => { startedKey.value = undefined }, { flush: 'sync' })

  // Returning to the slot always starts muted. The only unmuting path is a tap.
  watch([frameMounted, heroKey, () => props.heroLive], () => {
    sound.value = false
  }, { flush: 'sync' })

  watch([playerBox, () => !!props.heroEmbed], ([box, hasEmbed], _, onCleanup) => {
    if (!box || !hasEmbed) return
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection
    const syncConnection = () => { saveData.value = connection?.saveData === true }
    const syncVisibility = () => { visible.value = document.visibilityState === 'visible' }
    syncConnection()
    syncVisibility()
    connection?.addEventListener('change', syncConnection)
    document.addEventListener('visibilitychange', syncVisibility)
    const observer = new IntersectionObserver(([entry]) => {
      inViewport.value = !!entry?.isIntersecting
    })
    observer.observe(box)
    onCleanup(() => {
      observer.disconnect()
      connection?.removeEventListener('change', syncConnection)
      document.removeEventListener('visibilitychange', syncVisibility)
      inViewport.value = false
    })
  }, { flush: 'post' })
}
</script>

<template>
  <div
    v-if="!stream"
    aria-hidden="true"
    data-variant="skeleton"
    class="card-row min-h-target rounded-row bg-surface"
  >
    <div class="card-art bg-surface-2" />
    <div class="card-category h-3 w-16 rounded-plate bg-surface-2" />
    <div class="card-name h-4 w-4/5 rounded-plate bg-surface-2" />
    <div class="card-lane">
      <div class="h-(--card-time-size) w-full rounded-plate bg-surface-2" />
    </div>
  </div>

  <div v-else :class="reservesPlayer ? 'hero-card overflow-hidden rounded-row bg-surface' : 'contents'">
    <div :class="reservesPlayer ? 'hero-plate rounded-row' : 'contents'">
      <NuxtLink
        :to="targetHref"
        :data-variant="variant"
        :style="stream.match ? undefined : tint"
        class="event-card group min-h-target rounded-row"
        :class="[hero ? 'card-hero' : 'card-row', { 'h-full': !reservesPlayer }, { 'card-matched': stream.match, 'hero-plate-link': reservesPlayer }]"
      >
        <template v-if="matchContent">
          <component :is="headingLevel" class="sr-only">{{ matchContent.label }}</component>
          <span class="sr-only">{{ matchFacts }}</span>
          <MatchBanner :stream="stream" :now="now" :stale="stale" :scale="scale" :content="matchContent" :audience-in-footer="reservesPlayer" />
        </template>
        <template v-else>
          <div
            class="card-art relative w-full overflow-hidden bg-surface-2"
            :class="{ 'rounded-row': hero }"
          >
            <PosterFallback :name="stream.name" :colors="stream.colors" />
          </div>

          <div class="card-info">
            <span class="card-category text-metadata text-muted"><span>{{ stream.category_name }}</span><span v-if="stream.tag"> · {{ stream.tag }}</span></span>
            <component :is="headingLevel" class="card-name wrap-anywhere leading-snug text-fg group-hover:underline">
              {{ stream.name }}
            </component>
            <CardTiming :starts-at="stream.starts_at" :ends-at="stream.ends_at" :always-live="stream.always_live"
              :now="now" :stale="stale" :replay="metricLabel === 'views'" :event-date="countdown" />
            <div class="card-meta gap-x-3 text-metadata text-muted">
              <!-- Stale rows are qualified in the lane (Unconfirmed, Last listed) and by the page notice. -->
              <span v-if="!stale && !reservesPlayer" role="img" :aria-label="`${exact} ${metric}`" class="listing-numeric">
                <span aria-hidden="true">{{ compact }} {{ metric }}</span>
              </span>
              <span v-if="!stale && reservesPlayer" class="sr-only">{{ exact }} {{ metric }}</span>
              <span class="group-hover:underline">Watch</span>
            </div>
          </div>
        </template>
      </NuxtLink>
      <div v-if="reservesPlayer && (!stale || zlive)" class="hero-footer">
        <span v-if="!stale" aria-hidden="true"
          class="listing-numeric wrap-anywhere text-metadata text-muted">
          {{ matchContent?.tiers[2] ?? `${compact} ${metric}` }}
        </span>
        <button
          v-if="zlive"
          type="button"
          class="hero-sound min-h-11 min-w-11 rounded-control bg-surface-2 px-3 text-metadata text-fg hover:bg-surface"
          :data-label="soundOnLabel"
          @click="handlePlayback"
        >
          <span>{{ !frameMounted ? 'Play' : sound ? 'Mute' : soundOnLabel }}</span>
        </button>
      </div>
    </div>
    <div v-if="reservesPlayer" ref="playerBox" class="hero-player aspect-video w-full bg-surface-2">
      <iframe
        v-if="frameMounted"
        :key="frameKey"
        :src="frameSrc"
        :title="stream.name"
        :sandbox="zlive ? playerShieldSandbox : undefined"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
        class="block h-full w-full border-0"
      />
    </div>
  </div>
</template>
