import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom'; // assume react-router is available; adjust if not

export function PayView() {
  const { id } = useParams<{ id: string }>();
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
