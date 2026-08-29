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
  result?: any  // Tx proposal/outcome state (deposit, pay, schedule, etc.) — persisted so it survives remounts
}

export interface Intent {
  action: 'pay' | 'schedule' | 'cancel_schedule' | 'list_schedules' | 'status' | 'history' | 'policy' | 'update_policy' | 'balance' | 'help' | 'unknown' | 'fetch_and_pay' | 'hire_agent' | 'deposit'
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

// Intent solver (src/solver.js / src/intentEngine.js on the backend) —
// distinct from the `Intent` interface above, which is the chat brain's
// single parsed action. An IntentPlan is a multi-step goal decomposition.
export interface IntentStep {
  type: 'check_balance' | 'wait_for_condition' | 'pay' | 'hire_agent'
  to?: string
  amount?: number
  reason?: string
  minBalance?: number
  condition?: { type: string; [key: string]: any }
  description?: string
  budget?: number
  providerAddress?: string
}

export interface IntentPlanLogEntry {
  step: number
  at: string
  status: 'waiting' | 'done' | 'failed'
  reason?: string
  error?: string
  outcome?: any
}

export interface IntentPlan {
  id: string
  goal: string
  userAddress: string
  walletId?: string
  steps: IntentStep[]
  cursor: number
  status: 'active' | 'completed' | 'failed'
  log: IntentPlanLogEntry[]
  createdAt: string
  error?: string
}

// contracts/PoolVault.sol — singleton shared-money pools.
export interface PoolConstitution {
  discretionaryThreshold: number
  objectionWindow: number // seconds
  maxSingleProposal: number
}

export interface Pool {
  poolId: string
  name: string | null
  founder: string
  memberList: string[]
  constitution: PoolConstitution
  sharedBalance: number
  active: boolean
  myStatus?: 'None' | 'Invited' | 'Active'
}

export interface PoolChatMessage {
  id: string
  poolId: string
  role: 'user' | 'assistant' | 'system'
  authorAddress: string | null
  content: string
  proposalId: string | null
  messageType: 'text' | 'proposal' | 'system'
  timestamp: string
}

export interface PoolCreationDraft {
  name: string
  invites: string[]
  constitution: { discretionaryThreshold: number; objectionWindowHours: number; maxSingleProposal: number }
  message: string
}

export interface PoolProposal {
  proposalId: string
  poolId: string
  kind: 'Spend' | 'AmendConstitution' | 'RemoveMember' | 'AddMember'
  to: string
  amount: number
  reason: string
  windowEnds: number // unix seconds
  vetoed: boolean
  resolved: boolean
  executed: boolean
  objectionWindowSeconds?: number
}

// contracts/DecisionLog.sol — on-chain decision provenance record.
export interface DecisionRecord {
  decisionHash: string
  outcomeHash: string
  committedAt: number
  committedBlock: number
  finalizedAt: number
  finalized: boolean
  summary: string
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
