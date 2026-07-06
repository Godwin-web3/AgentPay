#!/usr/bin/env python3

path = "src/agent.js"
with open(path) as f:
    content = f.read()

old = """async function performTask(description) {
  try {
    const completion = await groqCompound.chat.completions.create({"""

new = """const KERYX_BASE = 'https://keryxhq.xyz';

async function findKeryxTool(description) {
  try {
    const res = await fetch(`${KERYX_BASE}/api/tools`, { signal: AbortSignal.timeout(5000) });
    const { tools } = await res.json();
    const lower = description.toLowerCase();
    return tools.find(t =>
      lower.includes(t.name.toLowerCase()) ||
      (t.description && lower.split(' ').some(w => w.length > 4 && t.description.toLowerCase().includes(w)))
    ) || null;
  } catch (e) {
    return null;
  }
}

async function performTask(description, walletId, userAddress) {
  try {
    const tool = walletId ? await findKeryxTool(description) : null;
    if (tool) {
      try {
        const res = await x402Client.fetchWithPayment(
          `${KERYX_BASE}${tool.route}`,
          walletId,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: description }) },
          userAddress
        );
        return `${JSON.stringify(res.data)} (sourced live via Keryx tool "${tool.name}", paid ${res.actualAmount || tool.price} USDC)`;
      } catch (e) {
        console.error('[performTask] Keryx call failed, falling back to Groq:', e.message);
      }
    }
    const completion = await groqCompound.chat.completions.create({"""

if old not in content:
    raise SystemExit("PATCH FAILED: performTask signature not found")
content = content.replace(old, new, 1)

old2 = "    deliverableText = await performTask(job.description);"
new2 = "    deliverableText = await performTask(job.description, providerWalletId, job.client);"

if old2 not in content:
    raise SystemExit("PATCH FAILED: performTask call site not found")
content = content.replace(old2, new2, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/agent.js — performTask now checks Keryx before falling back to Groq")
