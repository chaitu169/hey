const API =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ?? ''

export function normalizeJoinCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6)
}

export function isValidJoinCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(
      typeof body.error === 'string' ? body.error : `Request failed (${res.status}).`,
    )
  }
  return body
}

export async function relayCreateRoom(offerSdp: string): Promise<string> {
  const { code } = await api<{ code: string }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ sdp: offerSdp }),
  })
  return code
}

export async function relayFetchOffer(code: string): Promise<string> {
  const { sdp } = await api<{ sdp: string }>(`/api/rooms/${code}`)
  return sdp
}

export async function relayPostAnswer(code: string, answerSdp: string): Promise<void> {
  await api(`/api/rooms/${code}/answer`, {
    method: 'POST',
    body: JSON.stringify({ sdp: answerSdp }),
  })
}

export async function relayWaitForAnswer(
  code: string,
  onTick?: () => void,
): Promise<string> {
  const deadline = Date.now() + 15 * 60 * 1000
  while (Date.now() < deadline) {
    onTick?.()
    const { answer } = await api<{ answer: string | null }>(`/api/rooms/${code}`)
    if (answer) return answer
    await new Promise((r) => window.setTimeout(r, 800))
  }
  throw new Error('Timed out waiting for your friend to join.')
}
