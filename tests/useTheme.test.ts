import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { resolveTheme, NO_FLASH_SCRIPT } from '../app/composables/useTheme.ts'

function runBootScript({ cookie = '', prefersLight = false }: { cookie?: string; prefersLight?: boolean }) {
  const classes = new Set<string>()
  const attrs = new Map<string, string>()

  const documentElement = {
    classList: {
      add: (...tokens: string[]) => tokens.forEach((t) => classes.add(t)),
      remove: (...tokens: string[]) => tokens.forEach((t) => classes.delete(t)),
      contains: (token: string) => classes.has(token),
    },
    setAttribute: (name: string, val: string) => attrs.set(name, val),
    getAttribute: (name: string) => attrs.get(name) ?? null,
  }

  const sandbox = {
    document: {
      cookie,
      documentElement,
    },
    window: {
      matchMedia: (query: string) => ({
        matches: query.includes('light') ? prefersLight : !prefersLight,
      }),
    },
  }

  vm.runInNewContext(NO_FLASH_SCRIPT, sandbox)
  return { classes, attrs }
}

test('fresh visitor with a light OS gets dark theme', () => {
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(undefined, true), 'dark')

  const { classes, attrs } = runBootScript({ cookie: '', prefersLight: true })
  assert.equal(classes.has('dark'), true)
  assert.equal(classes.has('light'), false)
  assert.equal(attrs.get('data-theme'), 'dark')
})

test('explicit light cookie resolves to light theme', () => {
  assert.equal(resolveTheme('light', false), 'light')

  const { classes, attrs } = runBootScript({ cookie: 'theme=light', prefersLight: false })
  assert.equal(classes.has('light'), true)
  assert.equal(classes.has('dark'), false)
  assert.equal(attrs.get('data-theme'), 'light')
})

test('explicit dark cookie resolves to dark theme on a light OS', () => {
  assert.equal(resolveTheme('dark', true), 'dark')

  const { classes, attrs } = runBootScript({ cookie: 'theme=dark', prefersLight: true })
  assert.equal(classes.has('dark'), true)
  assert.equal(classes.has('light'), false)
  assert.equal(attrs.get('data-theme'), 'dark')
})
