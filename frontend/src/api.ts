import { ethers } from 'ethers'
import type { ChatResponse, PolicyData, HealthData, PayResponse } from './types'

export const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://agentpay-worker.mbagodwin419.workers.dev'
export const RPC = import.meta.env.VITE_RPC_URL || 'https://dream-rpc.somnia.network'

export const TOKENS = {
  STT:   '0x0000000000000000000000000000000000000000',
  WSTT:  '0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7',
  PING:  '0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493',
  PONG:  '0x9beaA0016c22B646Ac311Ab171270B0ECf23098F',
  SUSD:  '0x65296738D4E5edB1515e40287B6FDf8320E6eE04',
}

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
  userAddress: string,
  verifiable: boolean = false
): Promise<ChatResponse> {
  let vaultBalance: string | undefined
  try {
    const { address: userVaultAddr } = await getVaultAddress(userAddress)
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        jsonrpc: '2.0', 
        id: 1, 
        method: 'eth_call', 
        params: [{ 
          to: userVaultAddr, 
          data: '0xf8b2cb4f' + userAddress.replace('0x','').toLowerCase().padStart(64, '0') + '0000000000000000000000000000000000000000000000000000000000000000' 
        }, 'latest'] 
      })
    })
    const data = await res.json()
    vaultBalance = (Number(BigInt(data.result === '0x' || !data.result ? '0x0' : data.result)) / 1e18).toFixed(4)
  } catch {}
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, vaultBalance, verifiable })
  }, userAddress)
}

export async function getChatHistory(userAddress: string): Promise<{ history: any[] }> {
  return request<{ history: any[] }>('/chat', {}, userAddress)
}

export async function clearChatHistory(userAddress: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/chat', { method: 'DELETE' }, userAddress)
}

export async function executePay(
  to: string,
  amount: number,
  reason: string,
  requestId: string,
  userAddress: string,
  fromToken: string = 'STT'
): Promise<PayResponse> {
  return request<PayResponse>('/pay', {
    method: 'POST',
    body: JSON.stringify({ to, amount, reason, requestId, fromToken })
  }, userAddress)
}

export async function executeSwap(
  fromToken: string,
  toToken: string,
  amount: number,
  execute: boolean,
  userAddress: string
): Promise<any> {
  return request<any>('/swap', {
    method: 'POST',
    body: JSON.stringify({ fromToken, toToken, amount, execute })
  }, userAddress)
}

export async function executeIntent(
  intentName: string,
  amount: number,
  to: string,
  reason: string,
  userAddress: string
): Promise<any> {
  return request<any>('/intent', {
    method: 'POST',
    body: JSON.stringify({ intentName, amount, to, reason })
  }, userAddress)
}

export async function getPolicy(userAddress: string): Promise<PolicyData> {
  return request<PolicyData>('/policy', {}, userAddress)
}


export async function updatePolicy(update: Partial<PolicyData>, userAddress: string): Promise<PolicyData> {
  return request<PolicyData>('/policy', {
    method: 'POST',
    body: JSON.stringify(update)
  }, userAddress)
}

export async function getSchedules(userAddress: string): Promise<{ schedules: any[] }> {
  return request<{ schedules: any[] }>('/schedules', {}, userAddress)
}

export async function createSchedule(
  to: string,
  amount: number,
  interval: string,
  reason: string,
  userAddress: string,
  conditions?: any
): Promise<{ success: boolean; schedule: any }> {
  return request<{ success: boolean; schedule: any }>('/schedules', {
    method: 'POST',
    body: JSON.stringify({ to, amount, interval, reason, conditions })
  }, userAddress)
}

export async function cancelSchedule(jobId: string, userAddress: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/schedules/' + jobId, { method: 'DELETE' }, userAddress)
}

export async function checkVault(userAddress: string): Promise<{ exists: boolean; address: string | null }> {
  return request<{ exists: boolean; address: string | null }>('/vault-check', {}, userAddress)
}

export async function getVaultAddress(userAddress: string): Promise<{ address: string }> {
  return request<{ address: string }>('/vault-address', {}, userAddress)
}

export async function getHealth(): Promise<HealthData> {
  return request<HealthData>('/health')
}

export async function getHistory(userAddress: string): Promise<{ items: any[] }> {
  return request<{ items: any[] }>('/history', {}, userAddress)
}

export async function getOnChainSchedules(userAddress: string): Promise<any[]> {
  const { address: userVaultAddr } = await getVaultAddress(userAddress)
  const VAULT_ABI = [
    "function getSchedules(address user) external view returns (tuple(address token, address to, uint256 amount, uint256 interval, uint256 nextRun, bool active, string reason, uint256 minBalance)[])"
  ]
  const provider = new ethers.JsonRpcProvider(RPC)
  const vault = new ethers.Contract(userVaultAddr, VAULT_ABI, provider)
  const raw = await vault.getSchedules(userAddress)
  return raw.map((s: any, i: number) => ({
    id: i,
    token: s.token,
    to: s.to,
    amount: (Number(s.amount) / 1e18).toFixed(4),
    interval: Number(s.interval),
    nextRun: Number(s.nextRun) * 1000,
    active: s.active,
    reason: s.reason,
    minBalance: (Number(s.minBalance) / 1e18).toFixed(4)
  }))
}

export function generateRequestId(): string {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

const ERC20_BALANCEOF = '0x70a08231'

export async function getTokenBalances(userAddress: string): Promise<Record<string, string>> {
  const padded = userAddress.replace('0x','').toLowerCase().padStart(64, '0')
  const calls = Object.entries(TOKENS).map(([symbol, addr]) => {
    if (addr === TOKENS.STT) {
      return fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [userAddress, 'latest'] })
      }).then(r => r.json()).then(d => ({ symbol, raw: d.result }))
    }
    return fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: addr, data: ERC20_BALANCEOF + padded }, 'latest'] })
    }).then(r => r.json()).then(d => ({ symbol, raw: d.result }))
  })
  const results = await Promise.all(calls)
  const balances: Record<string, string> = {}
  for (const { symbol, raw } of results) {
    balances[symbol] = (Number(BigInt((!raw || raw === "0x") ? "0x0" : raw)) / 1e18).toFixed(4)
  }
  return balances
}
