import { useEffect, useRef, useState } from 'react'
import type { PoolProposal } from '../types'

interface LivingPoolProps {
  members: string[]
  sharedBalance: number
  proposals: PoolProposal[]
  currentUserAddress: string
  onVeto: (proposalId: string) => void
  vetoingId: string | null
}

const CX = 220
const CY = 220
const MEMBER_R = 150
const TARGET_R = 195
const CENTER_R = 42

function shortAddr(addr: string): string {
  if (!addr) return '?'
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

function pointOnCircle(r: number, angle: number) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) }
}

// Deterministic angle for an address that isn't a pool member (an external
// payment target) — hashed so the same address always lands in the same spot.
function angleForAddress(addr: string, index: number): number {
  let hash = 0
  for (let i = 0; i < addr.length; i++) hash = (hash * 31 + addr.charCodeAt(i)) >>> 0
  return (hash % 360) * (Math.PI / 180) + index * 0.0001
}

interface Ephemeral {
  id: string
  kind: 'executed' | 'vetoed'
  x: number
  y: number
  addedAt: number
}

export default function LivingPool({ members, sharedBalance, proposals, currentUserAddress, onVeto, vetoingId }: LivingPoolProps) {
  const [now, setNow] = useState(Date.now())
  const [ephemeral, setEphemeral] = useState<Ephemeral[]>([])
  const prevClosedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let raf: number
    const tick = () => {
      setNow(Date.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Detect proposals that just transitioned to closed (executed or vetoed)
  // since the last data refresh, and pop a short-lived visual for them.
  useEffect(() => {
    const nowClosed = proposals.filter((p) => p.resolved || p.vetoed)
    for (const p of nowClosed) {
      if (prevClosedRef.current.has(p.proposalId)) continue
      prevClosedRef.current.add(p.proposalId)
      const targetIdx = members.findIndex((m) => m.toLowerCase() === p.to?.toLowerCase())
      const pos = targetIdx >= 0
        ? pointOnCircle(MEMBER_R, (2 * Math.PI * targetIdx) / Math.max(members.length, 1) - Math.PI / 2)
        : pointOnCircle(TARGET_R, angleForAddress(p.to || p.proposalId, 0))
      setEphemeral((prev) => [...prev, { id: p.proposalId, kind: p.vetoed ? 'vetoed' : 'executed', x: pos.x, y: pos.y, addedAt: Date.now() }])
    }
  }, [proposals, members])

  useEffect(() => {
    if (ephemeral.length === 0) return
    const t = setInterval(() => {
      setEphemeral((prev) => prev.filter((e) => Date.now() - e.addedAt < 3500))
    }, 500)
    return () => clearInterval(t)
  }, [ephemeral.length])

  const memberPositions = members.map((addr, i) => ({
    addr,
    ...pointOnCircle(MEMBER_R, (2 * Math.PI * i) / Math.max(members.length, 1) - Math.PI / 2),
  }))

  const live = proposals.filter((p) => !p.resolved && !p.vetoed)
  const anyLive = live.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <svg viewBox="0 0 440 440" width="100%" style={{ maxWidth: 440 }}>
        <style>{`
          @keyframes lp-pulse-idle { 0%,100% { r: ${CENTER_R}px; opacity: 0.9 } 50% { r: ${CENTER_R - 4}px; opacity: 0.75 } }
          @keyframes lp-pulse-active { 0%,100% { r: ${CENTER_R}px; opacity: 1 } 50% { r: ${CENTER_R + 6}px; opacity: 0.85 } }
          @keyframes lp-burst { 0% { r: 6px; opacity: 1 } 100% { r: 26px; opacity: 0 } }
          @keyframes lp-snap { 0% { transform: scale(1); opacity: 1 } 60% { transform: scale(1.4); opacity: 1 } 100% { transform: scale(0.2); opacity: 0 } }
        `}</style>

        {/* connective spokes */}
        {memberPositions.map((m) => (
          <line key={`spoke-${m.addr}`} x1={CX} y1={CY} x2={m.x} y2={m.y} stroke="var(--border)" strokeWidth={1} opacity={0.35} />
        ))}

        {/* center: the shared pool */}
        <circle
          cx={CX}
          cy={CY}
          r={CENTER_R}
          fill="none"
          stroke="var(--cyan)"
          strokeWidth={2}
          style={{ animation: `${anyLive ? 'lp-pulse-active' : 'lp-pulse-idle'} ${anyLive ? 1.2 : 3}s ease-in-out infinite` }}
        />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize={13} fill="var(--cyan)" fontFamily="var(--font-mono)">
          {sharedBalance.toFixed(2)}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="var(--font-mono)" style={{ textTransform: 'uppercase' }}>
          shared USDC
        </text>

        {/* member nodes */}
        {memberPositions.map((m) => (
          <g key={m.addr}>
            <circle cx={m.x} cy={m.y} r={22} fill="var(--bg)" stroke={m.addr.toLowerCase() === currentUserAddress.toLowerCase() ? 'var(--cyan)' : 'var(--border)'} strokeWidth={2} />
            <text x={m.x} y={m.y + 34} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="var(--font-mono)">
              {shortAddr(m.addr)}
            </text>
          </g>
        ))}

        {/* live proposals: traveling packet + shrinking countdown ring */}
        {live.map((p, i) => {
          const targetIdx = members.findIndex((m) => m.toLowerCase() === p.to?.toLowerCase())
          const target = targetIdx >= 0
            ? memberPositions[targetIdx]
            : pointOnCircle(TARGET_R, angleForAddress(p.to || p.proposalId, i))

          const totalMs = Math.max((p.objectionWindowSeconds || 14400) * 1000, 1000)
          const remainingMs = Math.max(p.windowEnds * 1000 - now, 0)
          const progress = Math.min(1, Math.max(0, 1 - remainingMs / totalMs))
          const px = CX + (target.x - CX) * progress
          const py = CY + (target.y - CY) * progress
          const ringFrac = remainingMs / totalMs
          const circumference = 2 * Math.PI * 10

          return (
            <g key={p.proposalId}>
              <line x1={CX} y1={CY} x2={target.x} y2={target.y} stroke="var(--cyan)" strokeWidth={1.5} strokeDasharray="3 4" opacity={0.5} />
              {targetIdx < 0 && <circle cx={target.x} cy={target.y} r={16} fill="none" stroke="var(--muted)" strokeDasharray="2 3" />}
              {targetIdx < 0 && (
                <text x={target.x} y={target.y + 28} textAnchor="middle" fontSize={8} fill="var(--muted)" fontFamily="var(--font-mono)">
                  {shortAddr(p.to)}
                </text>
              )}
              <circle cx={px} cy={py} r={10} fill="none" stroke="var(--cyan)" strokeWidth={2}
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ringFrac)}
                transform={`rotate(-90 ${px} ${py})`} />
              <circle cx={px} cy={py} r={5} fill="var(--cyan)" />
              <text x={px} y={py - 16} textAnchor="middle" fontSize={9} fill="var(--cyan)" fontFamily="var(--font-mono)">
                {p.amount.toFixed(2)}
              </text>
            </g>
          )
        })}

        {/* ephemeral burst / snap-back for just-resolved proposals */}
        {ephemeral.map((e) => (
          <circle
            key={e.id}
            cx={e.x}
            cy={e.y}
            r={6}
            fill="none"
            stroke={e.kind === 'executed' ? 'var(--cyan)' : 'var(--danger)'}
            strokeWidth={2}
            style={{ animation: `${e.kind === 'executed' ? 'lp-burst' : 'lp-snap'} 1.1s ease-out forwards`, transformOrigin: `${e.x}px ${e.y}px` }}
          />
        ))}
      </svg>

      {live.length > 0 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {live.map((p) => (
            <div key={p.proposalId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}>
              <div>
                <strong style={{ color: 'var(--cyan)' }}>{p.amount.toFixed(2)} USDC</strong> to {shortAddr(p.to)} — {p.reason || p.kind}
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {Math.max(0, Math.ceil((p.windowEnds * 1000 - now) / 60000))} min left to object
                </div>
              </div>
              <button
                className="send-btn"
                style={{ width: 'auto', padding: '4px 12px', fontSize: 11, background: 'var(--danger)' }}
                disabled={vetoingId === p.proposalId}
                onClick={() => onVeto(p.proposalId)}
              >
                {vetoingId === p.proposalId ? 'Objecting...' : 'Object'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
