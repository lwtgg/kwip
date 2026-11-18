import { decodeBlurhash } from '~/utils/blurhash'
import { onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

const width = 32
const height = 18
const cache = new Map<string, string | undefined>()

export function blurBackground(hash: MaybeRefOrGetter<string | undefined>) {
  const background = ref<string>()

  onMounted(() => {
    watch(() => toValue(hash), (value, _, onCleanup) => {
      background.value = value ? cache.get(value) : undefined
      if (!value || cache.has(value)) return

      const render = () => {
        if (!cache.has(value)) {
          const pixels = decodeBlurhash(value, width, height)
          let url: string | undefined
          if (pixels) {
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const context = canvas.getContext('2d')
            if (context) {
              const image = context.createImageData(width, height)
              image.data.set(pixels)
              context.putImageData(image, 0, 0)
              url = `url(${canvas.toDataURL('image/png')})`
            }
          }
          cache.set(value, url)
          if (cache.size > 200) cache.delete(cache.keys().next().value!)
        }
        background.value = cache.get(value)
      }

      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(render)
        onCleanup(() => window.cancelIdleCallback(id))
      } else {
        const id = window.setTimeout(render, 0)
        onCleanup(() => window.clearTimeout(id))
      }
    }, { immediate: true })
  })

  return background
}
