<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src: string
    title: string
    timeoutMs?: number
  }>(),
  {
    timeoutMs: 12_000,
  },
)

const emit = defineEmits<{
  error: []
  load: []
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const loaded = ref(false)
let settled = false
let timeoutHandle: ReturnType<typeof setTimeout> | null = null

function clearTimer() {
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle)
    timeoutHandle = null
  }
}

function failOnce() {
  if (settled) return
  settled = true
  clearTimer()
  loaded.value = false
  emit('error')
}

function succeedOnce() {
  if (settled) return
  settled = true
  clearTimer()
  loaded.value = true
  emit('load')
}

function startTimer() {
  clearTimer()
  settled = false
  loaded.value = false
  if (!import.meta.client) return
  if (!props.src) {
    failOnce()
    return
  }
  timeoutHandle = setTimeout(() => {
    if (!loaded.value) {
      failOnce()
    }
  }, props.timeoutMs)
}

/**
 * Classify an iframe `load` event into `'loaded' | 'pending' | 'failed'`.
 * - `'pending'`: initial `about:blank` or an unconfirmed cross-origin error page;
 *   keep the 12s timer authoritative until a real load or timeout fires.
 * - `'failed'`: explicit browser error/blocked document; advance immediately.
 * - `'loaded'`: verified HTTP(S) document; clear the 12s timer and reveal frame.
 */
function classifyFrameLoad(el: HTMLIFrameElement): 'loaded' | 'pending' | 'failed' {
  let targetUrl: URL
  try {
    targetUrl = new URL(props.src, window.location.href)
  } catch {
    return 'failed'
  }

  const isSameOriginTarget = targetUrl.origin === window.location.origin

  try {
    const win = el.contentWindow
    const doc = el.contentDocument
    if (!win || !doc) {
      return 'failed'
    }
    const href = win.location.href
    if (!href || href === 'about:blank') {
      return 'pending'
    }
    if (win.location.protocol !== 'http:' && win.location.protocol !== 'https:') {
      return 'failed'
    }
    if (!isSameOriginTarget) {
      // Cross-origin target should never expose a readable location; if it did, navigation failed.
      return 'failed'
    }
    const hasContent = Boolean(
      doc.body && (doc.body.childElementCount > 0 || doc.body.textContent?.trim()),
    )
    return hasContent ? 'loaded' : 'pending'
  } catch {
    // Accessing contentWindow.location threw SecurityError (opaque or cross-origin document).
    // Chromium's internal `chrome-error://chromewebdata/` also throws SecurityError and fires `load`.
    // Check Resource Timing: a network failure produces no completed iframe entry (`responseEnd > 0`),
    // so keep the 12s timer authoritative unless an HTTP response completed.
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      const matching = entries.filter(
        (entry) => entry.initiatorType === 'iframe' && entry.name === targetUrl.href,
      )
      if (matching.length === 0 || matching.every((entry) => entry.responseEnd === 0)) {
        return 'pending'
      }
    }
    return 'loaded'
  }
}

function handleLoad(event: Event) {
  if (!props.src || settled) return
  const el = (event.currentTarget as HTMLIFrameElement | null) ?? frameRef.value
  if (!el) return
  const outcome = classifyFrameLoad(el)
  if (outcome === 'loaded') {
    succeedOnce()
  } else if (outcome === 'failed') {
    failOnce()
  }
  // When outcome === 'pending', the 12s timer remains authoritative until it fires.
}

function handleError() {
  failOnce()
}

function handleWindowMessage(event: MessageEvent) {
  if (settled || !frameRef.value?.contentWindow) return
  if (event.source === frameRef.value.contentWindow) {
    succeedOnce()
  }
}

watch(
  () => props.src,
  () => {
    startTimer()
  },
)

onMounted(() => {
  window.addEventListener('message', handleWindowMessage)
  startTimer()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleWindowMessage)
  clearTimer()
})
</script>

<template>
  <div class="relative aspect-video w-full overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
    <div
      v-if="!loaded"
      aria-live="polite"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-2 text-xs text-muted motion-safe:animate-pulse"
    >
      <span>Loading player embed…</span>
    </div>

    <iframe
      v-if="src"
      ref="frameRef"
      :key="src"
      :src="src"
      :title="title"
      allow="autoplay; fullscreen; picture-in-picture"
      allowfullscreen
      class="h-full w-full border-0"
      @load="handleLoad"
      @error="handleError"
    />
  </div>
</template>
