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

const loaded = ref(false)
let timeoutHandle: ReturnType<typeof setTimeout> | null = null

function clearTimer() {
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle)
    timeoutHandle = null
  }
}

function startTimer() {
  clearTimer()
  loaded.value = false
  if (!import.meta.client) return
  if (!props.src) {
    emit('error')
    return
  }
  timeoutHandle = setTimeout(() => {
    if (!loaded.value) {
      emit('error')
    }
  }, props.timeoutMs)
}

function handleLoad() {
  if (!props.src) return
  clearTimer()
  loaded.value = true
  emit('load')
}

function handleError() {
  clearTimer()
  emit('error')
}

watch(
  () => props.src,
  () => {
    startTimer()
  },
)

onMounted(() => {
  startTimer()
})

onBeforeUnmount(() => {
  clearTimer()
})
</script>

<template>
  <div class="relative aspect-video w-full overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
    <div
      v-if="!loaded"
      aria-live="polite"
      class=" absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-2 text-xs text-muted motion-safe:animate-pulse"
    >
      <span>Loading player embed…</span>
    </div>

    <iframe
      v-if="src"
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
