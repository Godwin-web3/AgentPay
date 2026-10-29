import React, { useState } from 'react';

// Skeleton. Wire to a backend endpoint that calls src/settlement/verify.js
// with a real vault contract instance. This component does not authorize.

export function ReceiptView({ requestId }: { requestId: string }) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    try {
      // Replace with real call once verify is exposed on the API
      const res = await fetch(`/api/payment-requests/${requestId}`);
      const data = await res.json();
      setResult({ verified: !!data.txHash, txHash: data.txHash, state: data.state });
    } catch (e) {
      setResult({ verified: false, error: String(e) });
    }
    setLoading(false);
  };

  return (
    <div>
      <h3>Receipt</h3>
      <button onClick={check} disabled={loading}>Check Settlement</button>
      {result && (
        <pre>{JSON.stringify(result, null, 2)}</pre>
      )}
      <p>Verification must match an AgentVault Executed event. This view only displays the result.</p>
    </div>
  );
}
