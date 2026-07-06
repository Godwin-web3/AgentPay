#!/usr/bin/env python3

path = "src/agent.js"
with open(path) as f:
    content = f.read()

old = """  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);
  const job = await jobService.getJob(jobId);"""

new = """  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);
  const finalJob = await jobService.getJob(jobId);"""

if old not in content:
    raise SystemExit("PATCH FAILED: duplicate job block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/agent.js — renamed second job declaration to finalJob")
