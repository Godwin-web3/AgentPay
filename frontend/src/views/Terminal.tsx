import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  userAddress: string;
}

function TxBadge({ result }: { result?: any }) {
  if (!result) return null;
  if (result.status === 'executed' || result.status === 'success') {
    return (
      <a className="tx-badge success" href={result.explorer} target="_blank" rel="noreferrer">
        [OK] View Transaction ↗
      </a>
    );
  }
  if (result.status === 'rejected') return <div className="tx-badge rejected">[BLOCKED] {result.reason}</div>;
  if (result.status === 'failed') return <div className="tx-badge failed">[ERROR] {result.reason}</div>;
  return null;
}

function BalanceCard({ data }: { data: any }) {
  if (!data?.balances) return null;
  return (
    <div className="rich-card balance-card">
      <h4>💰 Your Balances</h4>
      <div className="balance-grid">
        {Object.entries(data.balances).map(([token, amt]) => (
          <div key={token} className="balance-item">
            <span className="token">{token}</span>
            <span className="amount">{String(amt)}</span>
          </div>
        ))}
        {data.vault && <div className="balance-item vault">Vault: {data.vault} STT</div>}
      </div>
    </div>
  );
}

function PolicyCard({ data }: { data: any }) {
  if (!data?.perTxCap) return null;
  return (
    <div className="rich-card policy-card">
      <h4>🛡️ Spending Policy</h4>
      <div className="policy-grid">
        <div><strong>Per Tx:</strong> {data.perTxCap} STT</div>
        <div><strong>Daily Cap:</strong> {data.dailyCap} STT</div>
        <div><strong>Spent:</strong> {data.dailySpendSoFar} STT</div>
        <div><strong>Remaining:</strong> <span className="highlight">{data.dailyRemaining} STT</span></div>
        <div><strong>Status:</strong> <span className={data.active ? 'active' : 'inactive'}>{data.active ? 'ACTIVE' : 'PAUSED'}</span></div>
      </div>
    </div>
  );
}

export default function Terminal({ messages, setMessages, userAddress }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [txResults, setTxResults] = useState<Record<number, any>>({});
  const [pendingSwap, setPendingSwap] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (userAddress) {
      setLoading(true);
      getChatHistory(userAddress)
        .then(res => {
          if (res.history?.length > 0) setMessages(res.history);
        })
        .finally(() => setLoading(false));
    }
  }, [userAddress]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }
  }, [input]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    if (text.toLowerCase() === "clear") {
      await clearChatHistory(userAddress);
      setMessages([{ role: 'assistant', content: 'Memory cleared.', timestamp: Date.now() }]);
      setInput('');
      return;
    }

    const userMsg = { role: 'user' as const, content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await sendChat(text, userAddress);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.message || 'Got it!',
        timestamp: Date.now(),
        intent: res.intent,
        data: res.data
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Keep your original action handlers
      const msgIndex = messages.length;
      const intent = res.intent;

      if (intent.action === 'propose_swap' && intent.fromToken && intent.toToken && intent.amount) {
        // TODO: call your swap logic
      }
      if (intent.action === 'pay') {
        // TODO: call your pay logic
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="terminal-view">
      <div className="chat-container" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              <div className="message-content">{msg.content}</div>

              {msg.data && msg.intent?.action === 'balance' && <BalanceCard data={msg.data} />}
              {msg.data && msg.intent?.action === 'policy' && <PolicyCard data={msg.data} />}

              <TxBadge result={txResults[i]} />
            </div>
            <small className="timestamp">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
          </div>
        ))}

        {loading && <div className="message assistant"><div className="message-bubble typing">thinking...</div></div>}
      </div>

      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="Ask AgentPay... (balance, policy, send, swap...)"
          rows={1}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>Send</button>
      </div>
    </div>
  );
}

// Helper functions (adjust URL if needed)
async function getChatHistory(address: string) {
  const r = await fetch('https://agentpay-worker.mbagodwin419.workers.dev/chat', { headers: {'x-user-address': address} });
  return r.json();
}

async function clearChatHistory(address: string) {
  await fetch('https://agentpay-worker.mbagodwin419.workers.dev/chat', { method: 'DELETE', headers: {'x-user-address': address} });
}

async function sendChat(message: string, address: string) {
  const r = await fetch('https://agentpay-worker.mbagodwin419.workers.dev/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-address': address },
    body: JSON.stringify({ message })
  });
  return r.json();
}
