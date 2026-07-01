import type { ChatResponse, PolicyData, HealthData, PayResponse } from './types'

export const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://agentpay-c4o7.onrender.com'
export const RPC = import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.network'

export const TOKENS = {
  USDC: '0x3600000000000000000000000000000000000000',
}

// P1-9: shared operator API key (mirrors APP_API_KEY on the backend). For the
// demo this is the operator key; per-user keys would be issued out-of-band and
// stored per-user instead.
const APP_API_KEY = (import.meta.env.VITE_APP_API_KEY as string) || ''

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  if (APP_API_KEY) {
    h['x-api-key'] = APP_API_KEY
    h['Authorization'] = 'Bearer ' + APP_API_KEY
  }
  return h
}

async function request<T>(path: string, options?: RequestInit, userId?: string): Promise<T> {
  const headers: any = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...options?.headers
  }

  if (userId) {
    headers["x-user-id"] = userId
  }

  const res = await fetch(WORKER_URL + path, {
    ...options,
    headers
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

export async function sendChat(
  message: string,
  userId: string
): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message })
  }, userId)
}

export async function getChatHistory(userId: string): Promise<{ history: any[] }> {
  return request<{ history: any[] }>('/chat', {}, userId)
}

export async function clearChatHistory(userId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/chat', { method: 'DELETE' }, userId)
}

export async function executePay(
  to: string,
  amount: number,
  reason: string,
  requestId: string,
  userId: string,
  fromToken: string = 'USDC'
): Promise<PayResponse> {
  return request<PayResponse>('/pay', {
    method: 'POST',
    body: JSON.stringify({ to, amount, reason, requestId, fromToken })
  }, userId)
}

export async function getPolicy(userId: string): Promise<PolicyData> {
  return request<PolicyData>('/policy', {}, userId)
}


export async function updatePolicy(update: Partial<PolicyData>, userId: string): Promise<PolicyData> {
  return request<PolicyData>('/policy', {
    method: 'POST',
    body: JSON.stringify(update)
  }, userId)
}

export async function getScheduleStats(userId: string): Promise<Record<string, { success: number; failed: number; lastRun: number }>> {
  return request<Record<string, { success: number; failed: number; lastRun: number }>>('/schedules/stats', {}, userId)
}

export async function getSchedules(userId: string): Promise<{ schedules: any[] }> {
  return request<{ schedules: any[] }>('/schedules', {}, userId)
}

export async function createSchedule(
  to: string,
  amount: number,
  interval: string,
  reason: string,
  userId: string,
  conditions?: any
): Promise<{ success: boolean; schedule: any }> {
  return request<{ success: boolean; schedule: any }>('/schedules', {
    method: 'POST',
    body: JSON.stringify({ to, amount, interval, reason, conditions })
  }, userId)
}

export async function cancelSchedule(jobId: string, userId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/schedules/' + jobId, { method: 'DELETE' }, userId)
}

export async function getMyJobs(userId: string): Promise<{ created: any[]; hired: any[] }> {
  return request<{ created: any[]; hired: any[] }>('/api/jobs/mine', {}, userId)
}

export async function getMarketJobs(userId: string): Promise<any> {
  return request<any>('/market-intel', {}, userId)
}

export async function checkVault(userId: string): Promise<{ exists: boolean; address: string | null }> {
  return request<{ exists: boolean; address: string | null }>('/vault-check', {}, userId)
}

export async function getVaultAddress(userId: string): Promise<{ address: string }> {
  return request<{ address: string }>('/vault-address', {}, userId)
}

export async function getWallet(userId: string): Promise<{ walletId: string; address: string; balance: string; faucet: string }> {
  return request<{ walletId: string; address: string; balance: string; faucet: string }>('/wallet', { method: 'POST' }, userId)
}

export async function getCircleBalance(userId: string): Promise<{ address: string; balance: string; token: string }> {
  return request<{ address: string; balance: string; token: string }>('/balance', {}, userId)
}

export async function depositToVault(amount: string, userId: string): Promise<{ success: boolean; txHash: string; explorer: string }> {
  return request<{ success: boolean; txHash: string; explorer: string }>('/vault/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount })
  }, userId)
}

export async function withdrawFromVault(amount: string, userId: string): Promise<{ success: boolean; txHash: string; explorer: string }> {
  return request<{ success: boolean; txHash: string; explorer: string }>('/vault/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amount })
  }, userId)
}

// Vault balances are recorded under the Agent Wallet's address (the Circle
// wallet that actually signs deposit/withdraw on-chain), not the user's
// real connected wallet. Always pass the Agent Wallet address here.
export async function getVaultBalance(vaultAddress: string, agentWalletAddress: string): Promise<string> {
  const { ethers } = await import('ethers')
  const iface = new ethers.Interface([
    "function balances(address user) external view returns (uint256)"
  ])
  const data = iface.encodeFunctionData("balances", [agentWalletAddress])
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: vaultAddress, data }, 'latest'] })
  })
  const json = await res.json()
  const raw = json.result
  const wei = BigInt((!raw || raw === "0x") ? "0x0" : raw)
  return (Number(wei) / 1e6).toFixed(4)
}

export async function getHealth(): Promise<HealthData> {
  return request<HealthData>('/health')
}

export async function getHistory(userId: string): Promise<{ items: any[] }> {
  return request<{ items: any[] }>('/history?t=' + Date.now(), {}, userId)
}

export async function getOnChainSchedules(userId: string): Promise<any[]> {
  const res = await request<{ schedules: any[] }>('/onchain-schedules', {}, userId)
  return res.schedules || []
}

export async function createOnChainSchedule(
  to: string,
  amount: number,
  intervalSec: number,
  reason: string,
  userId: string,
  minBalance: number = 0
): Promise<{ success: boolean; txHash: string; explorer: string }> {
  return request<{ success: boolean; txHash: string; explorer: string }>('/onchain-schedules', {
    method: 'POST',
    body: JSON.stringify({ to, amount, interval: intervalSec, reason, minBalance })
  }, userId)
}

export async function cancelOnChainSchedule(index: number, userId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/onchain-schedules/' + index, { method: 'DELETE' }, userId)
}

export async function getVaultBalanceApi(userId: string): Promise<{ balance: string; address: string | null; agentAddress: string }> {
  return request<{ balance: string; address: string | null; agentAddress: string }>('/vault/balance', {}, userId)
}

export async function getPausedState(userId: string): Promise<{ paused: boolean }> {
  return request<{ paused: boolean }>('/vault/paused', {}, userId)
}

export async function pauseAgent(userId: string): Promise<{ success: boolean; txHash?: string }> {
  return request<{ success: boolean; txHash: string }>('/vault/pause', { method: 'POST' }, userId)
}

export async function resumeAgent(userId: string): Promise<{ success: boolean; txHash?: string }> {
  return request<{ success: boolean; txHash: string }>('/vault/resume', { method: 'POST' }, userId)
}

export async function hireAgent(
  description: string,
  budget: number,
  userId: string,
  providerAddress?: string
): Promise<any> {
  return request<any>('/jobs', {
    method: 'POST',
    body: JSON.stringify({ description, budget, providerAddress })
  }, userId)
}

export async function getJob(jobId: string, userId: string): Promise<any> {
  return request<any>('/jobs/' + jobId, {}, userId)
}

export async function completeJob(jobId: string, deliverableText: string, userId: string): Promise<any> {
  return request<any>('/jobs/' + jobId + '/complete', {
    method: 'POST',
    body: JSON.stringify({ deliverableText })
  }, userId)
}

export function generateRequestId(): string {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

const ERC20_BALANCEOF = '0x70a08231'

export async function getTokenBalances(userId: string): Promise<Record<string, string>> {
  const padded = userId.replace('0x','').toLowerCase().padStart(64, '0')
  const calls = Object.entries(TOKENS).map(([symbol, addr]) => {
    return fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: addr, data: ERC20_BALANCEOF + padded }, 'latest'] })
    }).then(r => r.json()).then(d => ({ symbol, raw: d.result }))
  })
  const results = await Promise.all(calls)
  const balances: Record<string, string> = {}
  for (const { symbol, raw } of results) {
    balances[symbol] = (Number(BigInt((!raw || raw === "0x") ? "0x0" : raw)) / 1e6).toFixed(4)
  }
  return balances
}

export async function logTransaction(data: { userId: string; type: string; amount: string; token: string; txHash: string }): Promise<void> {
  await request<{ success: boolean }>('/log-transaction', {
    method: 'POST',
    body: JSON.stringify(data)
  }, data.userId);
}

const POLICY_ERROR_MAP: Record<string, string> = {
  'ExceedsPerTxCap': 'Blocked: this exceeds your per-transaction spending cap.',
  'ExceedsDailyCap': 'Blocked: this exceeds your daily spending cap.',
  'ExceedsHourlyVelocity': 'Blocked: too many transactions in the last hour.',
  'NotWhitelisted': 'Blocked: recipient is not on your whitelist.',
  'UserPausedError': 'Blocked: your agent is currently paused.',
  'InsufficientBalance': 'Blocked: insufficient vault balance.',
  'PolicyNotSet': 'Blocked: no spending policy is set for your vault.',
}

export function decodePolicyError(err: any): string {
  const msg = typeof err === 'string' ? err : (err?.message || err?.reason || String(err))
  for (const [code, human] of Object.entries(POLICY_ERROR_MAP)) {
    if (msg.includes(code)) return human
  }
  return ''
}

export async function claimTag(tag: string, userId: string): Promise<{ tag: string; address: string }> {
  return request<{ tag: string; address: string }>('/api/tag/claim', {
    method: 'POST',
    body: JSON.stringify({ tag })
  }, userId)
}

export async function lookupTag(tag: string): Promise<{ tag: string; address: string }> {
  return request<{ tag: string; address: string }>('/api/tag/' + tag.replace('@', ''))
}

export async function getMe(userId: string): Promise<{ uid: string; tag: string | null; address: string; walletId: string }> {
  return request<any>('/api/me', {}, userId)
}
