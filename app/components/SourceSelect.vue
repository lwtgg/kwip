<script setup lang="ts">
import type { SourceOption } from '~/composables/usePlayerSources'

export interface SelectableSourceOption extends SourceOption {
  kind?: 'iframe' | 'link'
}

defineProps<{
  sources: SelectableSourceOption[]
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [index: number]
}>()

const selectId = useId()

function onChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const next = Number.parseInt(target.value, 10)
  if (!Number.isNaN(next)) {
    emit('update:modelValue', next)
  }
}
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <label :for="selectId" class="text-xs font-medium text-muted">
      Change source
    </label>
    <select
      :id="selectId"
      :value="sources.length > 0 && modelValue >= 0 && modelValue < sources.length ? modelValue : ''"
      :disabled="sources.length === 0"
      class="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg disabled:cursor-not-allowed disabled:opacity-50"
      @change="onChange"
    >
      <option
        value=""
        disabled
        :selected="!(sources.length > 0 && modelValue >= 0 && modelValue < sources.length)"
      >
        Change source
      </option>
      <option
        v-for="(source, index) in sources"
        :key="`${index}-${source.url}`"
        :value="index"
        :selected="index === modelValue"
      >
        {{ source.kind === 'link' ? `${source.label} (Link ↗)` : source.label }}
      </option>
    </select>
  </div>
</template>
