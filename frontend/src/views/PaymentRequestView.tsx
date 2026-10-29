import React, { useState, useEffect } from 'react';

export function PaymentRequestView() {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/payment-requests');
      if (res.ok) setRequests(await res.json());
    } catch (e) {
      setError('Failed to load requests');
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      const res = await fetch('/api/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, amount, description, asset: 'USDC', network: 'arc' }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRequests(prev => [data, ...prev]);
      setTo(''); setAmount(''); setDescription('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleShare = async (id: string) => {
    await fetch(`/api/payment-requests/${id}/share`, { method: 'POST' });
    load();
  };

  return (
    <div>
      <h2>Request Payment</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input placeholder="Recipient address" value={to} onChange={e => setTo(e.target.value)} />
      <input placeholder="Amount (USDC)" value={amount} onChange={e => setAmount(e.target.value)} />
      <input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
      <button onClick={handleCreate}>Create Request</button>
      <h3>Existing Requests</h3>
      <ul>
        {requests.map(r => (
          <li key={r.id}>
            {r.amount} {r.asset} to {r.to} — {r.state}
            {r.state === 'created' && <button onClick={() => handleShare(r.id)}>Share</button>}
            <div>ID: {r.id}</div>
            {r.shareLink && <div>Link: <a href={r.shareLink}>{r.shareLink}</a></div>}
            {r.txHash && <div>Receipt tx: {r.txHash}</div>}
          </li>
        ))}
      </ul>
      <p>Creating or sharing a request does not move funds. Settlement still requires the payer to authorize via AgentVault. The receipt appears only after a verified vault execution.</p>
    </div>
  );
}
