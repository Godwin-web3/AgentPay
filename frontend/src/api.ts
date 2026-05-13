import type { ChatResponse, PolicyData, HealthData, HistoryLog, PayResponse } from './types'

const WORKER_URL = 'https://agentpay-worker.mbagodwin419.workers.dev'

async function request<T>(path: string, options?: RequestInit, userAddress?: string): Promise<T> {
  const headers: any = {
    'Content-Type': 'application/json',
    ...options?.headers
  }
  
  if (userAddress) {
    headers['x-user-address'] = userAddress
  }

  const res = await fetch(WORKER_URL + path, {
    ...options,
    headers
  })
  const data = await res.json()
  if (!res.ok && res.status !== 200) throw new Error(data.error || 'Request failed')
  return data as T
}

export async function sendChat(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  userAddress: string
): Promise<ChatResponse> {
  let vaultBalance: string | undefined
  try {
    const RPC = 'https://dream-rpc.somnia.network'
    const VAULT = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: VAULT, data: '0xf8b2cb4f000000000000000000000000' + userAddress.replace('0x','').toLowerCase() }, 'latest'] })
    })
    const data = await res.json()
    vaultBalance = (Number(BigInt(data.result === '0x' ? '0x0' : data.result)) / 1e18).toFixed(4)
  } catch {}
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversationHistory, vaultBalance })
  }, userAddress)
}

export async function executePay(
  to: string,
  amount: number,
  reason: string,
  requestId: string,
  userAddress: string
): Promise<PayResponse> {
  return request<PayResponse>('/pay', {
    method: 'POST',
    body: JSON.stringify({ to, amount, reason, requestId })
  }, userAddress)
}

export async function getPolicy(userAddress: string): Promise<PolicyData> {
  return request<PolicyData>('/policy', {}, userAddress)
}

export async function updatePolicy(data: Partial<PolicyData>, userAddress: string): Promise<{ message: string; policy: PolicyData }> {
  // Map frontend fields to what the worker expects if necessary
  const payload: any = { ...data }
  if (data.dailyCap !== undefined) payload.dailyCapSTT = data.dailyCap
  if (data.perTxCap !== undefined) payload.perTxCapSTT = data.perTxCap
  if (data.whitelist !== undefined) payload.allowedRecipients = data.whitelist

  return request<{ message: string; policy: PolicyData }>('/policy', {
    method: 'POST',
    body: JSON.stringify(payload)
  }, userAddress)
}

export async function getHealth(): Promise<HealthData> {
  return request<HealthData>('/health')
}

export async function getHistory(userAddress: string): Promise<{ logs: HistoryLog[]; total: number }> {
  return request<{ logs: HistoryLog[]; total: number }>('/history', {}, userAddress)
}

export async function getStatus(requestId: string, userAddress: string): Promise<PayResponse> {
  return request<PayResponse>('/status/' + requestId, {}, userAddress)
}

export function generateRequestId(): string {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}
