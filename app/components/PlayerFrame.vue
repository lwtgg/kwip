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
  if (frameHasDocument()) succeedOnce()
}

function handleError() {
  if (frameHasDocument(true)) succeedOnce()
  else failOnce()
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
  { flush: 'post' },
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
