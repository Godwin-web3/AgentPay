import { useEffect, useState } from 'react'
import { getHealth } from '../api'
import type { HealthData } from '../types'

export default function AgentHeader() {
  const [health, setHealth] = useState<HealthData | null>(null)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  const shortAddress = health?.address
    ? health.address.slice(0, 6) + '...' + health.address.slice(-4)
    : '0x...'

  return (
    <div className="agent-header">
      <div className="agent-info">
        <div className="agent-avatar">⚡</div>
        <div>
          <div className="agent-name">AGENTPAY</div>
          <div className="agent-address">{shortAddress}</div>
        </div>
      </div>
      <div className={`status-pill ${health?.status === 'ok' ? 'online' : 'offline'}`}>
        <div className="status-dot" />
        {health?.status === 'ok' ? 'ONLINE' : 'OFFLINE'}
      </div>
    </div>
  )
}
