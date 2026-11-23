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

const selected = computed(() => props.sources.find(source => source.key === props.modelValue))
const alternatives = computed(() => props.sources.filter(source => source.key !== props.modelValue))
const nativeAlternatives = computed(() => props.sources.filter(source => source.key !== props.noscriptSourceKey))
const groups = computed(() => [
  { label: 'Selected source', sources: selected.value ? [selected.value] : [], selected: true },
  { label: 'Change source', sources: alternatives.value, selected: false },
].filter(group => group.sources.length))
const orderedSources = computed(() => groups.value.flatMap(group => group.sources))
const focusedKey = ref<string>()
const tabStop = computed(() => orderedSources.value.find(source => source.key === focusedKey.value)?.key
  ?? orderedSources.value[0]?.key)

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
  const hadFocus = document.activeElement === event.currentTarget
  emit('source-click', event, key)
  emit('update:modelValue', key)
  if (hadFocus) {
    void nextTick(() => findChip(key)?.focus({ preventScroll: event.detail > 0 }))
    if (event.detail === 0 && key !== props.modelValue) holdFocus(key)
  }
}

function findChip(key: string) {
  return Array.from(group.value?.querySelectorAll('button') ?? [])
    .find((chip) => chip.value === key)
}

function onChipKeydown(event: KeyboardEvent, key: string) {
  const sources = orderedSources.value
  const index = sources.findIndex(source => source.key === key)
  const count = sources.length
  let next: number
  switch (event.key) {
    case 'ArrowLeft': next = (index + count - 1) % count; break
    case 'ArrowRight': next = (index + 1) % count; break
    case 'Home': next = 0; break
    case 'End': next = count - 1; break
    default: return
  }

  const source = sources[next]
  if (!source) return

  event.preventDefault()
  findChip(source.key)?.focus()
}
</script>

<template>
  <div class="min-w-0">
    <div
      ref="group"
      role="group"
      aria-label="Playback source"
      class="[@media(scripting:none)]:hidden"
      :class="{ invisible: !mounted }"
    >
      <div
        v-for="section in groups"
        :key="section.label"
        role="group"
        :aria-label="section.label"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4"
        :class="section.selected ? 'border-b border-border bg-surface-2 py-1' : 'py-(--player-tools-padding)'"
      >
        <span aria-hidden="true" class="text-metadata font-medium text-muted">{{ section.label }}</span>
        <button
          v-for="(source, index) in section.sources"
          :key="source.key"
          type="button"
          :value="source.key"
          data-allow-mismatch="class,attribute"
          :aria-describedby="distinctHost(source) ? `${id}-host-${section.selected}-${index}` : undefined"
          :aria-label="chipLabel(source)"
          :aria-pressed="source.key === modelValue"
          :tabindex="tabStop === source.key ? 0 : -1"
          class="inline-flex min-h-target min-w-target max-w-full items-center gap-2 rounded-control border px-3 py-2 text-start text-metadata font-medium hover:bg-surface-2"
          :class="[
            section.selected ? 'border-transparent bg-surface-2 font-semibold' : 'border-control-surface bg-surface hover:border-control',
            chipStatus(source) ? 'text-muted' : 'text-fg',
          ]"
          @focus="focusedKey = source.key"
          @click="onChipClick($event, source.key)"
          @keydown="onChipKeydown($event, source.key)"
        >
          <span class="min-w-0 wrap-anywhere" data-allow-mismatch="children">
            {{ source.label }}
            <span v-if="chipStatus(source)"> · {{ chipStatus(source) }}</span>
            <span v-if="!section.selected && sources.length > 1 && distinctHost(source)" :id="`${id}-host-${section.selected}-${index}`" aria-hidden="true" class="block text-xs text-muted no-underline">
              {{ source.host }}
            </span>
            <span v-if="(section.selected || sources.length === 1) && distinctHost(source)" :id="`${id}-host-${section.selected}-${index}`" class="sr-only" aria-hidden="true">{{ source.host }}</span>
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
      <div v-if="selected" role="group" aria-label="Selected source" class="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-3 text-metadata">
        <span aria-hidden="true" class="font-medium text-muted">Selected source</span>
        <span class="wrap-anywhere font-semibold text-fg">{{ selected.label }}</span>
      </div>
      <form v-if="nativeAlternatives.length" method="get" class="flex flex-wrap items-center gap-2 px-4 py-3">
        <label :for="id" class="text-metadata font-medium text-muted">Change source</label>
        <select
          :id="id"
          name="source"
          required
          class="min-h-target min-w-0 max-w-full rounded-control border border-control bg-surface-2 px-3 py-2 text-sm text-fg"
        >
          <option value="" disabled selected>Change source</option>
          <option
            v-for="source in nativeAlternatives"
            :key="source.key"
            :value="source.key"
          >
            {{ source.kind === 'link' ? `${source.label} (Link ↗)` : source.label }}
          </option>
        </select>
        <button
          type="submit"
          class="rounded-control border border-control bg-surface-2 px-3 py-2 text-sm text-fg min-h-target"
        >
          Change source
        </button>
      </form>
    </noscript>
  </div>
</template>
