const PATH =
  'M20.51 2L30.91 2L49.42 35.39L45.06 40.1L45.06 62L35.15 54.62L35.15 44.58L44.22 35.63L35.27 27.65L25.71 10.23L16.03 27.89L31.15 28.01L38.77 35.51L25.47 48.69L19.54 48.69L13.01 60.67L2 60.67L12.89 40.71L25.59 40.71L30.91 35.75L2 35.63Z'

export function Mark({ height = 18 }: { height?: number }) {
  const width = Math.round(height * (51.5 / 64))
  return (
    <svg width={width} height={height} viewBox="0 0 51.5 64" aria-hidden="true">
      <path fill="currentColor" d={PATH} />
    </svg>
  )
}

export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="brand-lockup" style={{ fontSize: size }}>
      <Mark height={Math.round(size * 1.05)} />
      <span>AgentPay</span>
    </span>
  )
}
