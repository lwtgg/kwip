import type { MaybeRefOrGetter } from 'vue'

export function useOgImage(
  source: MaybeRefOrGetter<string | undefined>,
  alt: MaybeRefOrGetter<string>,
) {
  const { canonicalHost } = useRuntimeConfig().public
  const origin = `https://${canonicalHost}`
  const defaultImage = `${origin}/og-default.jpg`
  const image = computed(() => {
    const poster = toValue(source)
    if (poster?.startsWith('/') && !poster.startsWith('//')) return `${origin}${poster}`
    if (poster && /^https?:\/\//i.test(poster) && URL.canParse(poster)) return poster
    return defaultImage
  })

  useSeoMeta({
    ogImage: image,
    ogImageAlt: () => toValue(alt),
    twitterCard: 'summary_large_image',
  })
  // Null content clears the inherited dimension tags from the rendered head.
  useHead({
    meta: [
      { property: 'og:image:width', content: () => image.value === defaultImage ? 1200 : null },
      { property: 'og:image:height', content: () => image.value === defaultImage ? 523 : null },
    ],
  })
}
