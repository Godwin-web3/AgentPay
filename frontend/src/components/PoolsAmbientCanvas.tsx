import { useEffect, useRef } from 'react'

// Ambient, decorative loop: a wire travels from a member node toward a
// target, a countdown ring shrinks around it, and it either seals (gold
// burst) or breaks (coral snap-back). Purely atmospheric — the real,
// data-driven version of this mechanic lives in LivingPool.tsx.
export default function PoolsAmbientCanvas({ nodeCount = 5 }: { nodeCount?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const GOLD = '#D9A441', CORAL = '#C4573F', WIRE = '#5B8CA6', HAIR = '#262B31', MUTED = '#3A3F46'
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.parentElement!.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const W = rect.width, H = rect.height
    const cx = W / 2, cy = H / 2
    const nodeR = Math.min(W, H) * 0.34
    const nodes = Array.from({ length: nodeCount }, (_, i) => {
      const angle = (Math.PI * 2 * i) / nodeCount - Math.PI / 2
      return { x: cx + nodeR * Math.cos(angle), y: cy + nodeR * Math.sin(angle) }
    })

    let wire: any = null
    let raf = 0
    let stopped = false

    function spawnWire() {
      const from = nodes[Math.floor(Math.random() * nodes.length)]
      let to: { x: number; y: number } = Math.random() < 0.4 ? { x: cx, y: cy } : nodes[Math.floor(Math.random() * nodes.length)]
      if (to === from) to = { x: cx, y: cy }
      const outcome = Math.random() < 0.7 ? 'seal' : 'break'
      wire = { from, to, startedAt: performance.now(), duration: 3200, outcome, phase: 'transit', effectStart: 0 }
    }

    function drawEmblem() {
      ctx.beginPath()
      ctx.arc(cx, cy, 22, 0, Math.PI * 2)
      ctx.strokeStyle = GOLD
      ctx.globalAlpha = 0.8
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 15, 0, Math.PI * 2)
      ctx.fillStyle = GOLD
      ctx.globalAlpha = 0.12
      ctx.fill()
      ctx.globalAlpha = 1
    }

    function draw(now: number) {
      if (stopped) return
      ctx.clearRect(0, 0, W, H)

      ctx.lineWidth = 1
      ctx.strokeStyle = HAIR
      nodes.forEach((n) => {
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(n.x, n.y)
        ctx.stroke()
      })

      drawEmblem()

      nodes.forEach((n) => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, 7, 0, Math.PI * 2)
        ctx.fillStyle = '#0B0D10'
        ctx.fill()
        ctx.lineWidth = 1.4
        ctx.strokeStyle = MUTED
        ctx.stroke()
      })

      if (!reduceMotion) {
        if (!wire) {
          spawnWire()
        } else {
          const elapsed = now - wire.startedAt
          if (wire.phase === 'transit') {
            const t = Math.min(elapsed / wire.duration, 1)
            const breakPoint = 0.55
            if (wire.outcome === 'break' && t >= breakPoint) {
              wire.phase = 'return'
              wire.startedAt = now
              wire.returnFrom = t
            } else {
              const px = wire.from.x + (wire.to.x - wire.from.x) * t
              const py = wire.from.y + (wire.to.y - wire.from.y) * t
              ctx.beginPath()
              ctx.moveTo(wire.from.x, wire.from.y)
              ctx.lineTo(px, py)
              ctx.strokeStyle = WIRE
              ctx.globalAlpha = 0.7
              ctx.lineWidth = 1.4
              ctx.stroke()
              ctx.globalAlpha = 1

              const ringR = 9 + (1 - t) * 3
              ctx.beginPath()
              ctx.arc(px, py, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - t))
              ctx.strokeStyle = GOLD
              ctx.lineWidth = 2
              ctx.stroke()
              ctx.beginPath()
              ctx.arc(px, py, 4, 0, Math.PI * 2)
              ctx.fillStyle = GOLD
              ctx.fill()

              if (t >= 1) { wire.phase = 'seal'; wire.startedAt = now; wire.at = { x: px, y: py } }
            }
          } else if (wire.phase === 'return') {
            const rt = Math.min((now - wire.startedAt) / 700, 1)
            const fromT = wire.returnFrom
            const bx = wire.from.x + (wire.to.x - wire.from.x) * fromT
            const by = wire.from.y + (wire.to.y - wire.from.y) * fromT
            const px2 = bx + (wire.from.x - bx) * rt
            const py2 = by + (wire.from.y - by) * rt
            ctx.beginPath()
            ctx.moveTo(bx, by)
            ctx.lineTo(px2, py2)
            ctx.strokeStyle = CORAL
            ctx.globalAlpha = 0.8
            ctx.lineWidth = 1.4
            ctx.stroke()
            ctx.globalAlpha = 1
            ctx.beginPath()
            ctx.arc(px2, py2, 4, 0, Math.PI * 2)
            ctx.fillStyle = CORAL
            ctx.fill()
            if (rt >= 1) { wire.phase = 'break'; wire.startedAt = now; wire.at = { x: wire.from.x, y: wire.from.y } }
          } else if (wire.phase === 'seal' || wire.phase === 'break') {
            const et = Math.min((now - wire.startedAt) / 600, 1)
            const color = wire.phase === 'seal' ? GOLD : CORAL
            ctx.beginPath()
            ctx.arc(wire.at.x, wire.at.y, 6 + et * 22, 0, Math.PI * 2)
            ctx.strokeStyle = color
            ctx.globalAlpha = 1 - et
            ctx.lineWidth = 2
            ctx.stroke()
            ctx.globalAlpha = 1
            if (et >= 1) wire = null
          }
        }
      } else if (wire === null) {
        const t0 = 0.6
        const sx = nodes[0].x + (cx - nodes[0].x) * t0
        const sy = nodes[0].y + (cy - nodes[0].y) * t0
        ctx.beginPath()
        ctx.moveTo(nodes[0].x, nodes[0].y)
        ctx.lineTo(sx, sy)
        ctx.strokeStyle = WIRE
        ctx.lineWidth = 1.4
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(sx, sy, 9, -Math.PI / 2, Math.PI)
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 2
        ctx.stroke()
        wire = {} // prevent respawn loop in the static reduced-motion frame
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => { stopped = true; cancelAnimationFrame(raf) }
  }, [nodeCount])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}
