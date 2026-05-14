import type { ChatResponse, PolicyData, HealthData, PayResponse } from './types'

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

export async function getHistory(userAddress: string): Promise<{ items: any[]; next_page_params: any }> {
  const CONTRACT = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'
  const url = `https://shannon-explorer.somnia.network/api/v2/addresses/${userAddress}/transactions`
  const res = await fetch(url)
  const data = await res.json()
  const items = (data.items || []).filter((tx: any) => {
    const to = tx.to?.hash?.toLowerCase() ?? ''
    return to === CONTRACT.toLowerCase()
  })
  return { items, next_page_params: data.next_page_params }
}

export async function getStatus(requestId: string, userAddress: string): Promise<PayResponse> {
  return request<PayResponse>('/status/' + requestId, {}, userAddress)
}

export function generateRequestId(): string {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

const ERC20_BALANCEOF = '0x70a08231';
const TOKENS = {
  WSTT:  '0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7',
  PING:  '0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493',
  PONG:  '0x9beaA0016c22B646Ac311Ab171270B0ECf23098F',
  SUSD:  '0x65296738D4E5edB1515e40287B6FDf8320E6eE04',
};
const RPC = 'https://dream-rpc.somnia.network';

export async function getTokenBalances(userAddress: string): Promise<Record<string, string>> {
  const padded = userAddress.replace('0x','').toLowerCase().padStart(64, '0');
  const calls = Object.entries(TOKENS).map(([symbol, addr]) =>
    fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: addr, data: ERC20_BALANCEOF + padded }, 'latest'] })
    }).then(r => r.json()).then(d => ({ symbol, raw: d.result }))
  );
  const results = await Promise.all(calls);
  const balances: Record<string, string> = {};
  for (const { symbol, raw } of results) {
    balances[symbol] = (Number(BigInt((!raw || raw === "0x") ? "0x0" : raw)) / 1e18).toFixed(4);
  }
  return balances;
}
