export type ThemeMode = 'dark' | 'light'

const THEME_COOKIE_KEY = 'theme'

const NO_FLASH_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=(dark|light)(?:;|$)/);var t=m?m[1]:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var d=document.documentElement;d.classList.remove('dark','light');d.classList.add(t);d.setAttribute('data-theme',t);}catch(e){}})();`

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

  const initial: ThemeMode = cookie.value === 'light' ? 'light' : 'dark'
  const theme = useState<ThemeMode>('ui:theme', () => initial)

  if (cookie.value === 'dark' || cookie.value === 'light') {
    theme.value = cookie.value
  }

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
      if (cookie.value === 'dark' || cookie.value === 'light') {
        theme.value = cookie.value
      } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
        theme.value = 'light'
      } else {
        theme.value = 'dark'
      }
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
