export type ThemeMode = 'dark' | 'light'

const THEME_COOKIE_KEY = 'theme'

/**
 * Rule 12: dark is always the default, including on a light OS.
 * Only an explicit `light` cookie switches to light; when no cookie exists,
 * `prefers-color-scheme` is consulted only to confirm dark unless explicitly set to light.
 */
export function resolveTheme(cookieValue: string | null | undefined, _prefersLight = false): ThemeMode {
  if (cookieValue === 'light') return 'light'
  if (cookieValue === 'dark') return 'dark'
  // Fresh visitor (no cookie): dark default regardless of light OS preference.
  return 'dark'
}

export const NO_FLASH_SCRIPT = `(function(){
  try {
    var root = document.documentElement;
    var cookie = document.cookie;
    var theme = cookie.match(/(?:^|;\\s*)theme=(dark|light)(?:;|$)/);
    var mode = theme ? theme[1] : 'dark';
    root.classList.remove('dark', 'light');
    root.classList.add(mode);
    root.setAttribute('data-theme', mode);
    var compact = /(?:^|;\\s*)density=compact(?:;|$)/.test(cookie);
    root.setAttribute('data-density', compact ? 'compact' : 'comfortable');
  } catch (e) {}
})();`

function applyDomTheme(mode: ThemeMode) {
  if (!import.meta.client) return
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(mode)
  root.setAttribute('data-theme', mode)
}

export function useTheme() {
  const cookie = useCookie<ThemeMode | null>(THEME_COOKIE_KEY, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    default: () => null,
  })

  const initial: ThemeMode = resolveTheme(cookie.value)
  const theme = useState<ThemeMode>('ui:theme', () => initial)

  useHead({
    htmlAttrs: {
      class: () => theme.value,
      'data-theme': () => theme.value,
    },
    script: [
      {
        key: 'theme-no-flash',
        innerHTML: NO_FLASH_SCRIPT,
        tagPosition: 'head',
      },
    ],
  })

  if (import.meta.client) {
    onMounted(() => {
      const prefersLight = Boolean(window.matchMedia?.('(prefers-color-scheme: light)').matches)
      theme.value = resolveTheme(cookie.value, prefersLight)
      applyDomTheme(theme.value)
    })
  }

  function setTheme(next: ThemeMode) {
    cookie.value = next
    theme.value = next
    applyDomTheme(next)
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    theme: readonly(theme),
    setTheme,
    toggleTheme,
  }
}
