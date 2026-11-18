export type DensityMode = 'comfortable' | 'compact'

const DENSITY_COOKIE_KEY = 'density'

export function resolveDensity(cookieValue: string | null | undefined): DensityMode {
  return cookieValue === 'compact' ? 'compact' : 'comfortable'
}

function applyDomDensity(mode: DensityMode) {
  if (!import.meta.client) return
  document.documentElement.setAttribute('data-density', mode)
}

export function useDensity() {
  const cookie = useCookie<DensityMode | null>(DENSITY_COOKIE_KEY, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    default: () => null,
  })

  const density = useState<DensityMode>('ui:density', () => resolveDensity(cookie.value))

  useHead({
    htmlAttrs: {
      'data-density': () => density.value,
    },
  })

  if (import.meta.client) {
    onMounted(() => {
      density.value = resolveDensity(cookie.value)
      applyDomDensity(density.value)
    })
  }

  function setDensity(next: DensityMode) {
    cookie.value = next
    density.value = next
    applyDomDensity(next)
  }

  function toggleDensity() {
    setDensity(density.value === 'comfortable' ? 'compact' : 'comfortable')
  }

  return {
    density: readonly(density),
    setDensity,
    toggleDensity,
  }
}
