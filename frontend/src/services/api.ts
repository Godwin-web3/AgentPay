const BASE = import.meta.env.VITE_API_URL || 'https://agentpay-worker.mbagodwin419.workers.dev'

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    console.error(`API error ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

export const api = {

  health: () => req('/health'),

  policy: () => req('/policy'),

  updatePolicy: (data: object) => req('/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  agents: () => req('/agents'),

  history: () => req('/history'),

  chat: (message: string, conversationHistory: object[] = []) => req('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationHistory }),
  }),

  pay: (to: string, amount: number, reason: string, requestId: string) => req('/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, amount, reason, requestId }),
  }),

  status: (requestId: string) => req(`/status/${requestId}`),

}
