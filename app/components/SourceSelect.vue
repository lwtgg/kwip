<script setup lang="ts">
import type { SourceOption } from '~/composables/usePlayerSources'

export type SelectableSourceOption = SourceOption

const props = defineProps<{
  sources: SelectableSourceOption[]
  modelValue: string | null
  clickUnder?: boolean
  failedKeys?: string[]
  noscriptSourceKey?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [key: string]
  'source-click': [event: MouseEvent, key: string]
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

function chipStatus(source: SelectableSourceOption) {
  if (props.failedKeys?.includes(source.key)) return 'Failed'
  if (source.live === false) return 'Not live'
  if (source.degraded) return 'Degraded'
}

function distinctHost(source: SelectableSourceOption) {
  const hint = source.label.split(' · ')[0]?.toLowerCase()
  return hint === source.host?.toLowerCase() ? undefined : source.host
}

function chipLabel(source: SelectableSourceOption) {
  const opensAd = props.clickUnder && source.key !== props.modelValue
  const status = chipStatus(source)
  if (!status && !opensAd && !source.origin) return undefined
  return source.label +
    (status === 'Failed' ? ', Failed to load' : status ? `, ${status}` : '') +
    (source.origin === 'supplement' ? ', second provider' : source.origin === 'pitsport' ? ', third provider' : '') +
    (opensAd ? '. Opens an advertiser in a new tab' : '')
}

function onChipClick(event: MouseEvent, key: string) {
  emit('source-click', event, key)
  emit('update:modelValue', key)
}

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
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-2 [@media(scripting:none)]:hidden"
      :class="{ invisible: !mounted }"
    >
      <span :id="`${id}-label`" class="text-metadata font-medium text-muted">Change source</span>
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
          data-allow-mismatch="class,attribute"
          :aria-describedby="distinctHost(source) ? `${id}-host-${index}` : undefined"
          :aria-label="chipLabel(source)"
          :aria-pressed="source.key === modelValue"
          :tabindex="(hasSelection ? source.key === modelValue : index === 0) ? 0 : -1"
          class="inline-flex min-h-target min-w-0 max-w-full items-center gap-2 rounded-control border border-control px-3 py-2 text-start text-metadata font-medium hover:bg-surface-2"
          :class="[
            source.key === modelValue ? 'bg-surface-2 font-semibold' : 'bg-surface',
            chipStatus(source) ? 'text-muted' : 'text-fg',
          ]"
          @click="onChipClick($event, source.key)"
          @keydown="onChipKeydown($event, index)"
        >
          <span class="min-w-0 wrap-anywhere" data-allow-mismatch="children">
            {{ source.label }}
            <span v-if="chipStatus(source)"> · {{ chipStatus(source) }}</span>
            <span v-if="sources.length > 1 && distinctHost(source)" :id="`${id}-host-${index}`" aria-hidden="true" class="block text-xs text-muted no-underline">
              {{ source.host }}
            </span>
            <span v-if="sources.length === 1 && distinctHost(source)" :id="`${id}-host-${index}`" class="sr-only" aria-hidden="true">{{ source.host }}</span>
          </span>
          <span v-if="source.origin === 'supplement'" aria-hidden="true" class="shrink-0 text-xs">2nd</span>
          <span v-if="source.origin === 'pitsport'" aria-hidden="true" class="shrink-0 text-xs">3rd</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4 shrink-0"
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
        <label :for="id" class="text-metadata font-medium text-muted">Change source</label>
        <select
          :id="id"
          name="source"
          :disabled="sources.length === 0"
          class="min-h-target min-w-0 max-w-full rounded-control border border-control bg-surface-2 px-3 py-2 text-sm text-fg disabled:cursor-not-allowed"
        >
          <option value="" disabled :selected="!noscriptSourceKey">Change source</option>
          <option
            v-for="source in sources"
            :key="source.key"
            :value="source.key"
            :selected="source.key === noscriptSourceKey"
          >
            {{ source.kind === 'link' ? `${source.label} (Link ↗)` : source.label }}
          </option>
        </select>
        <button
          type="submit"
          :disabled="sources.length === 0"
          class="rounded-control border border-control bg-surface-2 px-3 py-2 text-sm text-fg min-h-target"
        >
          Change source
        </button>
      </form>
    </noscript>
  </div>
</template>
