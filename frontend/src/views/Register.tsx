import { useState } from 'react'
import { api } from '../services/api'
import { useAccount } from 'wagmi'

interface RegisterProps {
  onSuccess: (apiKey: string) => void
}

const S = {
  container: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0A0A0A' },
  card: { background: '#141414', border: '1px solid #262626', padding: 40, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column' as const, gap: 24 },
  h1: { fontFamily: 'Anybody', fontSize: 24, fontWeight: 700, color: '#e5e2e1', margin: 0 },
  sub: { fontFamily: 'Geist', fontSize: 14, color: '#bbcac6', lineHeight: 1.6 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  label: { fontFamily: 'JetBrains Mono', fontSize: 11, color: '#4fdbc8', letterSpacing: '0.05em' },
  input: { background: '#0A0A0A', border: '1px solid #262626', color: '#e5e2e1', fontFamily: 'Geist', fontSize: 14, padding: '12px 16px', outline: 'none' },
  btn: { padding: '14px', background: '#4fdbc8', color: '#003731', border: 'none', fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  error: { color: '#ffb4ab', fontSize: 12, fontFamily: 'Geist' },
  successBox: { background: 'rgba(79,219,200,0.1)', border: '1px solid rgba(79,219,200,0.3)', padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 12 },
  keyBox: { background: '#0A0A0A', border: '1px solid #262626', padding: 12, fontFamily: 'JetBrains Mono', fontSize: 13, color: '#4fdbc8', wordBreak: 'break-all' as const },
}

export default function Register({ onSuccess }: RegisterProps) {
  const { address } = useAccount()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ apiKey: string; agentId: string } | null>(null)

  const handleRegister = async () => {
    if (!address) return setError('Please connect your wallet first.')
    if (!name) return setError('Agent name is required.')
    
    setLoading(true)
    setError('')
    
    try {
      const data = await api.register(name, desc, address)
      setResult({ apiKey: data.apiKey, agentId: data.agentId })
    } catch (err) {
      setError('Registration failed. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div style={S.container}>
        <div style={S.card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 style={S.h1}>Agent Registered!</h1>
            <p style={S.sub}>Your autonomous agent is now live on the Somnia network.</p>
          </div>

          <div style={S.successBox}>
            <span style={S.label}>YOUR API KEY</span>
            <div style={S.keyBox}>{result.apiKey}</div>
            <p style={{ ...S.sub, fontSize: 12, color: '#4fdbc8' }}>
              IMPORTANT: Copy this key now. It will not be shown again.
            </p>
          </div>

          <button onClick={() => onSuccess(result.apiKey)} style={S.btn}>
            CONTINUE TO TERMINAL
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={S.container}>
      <div style={S.card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={S.h1}>Register New Agent</h1>
          <p style={S.sub}>Create your autonomous identity to start making policy-driven payments.</p>
        </div>

        <div style={S.field}>
          <label style={S.label}>AGENT NAME</label>
          <input 
            style={S.input} 
            placeholder="e.g. My DeFi Agent" 
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div style={S.field}>
          <label style={S.label}>DESCRIPTION (OPTIONAL)</label>
          <input 
            style={S.input} 
            placeholder="What does this agent do?" 
            value={desc}
            onChange={e => setDesc(e.target.value)}
          />
        </div>

        {error && <p style={S.error}>{error}</p>}

        <button 
          onClick={handleRegister} 
          disabled={loading}
          style={{ ...S.btn, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'REGISTERING...' : 'INITIALIZE AGENT'}
          {!loading && <span className="material-symbols-outlined">bolt</span>}
        </button>

        <div style={{ display: 'flex', gap: 12, padding: 16, background: '#0A0A0A', border: '1px solid #262626' }}>
          <span className="material-symbols-outlined" style={{ color: '#4fdbc8', fontSize: 18 }}>account_balance_wallet</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ ...S.label, fontSize: 10 }}>CONNECTED WALLET</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#e5e2e1' }}>
              {address ? `${address.slice(0, 12)}...${address.slice(-8)}` : 'Not Connected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
