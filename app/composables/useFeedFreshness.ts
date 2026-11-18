import type { MaybeRefOrGetter, Ref } from 'vue'

const staleAfterSeconds = 20 * 60
const currentSeconds = () => Math.floor(Date.now() / 1000)

type RefreshPayload = { fromCache?: boolean } | null | undefined

export function useFeedFreshness(
  origin: MaybeRefOrGetter<number | null | undefined>,
  freshAt: Ref<number | null>,
  receivedAt: Ref<number | null>,
) {
  const initialNow = useState('feed-initial-now', currentSeconds)
  const clientNow = ref<number | null>(null)
  const acknowledgedAt = ref<number | null>(null)
  const nowSeconds = computed(() => clientNow.value ?? initialNow.value)
  let clockTimer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    clientNow.value = currentSeconds()
    clockTimer = setInterval(() => {
      clientNow.value = currentSeconds()
    }, 1_000)
  })

  onBeforeUnmount(() => clearInterval(clockTimer))

  const isStale = computed(() => {
    const now = clientNow.value
    if (now === null) return false
    if (acknowledgedAt.value !== null && now - acknowledgedAt.value < staleAfterSeconds) {
      return false
    }

    const anchor = toValue(origin) ?? freshAt.value ?? receivedAt.value
    return anchor !== null && now - anchor > staleAfterSeconds
  })

  async function retry(
    refresh: () => Promise<unknown>,
    getPayloads: () => RefreshPayload[],
  ) {
    await refresh()
    if (getPayloads().some(payload => !payload || payload.fromCache)) return

    const completedAt = currentSeconds()
    clientNow.value = completedAt
    if (isStale.value) acknowledgedAt.value = completedAt
    freshAt.value = completedAt
  }

  return { isStale, nowSeconds, retry }
}
