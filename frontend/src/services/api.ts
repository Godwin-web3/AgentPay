const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
  requestId: string;
  to:        string;
  amount:    number;
  reason:    string;
  status:    string;
  txHash?:   string;
  error?:    string;
  timestamp: string;
}

export interface ChatResponse {
  message: string;
  action:  string;
  intent:  object;
}

export interface PayResponse {
  requestId: string;
  status:    string;
  txHash?:   string;
  explorer?: string;
  reason?:   string;
  timestamp: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {

  health: () => req('/health'),

  policy: (): Promise<Policy> => req('/policy'),

  updatePolicy: (data: object) => req('/policy', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  }),

  agents: (): Promise<{ agents: Agent[]; total: number }> => req('/agents'),

  history: (): Promise<{ logs: HistoryLog[]; total: number }> => req('/history'),

  chat: (message: string, conversationHistory: object[] = []): Promise<ChatResponse> => req('/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, conversationHistory }),
  }),

  pay: (to: string, amount: number, reason: string, requestId: string): Promise<PayResponse> => req('/pay', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ to, amount, reason, requestId }),
  }),

  status: (requestId: string) => req(`/status/${requestId}`),

};
