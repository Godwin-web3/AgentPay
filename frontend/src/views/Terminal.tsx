import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage, Intent } from '../types';

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
  if (result.status === 'rejected') {
    return <div className="tx-badge rejected">[BLOCKED] {result.reason}</div>;
  }
  if (result.status === 'failed') {
    return <div className="tx-badge failed">[ERROR] {result.reason}</div>;
  }
  return null;
}

// Rich Data Renderers
function BalanceCard({ data }: { data: any }) {
  if (!data?.balances) return null;
  return (
    <div className="rich-card balance-card">
      <h4>💰 Your Balances</h4>
      <div className="balance-grid">
        {Object.entries(data.balances).map(([token, amount]) => (
          <div key={token} className="balance-item">
            <span className="token">{token}</span>
            <span className="amount">{amount}</span>
          </div>
        ))}
        {data.vault && (
          <div className="balance-item vault">
            <span className="token">Vault</span>
            <span className="amount">{data.vault} STT</span>
          </div>
        )}
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
        <div><strong>Spent Today:</strong> {data.dailySpendSoFar} STT</div>
        <div><strong>Remaining:</strong> <span className="highlight">{data.dailyRemaining} STT</span></div>
        <div><strong>Status:</strong> <span className={data.active ? 'active' : 'inactive'}>{data.active ? 'ACTIVE' : 'PAUSED'}</span></div>
      </div>
      {data.whitelist?.length > 0 && (
        <div className="whitelist">
          <strong>Whitelist:</strong>
          <div className="chips">
            {data.whitelist.map((addr: string, i: number) => (
              <span key={i} className="chip">{addr.slice(0,6)}...{addr.slice(-4)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Terminal({ messages, setMessages, userAddress }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [txResults, setTxResults] = useState<Record<number, any>>({});
  const [pendingSwap, setPendingSwap] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (userAddress) {
      setLoading(true);
      getChatHistory(userAddress)
        .then(res => {
          if (res.history && res.history.length > 0) {
            setMessages(res.history);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [userAddress]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages, loading]);

  async function handleSend(overrideText?: string) {
    const text = overrideText || input.trim();
    if (!text || loading) return;

    if (text.toLowerCase() === "clear") {
      setLoading(true);
      await clearChatHistory(userAddress);
      setMessages([{ role: 'assistant', content: 'Memory cleared. How can I help you today?', timestamp: Date.now() }]);
      setLoading(false);
      setInput('');
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await sendChat(text, userAddress, /* vaultBalance if needed */);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.message || 'Understood!',
        timestamp: Date.now(),
        intent: res.intent,
        // Store data for rich rendering
        data: res.data
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Handle special actions (keep your existing logic)
      const intent = res.intent;
      const msgIndex = messages.length + 1;

      if (intent.action === 'propose_swap') {
        // ... your existing swap logic
      }
      if (intent.action === 'pay') {
        // ... your existing pay logic
      }

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: Date.now()
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="terminal-view">
      <div className="chat-container" ref={scrollRef}>
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-bubble">
              <div className="message-content">{msg.content}</div>
              
              {/* Rich Data Cards */}
              {msg.data && msg.intent?.action === 'balance' && (
                <BalanceCard data={msg.data} />
              )}
              {msg.data && msg.intent?.action === 'policy' && (
                <PolicyCard data={msg.data} />
              )}

              <TxBadge result={txResults[index]} />
            </div>
            <div className="timestamp">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-bubble typing">
              AgentPay is thinking<span className="dots">...</span>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask AgentPay anything... (e.g. What's my balance?)"
          rows={1}
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

// You need to import these helpers if not already (add at top if missing)
async function getChatHistory(address: string) {
  const res = await fetch(`https://agentpay-worker.mbagodwin419.workers.dev/chat?address=${address}`, {
    headers: { 'x-user-address': address }
  });
  return res.json();
}

async function clearChatHistory(address: string) {
  await fetch(`https://agentpay-worker.mbagodwin419.workers.dev/chat`, {
    method: 'DELETE',
    headers: { 'x-user-address': address }
  });
}

async function sendChat(message: string, address: string, vaultBalance?: string) {
  const res = await fetch('https://agentpay-worker.mbagodwin419.workers.dev/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': address
    },
    body: JSON.stringify({ message, vaultBalance })
  });
  return res.json();
}
