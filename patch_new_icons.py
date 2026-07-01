#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = """const navItems = [
  { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
  { id: 'schedules', icon: ScheduleIcon, label: 'Schedules' },
  { id: 'history',   icon: HistoryIcon,  label: 'History'   },
  { id: 'account',   icon: AccountIcon,  label: 'Account'   },
] as const"""

new = """const MarketplaceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l1.5-5h15L21 9"/>
    <path d="M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
  </svg>
)
const JobsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="13" rx="2" ry="2"/>
    <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>
  </svg>
)
const AgentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="12" rx="2" ry="2"/>
    <line x1="12" y1="2" x2="12" y2="8"/>
    <circle cx="9" cy="14" r="1"/>
    <circle cx="15" cy="14" r="1"/>
  </svg>
)
const navItems = [
  { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
  { id: 'marketplace', icon: MarketplaceIcon, label: 'Marketplace' },
  { id: 'jobs', icon: JobsIcon, label: 'Jobs' },
  { id: 'schedules', icon: ScheduleIcon, label: 'Schedules' },
  { id: 'agent', icon: AgentIcon, label: 'Agent' },
  { id: 'history',   icon: HistoryIcon,  label: 'History'   },
  { id: 'account',   icon: AccountIcon,  label: 'Account'   },
] as const"""

if old not in content:
    raise SystemExit("PATCH FAILED: navItems block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched frontend/src/App.tsx — added Marketplace, Jobs, Agent icons and nav items")
