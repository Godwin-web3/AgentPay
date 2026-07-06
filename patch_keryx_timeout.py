#!/usr/bin/env python3

path = "src/agent.js"
with open(path) as f:
    content = f.read()

old = """      try {
        const res = await x402Client.fetchWithPayment(
          `${KERYX_BASE}${tool.route}`,
          walletId,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: description }) },
          userAddress
        );
        return `${JSON.stringify(res.data)} (sourced live via Keryx tool "${tool.name}", paid ${res.actualAmount || tool.price} USDC)`;
      } catch (e) {
        console.error('[performTask] Keryx call failed, falling back to Groq:', e.message);
      }"""

new = """      try {
        const keryxTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Keryx call timeout')), 15000));
        const res = await Promise.race([
          x402Client.fetchWithPayment(
            `${KERYX_BASE}${tool.route}`,
            walletId,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: description }) },
            userAddress
          ),
          keryxTimeout
        ]);
        return `${JSON.stringify(res.data)} (sourced live via Keryx tool "${tool.name}", paid ${res.actualAmount || tool.price} USDC)`;
      } catch (e) {
        console.error('[performTask] Keryx call failed, falling back to Groq:', e.message);
      }"""

if old not in content:
    raise SystemExit("PATCH FAILED: Keryx call block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/agent.js — added 15s timeout to Keryx payment call")
