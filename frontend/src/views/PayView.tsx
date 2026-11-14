import { useEffect, useState } from 'react';

function requestIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const pay = parts.indexOf('pay');
  if (pay >= 0 && parts[pay + 1]) return parts[pay + 1];
  return '';
}

export function PayView() {
  const id = requestIdFromPath();
  const [request, setRequest] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/payment-requests/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(setRequest)
      .catch(e => setError(e.message));
  }, [id]);

  if (error) return <div>Error: {error}</div>;
  if (!request) return <div>Loading...</div>;

  return (
    <div>
      <h2>Pay Request</h2>
      <p>Amount: {request.amount} {request.asset}</p>
      <p>To: {request.to}</p>
      <p>Description: {request.description}</p>
      <p>State: {request.state}</p>
      <p>This page does not move funds. To settle, the payer must authorize via AgentVault (execute or executeWithSig). After verification, call the settle endpoint with the txHash.</p>
      {request.txHash && <p>Receipt: {request.txHash}</p>}
    </div>
  );
}
