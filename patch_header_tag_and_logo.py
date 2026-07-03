#!/usr/bin/env python3

path = "frontend/src/components/AgentHeader.tsx"
with open(path) as f:
    content = f.read()

# 1. Add tag to Props interface
old_props = """interface Props {
  onAddressChange: (addr: string) => void
  onBalanceChange?: (vault: string, wallet: string) => void
  onProviderChange?: (provider: any) => void
  currentView: string
  onNavigate: (view: string) => void
  onClearMemory?: () => void
  refreshTrigger?: any
  activeProvider?: any
  userAddress?: string
}"""

new_props = """interface Props {
  onAddressChange: (addr: string) => void
  onBalanceChange?: (vault: string, wallet: string) => void
  onProviderChange?: (provider: any) => void
  currentView: string
  onNavigate: (view: string) => void
  onClearMemory?: () => void
  refreshTrigger?: any
  activeProvider?: any
  userAddress?: string
  tag?: string | null
}"""

if old_props not in content:
    raise SystemExit("PATCH FAILED (1): Props interface not found")
content = content.replace(old_props, new_props, 1)

# 2. Add tag to destructure
old_fn = "export default function AgentHeader({ onAddressChange, onBalanceChange, onProviderChange, currentView, onNavigate, onClearMemory, refreshTrigger, userAddress }: Props) {"
new_fn = "export default function AgentHeader({ onAddressChange, onBalanceChange, onProviderChange, currentView, onNavigate, onClearMemory, refreshTrigger, userAddress, tag }: Props) {"

if old_fn not in content:
    raise SystemExit("PATCH FAILED (2): function signature not found")
content = content.replace(old_fn, new_fn, 1)

# 3. Recolor the logo SVG from hardcoded old-cyan to brass
content = content.replace('#4fdbc8', '#D9A441')
content = content.replace('#3ab8a8', '#B8862F')

# 4. Add tag badge after agent-name
old_name_block = """          <div className="agent-name">AGENTPAY</div>
          {userAddress && isPaused && ("""

new_name_block = """          <div className="agent-name">AGENTPAY</div>
          {tag && tag !== 'skip' && (
            <div style={{
              padding: '2px 8px',
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              background: 'rgba(217,164,65,0.08)',
              border: '1px solid var(--seal)',
              color: 'var(--seal)',
            }}>
              @{tag}
            </div>
          )}
          {userAddress && isPaused && ("""

if old_name_block not in content:
    raise SystemExit("PATCH FAILED (3): agent-name block not found")
content = content.replace(old_name_block, new_name_block, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched AgentHeader.tsx — tag badge added, logo recolored to brass")
