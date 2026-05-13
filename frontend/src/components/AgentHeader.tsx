import { useEffect, useState } from 'react'
import { getHealth } from '../api'
import type { HealthData } from '../types'
import WalletConnect from './WalletConnect'

interface Props {
  onAddressChange: (addr: string) => void
}

export default function AgentHeader({ onAddressChange }: Props) {
  const [health, setHealth] = useState<HealthData | null>(null)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  return (
    <div className="agent-header">
      <div className="agent-info">
        <div className="agent-avatar">⚡</div>
        <div>
          <div className="agent-name">AGENTPAY</div>
          <div className="agent-address" style={{ fontSize: 10, opacity: 0.6 }}>
            AGENT: {health?.address ? health.address.slice(0, 8) + '...' : '0x...'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <WalletConnect onAddressChange={onAddressChange} />
        
        <div className={`status-pill ${health?.status === 'ok' ? 'online' : 'offline'}`}>
          <div className="status-dot" />
          {health?.status === 'ok' ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>
    </div>
  )
}
