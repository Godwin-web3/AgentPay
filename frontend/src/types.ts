declare global {
  interface Window {
    ethereum?: any
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  txHash?: string
  status?: 'executed' | 'rejected' | 'failed'
  explorer?: string
  intent?: Intent
  data?: any  // Rich data from brain (balance, policy, etc.)
}

export interface Intent {
  action: 'pay' | 'schedule' | 'cancel_schedule' | 'list_schedules' | 'status' | 'history' | 'policy' | 'update_policy' | 'balance' | 'help' | 'unknown' | 'fetch_and_pay' | 'hire_agent'
  requestId?: string
  to?: string
  amount?: number
  reason?: string
  message: string
  interval?: string
  jobId?: number
  url?: string
  maxAmount?: number
  description?: string
  budget?: number
  conditions?: {
    minBalance?: number
    executeAt?: string
    executeOnDay?: string
    executeOnDate?: string
    maxDailySpend?: number
    executeOnce?: boolean
  }
  policyUpdate?: {
    field?: string
    value?: number
    address?: string
    start?: number
    end?: number
  }
}

export interface ChatResponse {
  intent: Intent
  message: string
  data?: any
  verifiable?: boolean
}

export interface PolicyData {
  perTxCap: number
  dailyCap: number
  dailySpendSoFar: number
  dailyRemaining: number
  whitelist: string[]
  active: boolean
  maxTxPerHour?: number
  activeHours: { start: number; end: number }
  circuitBreaker: {
    maxTxPerHour: number
    maxConsecutiveFailures: number
    pauseDurationMinutes: number
    paused?: boolean
  }
}

export interface HealthData {
  status: string
  agent: string
  version: string
  network?: string
  chainId?: number
  time: string
}

export interface HistoryLog {
  requestId: string
  to: string
  amount: number
  reason?: string
  failed: boolean
  txHash?: string
  blockedReason?: string
  timestamp: number
  date: string
}

export interface PayResponse {
  requestId: string
  status: 'executed' | 'rejected' | 'failed'
  txHash?: string
  to?: string
  amount?: number
  explorer?: string
  timestamp?: string
  reason?: string
  code?: string
}
