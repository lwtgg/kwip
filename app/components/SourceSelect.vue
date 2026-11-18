<script setup lang="ts">
import type { SourceOption } from '~/composables/usePlayerSources'

export type SelectableSourceOption = SourceOption

const props = defineProps<{
  sources: SelectableSourceOption[]
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [index: number]
}>()

const id = useId()
const group = ref<HTMLDivElement | null>(null)
const mounted = ref(false)
onMounted(() => { mounted.value = true })

// Remounting the player frame can pull focus into it; put it back on the chip.
let holdTimer: ReturnType<typeof setTimeout> | null = null

function holdFocus(index: number) {
  if (holdTimer) clearTimeout(holdTimer)
  let tries = 0
  const tick = () => {
    const chip = group.value?.querySelectorAll('button')[index]
    if (chip && document.activeElement?.tagName === 'IFRAME') chip.focus()
    if (++tries < 12) holdTimer = setTimeout(tick, 100)
  }
  holdTimer = setTimeout(tick, 100)
}

onBeforeUnmount(() => {
  if (holdTimer) clearTimeout(holdTimer)
})

const hasSelection = computed(() =>
  Number.isInteger(props.modelValue) && props.modelValue >= 0 && props.modelValue < props.sources.length,
)

function onChipKeydown(event: KeyboardEvent, index: number) {
  const count = props.sources.length
  let next: number
  switch (event.key) {
    case 'ArrowLeft': next = (index + count - 1) % count; break
    case 'ArrowRight': next = (index + 1) % count; break
    case 'Home': next = 0; break
    case 'End': next = count - 1; break
    default: return
  }

  event.preventDefault()
  emit('update:modelValue', next)
  void nextTick(() => group.value?.querySelectorAll('button')[next]?.focus())
  holdFocus(next)
}
</script>

<template>
  <div class="min-w-0">
    <div v-show="mounted" class="flex flex-wrap items-center gap-2">
      <span :id="`${id}-label`" class="text-xs font-medium text-muted">Change source</span>
      <div
        ref="group"
        role="group"
        aria-label="Playback source"
        :aria-describedby="`${id}-label`"
        class="flex min-w-0 flex-wrap gap-2"
      >
        <button
          v-for="(source, index) in sources"
          :key="`${index}-${source.url}`"
          type="button"
          role="button"
          :aria-pressed="index === modelValue"
          :tabindex="index === (hasSelection ? modelValue : 0) ? 0 : -1"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium min-[641px]:min-h-0"
          :class="index === modelValue ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface-2 text-fg hover:border-accent'"
          @click="emit('update:modelValue', index)"
          @keydown="onChipKeydown($event, index)"
        >
          {{ source.label }}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-3.5 shrink-0"
          >
            <path v-if="source.kind === 'link'" d="M7 17 17 7M7 7h10v10" />
            <rect v-else x="3" y="5" width="18" height="14" rx="2" />
          </svg>
        </button>
      </div>
    </div>

    <!-- The browser parses noscript contents as text when scripting is enabled. -->
    <noscript v-once data-allow-mismatch="children">
      <form method="get" class="flex flex-wrap items-center gap-2">
        <label :for="id" class="text-xs font-medium text-muted">Change source</label>
        <select
          :id="id"
          name="source"
          :disabled="sources.length === 0"
          class="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg max-sm:min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled :selected="!hasSelection">Change source</option>
          <option
            v-for="(source, index) in sources"
            :key="`${index}-${source.url}`"
            :value="index"
            :selected="index === modelValue"
          >
            {{ source.kind === 'link' ? `${source.label} (Link ↗)` : source.label }}
          </option>
        </select>
        <button
          type="submit"
          :disabled="sources.length === 0"
          class="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg max-sm:min-h-11"
        >
          Change source
        </button>
      </form>
    </noscript>
  </div>
</template>
