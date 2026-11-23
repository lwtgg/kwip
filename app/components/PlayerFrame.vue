<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src?: string
    title: string
    poster?: string | null
    sandbox?: string
    timeoutMs?: number
    lazy?: boolean
  }>(),
  {
    timeoutMs: 12_000,
  },
)

const emit = defineEmits<{
  error: []
  load: []
}>()

const playerRef = ref<HTMLDivElement | null>(null)
const frameRef = ref<HTMLIFrameElement | null>(null)
const enteredViewport = ref(false)
const frameSrc = computed(() => (!props.lazy || enteredViewport.value) ? props.src : undefined)
const loaded = ref(false)
const frameFocused = ref(false)
let focusFrame: number | null = null
let settled = false
let timeoutHandle: ReturnType<typeof setTimeout> | null = null
let viewportObserver: IntersectionObserver | undefined

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
  if (!import.meta.client || !frameSrc.value) return
  if (frameHasDocument()) {
    succeedOnce()
    return
  }
  timeoutHandle = setTimeout(() => {
    if (frameHasDocument(true)) succeedOnce()
    else failOnce()
  }, props.timeoutMs)
}

function frameHasDocument(allowLoading = false): boolean {
  const frame = frameRef.value
  const win = frame?.contentWindow
  if (!frame || !win) return false

  try {
    const protocol = win.location.protocol
    if (protocol !== 'http:' && protocol !== 'https:') return false
    const doc = win.document
    return doc.readyState === 'complete' || (allowLoading && Boolean(doc.documentElement))
  } catch {
    // Cross-origin documents are opaque. A completed iframe resource can confirm
    // the navigation even when the load event fired before hydration.
    return performance.getEntriesByName(frame.src, 'resource').some((entry) => {
      const resource = entry as PerformanceResourceTiming
      return resource.initiatorType === 'iframe' && resource.responseEnd > 0
    })
  }
}

function handleLoad() {
  if (frameSrc.value && frameHasDocument()) succeedOnce()
}

function handleError() {
  if (!frameSrc.value) return
  if (frameHasDocument(true)) succeedOnce()
  else failOnce()
}

function handleWindowMessage(event: MessageEvent) {
  if (!frameSrc.value || settled || !frameRef.value?.contentWindow) return
  if (event.source === frameRef.value.contentWindow) {
    succeedOnce()
  }
}

function syncFrameFocus() {
  if (focusFrame !== null) cancelAnimationFrame(focusFrame)
  focusFrame = requestAnimationFrame(() => {
    // Entering a cross-origin frame can leave the iframe as activeElement
    // without matching :focus-within in the parent document.
    frameFocused.value = document.activeElement === frameRef.value
    focusFrame = null
  })
}

watch(
  [frameSrc, () => props.sandbox],
  () => {
    startTimer()
    syncFrameFocus()
  },
  { flush: 'post' },
)

onMounted(() => {
  if (props.lazy) {
    const player = playerRef.value
    if (player && 'IntersectionObserver' in window) {
      // Native lazy loading can start near the viewport. Wait for the player to
      // enter it before mounting the frame and starting its failure timer.
      viewportObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        enteredViewport.value = true
        viewportObserver?.disconnect()
      })
      viewportObserver.observe(player)
    } else {
      enteredViewport.value = true
    }
  }
  window.addEventListener('message', handleWindowMessage)
  window.addEventListener('blur', syncFrameFocus)
  document.addEventListener('focusout', syncFrameFocus)
  document.addEventListener('focusin', syncFrameFocus)
  syncFrameFocus()
  startTimer()
})

onBeforeUnmount(() => {
  viewportObserver?.disconnect()
  window.removeEventListener('message', handleWindowMessage)
  window.removeEventListener('blur', syncFrameFocus)
  document.removeEventListener('focusout', syncFrameFocus)
  document.removeEventListener('focusin', syncFrameFocus)
  if (focusFrame !== null) cancelAnimationFrame(focusFrame)
  clearTimer()
})
</script>

<template>
  <div ref="playerRef" class="relative aspect-video w-full overflow-hidden rounded-card bg-surface"
    :class="{ '[@media(scripting:none)]:hidden': !src }"
  >
    <div
      v-if="!loaded"
      aria-live="polite"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-2 text-xs text-muted [@media(scripting:none)]:hidden"
    >
      <img
        v-if="poster"
        :src="poster"
        alt=""
        width="1280"
        height="720"
        decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
      >
      <span class="relative rounded-control bg-surface-2 px-3 py-2">Loading player embed…</span>
    </div>

    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 z-20 rounded-[inherit]"
      :class="{ 'outline-(length:--focus-ring-width) outline-offset-(--focus-ring-inset) outline-(--focus-ring)': frameFocused }"
    />

    <iframe
      v-if="frameSrc"
      ref="frameRef"
      :key="JSON.stringify([frameSrc, sandbox])"
      :loading="lazy ? 'lazy' : undefined"
      :src="frameSrc"
      :title="title"
      :sandbox="sandbox"
      allow="autoplay; fullscreen; picture-in-picture"
      allowfullscreen
      class="h-full w-full border-0"
      @load="handleLoad"
      @error="handleError"
    />
  </div>
</template>
