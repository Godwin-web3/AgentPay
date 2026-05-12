const BASE = import.meta.env.VITE_API_URL || 'https://agentpay-worker.mbagodwin419.workers.dev'

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export const api = {
  health: () => req('/health'),

  policy: (address: string) => req(`/policy?address=${address}`),

  updatePolicy: (apiKey: string, data: object) => req('/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(data),
  }),

  agents: () => req('/agents'),

  register: (name: string, description: string, address: string) => req('/agents/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, address }),
  }),

  history: (apiKey: string) => req('/history', {
    headers: { 'x-api-key': apiKey },
  }),

  chat: (apiKey: string, message: string, conversationHistory: object[]) => req('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ message, conversationHistory }),
  }),

  pay: (apiKey: string, to: string, amount: number, reason: string, requestId: string) => req('/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ to, amount, reason, requestId }),
  }),
}
