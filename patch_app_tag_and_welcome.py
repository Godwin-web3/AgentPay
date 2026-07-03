#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

# 1. Pass tag into AgentHeader
old_header = """        <AgentHeader
          onAddressChange={setUserAddress}
          onBalanceChange={(v, w) => { setVaultBalance(v); setWalletBalance(w) }}
          onProviderChange={setActiveProvider}
          currentView={view}
          onNavigate={(v) => setView(v as View)}
          onClearMemory={handleClearMemory}
          refreshTrigger={refreshKey}
          activeProvider={activeProvider}
          userAddress={userAddress}
        />"""

new_header = """        <AgentHeader
          onAddressChange={setUserAddress}
          onBalanceChange={(v, w) => { setVaultBalance(v); setWalletBalance(w) }}
          onProviderChange={setActiveProvider}
          currentView={view}
          onNavigate={(v) => setView(v as View)}
          onClearMemory={handleClearMemory}
          refreshTrigger={refreshKey}
          activeProvider={activeProvider}
          userAddress={userAddress}
          tag={tag}
        />"""

if old_header not in content:
    raise SystemExit("PATCH FAILED (1): AgentHeader call not found")
content = content.replace(old_header, new_header, 1)

# 2. Update the welcome message — personalized greeting + accurate capability list
old_welcome = """  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`agentpay_chat_${userAddress}`)
    if (saved) return JSON.parse(saved)
    return [{
      role: 'assistant',
      content: 'AgentPay online. I can send payments, manage schedules, and enforce your policy. What do you need?',
      timestamp: Date.now()
    }]
  })"""

new_welcome = """  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`agentpay_chat_${userAddress}`)
    if (saved) return JSON.parse(saved)
    const greeting = tag && tag !== 'skip' ? `Welcome back, @${tag}.` : 'AgentPay online.'
    return [{
      role: 'assistant',
      content: `${greeting} I can send payments, manage schedules, enforce your policy, and hire or be hired by other agents on the job marketplace. What do you need?`,
      timestamp: Date.now()
    }]
  })"""

if old_welcome not in content:
    raise SystemExit("PATCH FAILED (2): welcome message block not found")
content = content.replace(old_welcome, new_welcome, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched App.tsx — tag flows into header, welcome message personalized + updated")
