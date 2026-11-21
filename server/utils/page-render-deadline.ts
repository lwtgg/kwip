export const PAGE_RENDER_DEADLINE_MS = 8_000

export async function withinPageRender<T>(
  startedAt: number,
  seedBudgetMs: number,
  render: () => T | Promise<T>,
  prepareSeed: () => Promise<string | undefined>,
  onTimeout: (seed: string | undefined) => T,
): Promise<T> {
  const remaining = Math.max(0, PAGE_RENDER_DEADLINE_MS - (Date.now() - startedAt))
  if (!remaining) return onTimeout(undefined)

  let seed: string | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const prepare = setTimeout(() => {
    void prepareSeed().then(body => { seed = body }).catch(() => {})
  }, Math.max(0, remaining - seedBudgetMs))
  const expired = Symbol('render timeout')
  const timeout = new Promise<typeof expired>(resolve => {
    deadline = setTimeout(() => resolve(expired), remaining)
  })
  try {
    let result: T | typeof expired
    try {
      result = await Promise.race([timeout, render()])
    } catch (error) {
      if (Date.now() - startedAt < PAGE_RENDER_DEADLINE_MS) throw error
      result = expired
    }
    if (result === expired || Date.now() - startedAt >= PAGE_RENDER_DEADLINE_MS) return onTimeout(seed)
    return result
  } finally {
    clearTimeout(prepare)
    clearTimeout(deadline)
  }
}
