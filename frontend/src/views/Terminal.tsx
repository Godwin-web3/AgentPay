import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  userAddress: string;
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
            <span className="amount">{String(amount)}</span>
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
  if (!data?.perTxCap && !data?.dailyCap) return null;
  return (
    <div className="rich-card policy-card">
      <h4>🛡️ Spending Policy</h4>
      <div className="policy-grid">
        <div><strong>Per Tx Cap:</strong> {data.perTxCap} STT</div>
        <div><strong>Daily Cap:</strong> {data.dailyCap} STT</div>
        <div><strong>Spent Today:</strong> {data.dailySpendSoFar} STT</div>
        <div><strong>Remaining:</strong> <span className="highlight">{data.dailyRemaining} STT</span></div>
        <div><strong>Status:</strong> 
          <span className={data.active ? 'status-active' : 'status-inactive'}>
            {data.active ? 'ACTIVE' : 'PAUSED'}
          </span>
        </div>
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
  }, [userAddress, setMessages]);

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
      setMessages([{ 
        role: 'assistant', 
        content: 'Memory cleared. How can I help you today?', 
        timestamp: Date.now() 
      }]);
      setLoading(false);
      setInput('');
      return;
    }

    const userMsg: ChatMessage = { 
      role: 'user', 
      content: text, 
      timestamp: Date.now() 
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await sendChat(text, userAddress);
      
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.message || 'Understood!',
        timestamp: Date.now(),
        intent: res.intent,
        data: res.data
      };

      setMessages(prev => [...prev, assistantMsg]);

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
              
              {msg.data && msg.intent?.action === 'balance' && <BalanceCard data={msg.data} />}
              {msg.data && msg.intent?.action === 'policy' && <PolicyCard data={msg.data} />}
            </div>
            <div className="timestamp">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-bubble typing">
              AgentPay thinking<span className="dots">...</span>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask AgentPay anything... (e.g. What's my balance? Show my policy)"
          rows={1}
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()}>
          ↑
        </button>
      </div>
    </div>
  );
}

// Helper functions
async function getChatHistory(address: string) {
  const res = await fetch(`https://agentpay-worker.mbagodwin419.workers.dev/chat`, {
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

async function sendChat(message: string, address: string) {
  const res = await fetch('https://agentpay-worker.mbagodwin419.workers.dev/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': address
    },
    body: JSON.stringify({ message })
  });
  return res.json();
}
