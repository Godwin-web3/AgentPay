const API_URL = import.meta.env.VITE_API_URL;

export interface Policy {
  perTxCap: number;
  dailyCap: number;
  dailySpendSoFar: number;
  dailyRemaining: number;
  whitelist: string[];
  activeHours: { start: number; end: number };
  circuitBreaker: { active: boolean };
}

export interface Agent {
  agentId: string;
  name: string;
  description: string;
  reputation: {
    total: number;
    approved: number;
    rejected: number;
    score: number;
  };
}

export interface HistoryLog {
  id: number;
  requestId: string;
  agentId: string;
  to: string;
  amount: number;
  reason: string;
  status: string;
  txHash?: string;
  error?: string;
  timestamp: string;
}

export const api = {
  fetchPolicy: async (): Promise<Policy> => {
    const res = await fetch(`${API_URL}/policy`);
    return res.json();
  },

  fetchAgents: async (): Promise<Agent[]> => {
    const res = await fetch(`${API_URL}/agents`);
    const data = await res.json();
    return data.agents;
  },

  fetchHistory: async (): Promise<HistoryLog[]> => {
    // Note: History requires auth (x-api-key)
    // For this dashboard, we might want to expose a public history or handle keys
    const res = await fetch(`${API_URL}/history`, {
        headers: { 'x-api-key': 'ak_test_agentpay_2024' } // Default test key
    });
    const data = await res.json();
    return data.logs;
  },

  submitPayment: async (payment: { to: string; amount: number; reason: string; requestId: string; apiKey: string }) => {
    const res = await fetch(`${API_URL}/pay`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': payment.apiKey
      },
      body: JSON.stringify({
        to: payment.to,
        amount: payment.amount,
        reason: payment.reason,
        requestId: payment.requestId
      })
    });
    return res.json();
  },

  registerAgent: async (name: string, description: string) => {
    const res = await fetch(`${API_URL}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    return res.json();
  }
};
