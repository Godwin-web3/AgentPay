const BASE = import.meta.env.VITE_API_URL || 'https://agentpay-worker.mbagodwin419.workers.dev';

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Policy {
  perTxCap:        number;
  dailyCap:        number;
  dailySpendSoFar: number;
  dailyRemaining:  number;
  whitelist:       string[];
  activeHours:     { start: number; end: number };
  circuitBreaker:  { active: boolean };
}

export interface Agent {
  agentId:     string;
  name:        string;
  description: string;
  reputation: {
    total:    number;
    approved: number;
    rejected: number;
    score:    number;
  };
}

export interface HistoryLog {
  requestId:  string;
  to:         string;
  amount:     number;
  reason:     string;
  status:     string;
  txHash?:    string;
  error?:     string;
  timestamp:  string;
}

export interface ChatResponse {
  message: string;
  action:  string;
  intent:  object;
}

export interface PayResponse {
  requestId:  string;
  status:     string;
  txHash?:    string;
  explorer?:  string;
  reason?:    string;
  timestamp:  string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {

  health: () => req('/health'),

  fetchPolicy: (): Promise<Policy> => req('/policy'),

  updatePolicy: (data: object) => req('/policy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  }),

  fetchAgents: (): Promise<Agent[]> =>
    req('/agents').then(r => r.agents),

  fetchHistory: (): Promise<HistoryLog[]> =>
    req('/history').then(r => r.logs),

  chat: (message: string, conversationHistory: object[] = []): Promise<ChatResponse> => req('/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, conversationHistory }),
  }),

  submitPayment: (payment: {
    to:        string;
    amount:    number;
    reason:    string;
    requestId: string;
  }): Promise<PayResponse> => req('/pay', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payment),
  }),

  status: (requestId: string) => req(`/status/${requestId}`),

};
