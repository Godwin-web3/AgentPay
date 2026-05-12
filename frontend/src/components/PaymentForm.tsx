import React, { useState } from 'react';
import { api } from '../services/api';
import { Send, Loader2, CheckCircle2, XCircle, Zap } from 'lucide-react';

const PaymentForm: React.FC = () => {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [apiKey, setApiKey] = useState('ak_test_agentpay_2024');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; txHash?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const data = await api.submitPayment({
        to,
        amount: parseFloat(amount),
        reason,
        requestId,
        apiKey
      });

      if (data.status === 'executed') {
        setResult({ success: true, message: 'Payment Executed Successfully', txHash: data.txHash });
        setTo('');
        setAmount('');
        setReason('');
      } else {
        setResult({ success: false, message: data.reason || 'Payment Rejected by Policy Engine' });
      }
    } catch (err) {
      setResult({ success: false, message: 'Network error or invalid API key' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass p-6">
      <div className="flex items-center gap-2 mb-6">
        <Send className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-bold">TERMINAL PAYMENT</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Recipient Address</label>
            <input 
              required
              placeholder="0x..."
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Amount (STT)</label>
            <input 
              required
              type="number"
              step="0.0001"
              placeholder="1.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Payment Reason</label>
          <input 
            required
            placeholder="e.g. Automated Liquidity Provision"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase font-bold px-1">Agent API Key</label>
          <input 
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full border-purple-500/20"
          />
        </div>

        <button 
          disabled={loading}
          className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 mt-4"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Zap className="w-5 h-5" />
              EXECUTE SECURE PAYMENT
            </>
          )}
        </button>
      </form>

      {result && (
        <div className={`mt-6 p-4 rounded-lg border flex items-start gap-3 ${result.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          {result.success ? (
            <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-red-400 shrink-0" />
          )}
          <div>
            <div className={`font-bold ${result.success ? 'text-green-400' : 'text-red-400'}`}>
              {result.success ? 'SUCCESS' : 'REJECTED'}
            </div>
            <div className="text-sm opacity-80">{result.message}</div>
            {result.txHash && (
              <a 
                href={`https://explorer.somnia.network/tx/${result.txHash}`} 
                target="_blank" 
                className="text-[10px] underline block mt-1 opacity-50 hover:opacity-100"
              >
                View on Explorer: {result.txHash.slice(0, 20)}...
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentForm;
