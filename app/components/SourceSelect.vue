<script setup lang="ts">
import type { SourceOption } from '~/composables/usePlayerSources'

export type SelectableSourceOption = SourceOption

const props = defineProps<{
  sources: SelectableSourceOption[]
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [key: string]
}>()

const id = useId()
const group = ref<HTMLDivElement | null>(null)
const mounted = ref(false)
onMounted(() => { mounted.value = true })

// Remounting the player frame can pull focus into it; put it back on the chip.
let holdTimer: ReturnType<typeof setTimeout> | null = null

function holdFocus(key: string) {
  if (holdTimer) clearTimeout(holdTimer)
  let tries = 0
  const tick = () => {
    const chip = findChip(key)
    if (chip && document.activeElement?.tagName === 'IFRAME') chip.focus()
    if (++tries < 12) holdTimer = setTimeout(tick, 100)
  }
  holdTimer = setTimeout(tick, 100)
}

onBeforeUnmount(() => {
  if (holdTimer) clearTimeout(holdTimer)
})

const hasSelection = computed(() =>
  props.sources.some((source) => source.key === props.modelValue),
)

function findChip(key: string) {
  return Array.from(group.value?.querySelectorAll('button') ?? [])
    .find((chip) => chip.value === key)
}

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

  const source = props.sources[next]
  if (!source) return

  event.preventDefault()
  emit('update:modelValue', source.key)
  void nextTick(() => findChip(source.key)?.focus())
  holdFocus(source.key)
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
          :key="source.key"
          type="button"
          :value="source.key"
          :aria-describedby="source.host ? `${id}-host-${index}` : undefined"
          :aria-label="source.origin === 'supplement' ? `${source.label}${source.live === false ? ', Not live' : ''}, second provider` : undefined"
          :aria-pressed="source.key === modelValue"
          :tabindex="(hasSelection ? source.key === modelValue : index === 0) ? 0 : -1"
          class="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-start text-sm font-medium min-[641px]:min-h-0"
          :class="[
            source.key === modelValue ? 'border-accent' : 'border-border hover:border-accent',
            source.live === false ? 'bg-surface-2 text-muted'
              : source.key === modelValue ? 'bg-accent-strong text-accent-strong-fg' : 'bg-surface-2 text-fg',
          ]"
          @click="emit('update:modelValue', source.key)"
          @keydown="onChipKeydown($event, index)"
        >
          <span class="min-w-0 wrap-anywhere">
            {{ source.label }}
            <span v-if="source.live === false"> · Not live</span>
            <span v-if="sources.length > 1 && source.host" aria-hidden="true" class="block text-xs" :class="source.key === modelValue && source.live !== false ? 'text-accent-strong-fg' : 'text-muted'">
              {{ source.host }}
            </span>
            <span v-if="source.host" :id="`${id}-host-${index}`" class="sr-only" aria-hidden="true">{{ source.host }}</span>
          </span>
          <span v-if="source.origin === 'supplement'" aria-hidden="true" class="shrink-0 text-xs">2nd</span>
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
            v-for="source in sources"
            :key="source.key"
            :value="source.key"
            :selected="source.key === modelValue"
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
