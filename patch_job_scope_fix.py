#!/usr/bin/env python3

path = "src/agent.js"
with open(path) as f:
    content = f.read()

old = """async function completeHiredJob(evaluatorWalletId, jobId, providerWalletId, deliverableText) {
  if (!deliverableText || deliverableText === 'work completed') {
    const job = await jobService.getJob(jobId);
    deliverableText = await performTask(job.description, providerWalletId, job.client);
  }
  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);
  const finalJob = await jobService.getJob(jobId);"""

new = """async function completeHiredJob(evaluatorWalletId, jobId, providerWalletId, deliverableText) {
  const job = await jobService.getJob(jobId);
  if (!deliverableText || deliverableText === 'work completed') {
    deliverableText = await performTask(job.description, providerWalletId, job.client);
  }
  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);"""

if old not in content:
    raise SystemExit("PATCH FAILED: completeHiredJob block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/agent.js — fixed job scope bug in completeHiredJob")
