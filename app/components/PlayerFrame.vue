<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src: string
    title: string
    poster?: string | null
    sandbox?: string
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
const frameFocused = ref(false)
let focusFrame: number | null = null
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
  [() => props.src, () => props.sandbox],
  () => {
    startTimer()
    syncFrameFocus()
  },
  { flush: 'post' },
)

onMounted(() => {
  window.addEventListener('message', handleWindowMessage)
  window.addEventListener('blur', syncFrameFocus)
  document.addEventListener('focusout', syncFrameFocus)
  document.addEventListener('focusin', syncFrameFocus)
  syncFrameFocus()
  startTimer()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleWindowMessage)
  window.removeEventListener('blur', syncFrameFocus)
  document.removeEventListener('focusout', syncFrameFocus)
  document.removeEventListener('focusin', syncFrameFocus)
  if (focusFrame !== null) cancelAnimationFrame(focusFrame)
  clearTimer()
})
</script>

<template>
  <div class="relative aspect-video w-full overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
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
      <span class="relative rounded-full bg-surface-2 px-3 py-1.5">Loading player embed…</span>
    </div>

    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 z-20 rounded-[inherit]"
      :class="{ 'outline-2 outline-offset-[-2px] outline-[var(--focus-ring)]': frameFocused }"
    />

    <iframe
      v-if="src"
      ref="frameRef"
      :key="JSON.stringify([src, sandbox])"
      :src="src"
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
