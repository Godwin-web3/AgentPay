import React, { useState } from 'react';

// Skeleton. Wire to backend API that uses src/api/paymentRequests.js
// Creating a request does not move funds. Settlement still requires AgentVault.

export function PaymentRequestView() {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [created, setCreated] = useState<any>(null);

  const handleCreate = async () => {
    // Replace with real fetch to your backend
    const body = { to, amount, description, asset: 'USDC', network: 'arc' };
    // const res = await fetch('/api/payment-requests', { method: 'POST', body: JSON.stringify(body) });
    // const data = await res.json();
    setCreated({ ...body, id: 'demo-' + Date.now(), state: 'created' });
  };

  return (
    <div>
      <h2>Request Payment</h2>
      <input placeholder="Recipient address" value={to} onChange={e => setTo(e.target.value)} />
      <input placeholder="Amount (USDC)" value={amount} onChange={e => setAmount(e.target.value)} />
      <input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
      <button onClick={handleCreate}>Create Request</button>
      {created && (
        <div>
          <p>Request created: {created.id}</p>
          <p>State: {created.state}</p>
          <p>Share this ID. Settlement still requires the payer to authorize via AgentVault.</p>
        </div>
      )}
    </div>
  );
}
