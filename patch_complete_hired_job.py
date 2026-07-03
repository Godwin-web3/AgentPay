path = "src/agent.js"

with open(path, "r") as f:
    content = f.read()

old = """async function completeHiredJob(evaluatorWalletId, jobId, providerWalletId, deliverableText) {
  if (!deliverableText || deliverableText === 'work completed') {
    const job = await jobService.getJob(jobId);
    deliverableText = await performTask(job.description);
  }
  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);
  const job = await jobService.getJob(jobId);
  return { success: true, submitTxHash, completeTxHash, job, deliverableText };
}"""

new = """async function completeHiredJob(evaluatorWalletId, jobId, providerWalletId, deliverableText) {
  if (!deliverableText || deliverableText === 'work completed') {
    const job = await jobService.getJob(jobId);
    deliverableText = await performTask(job.description);
  }
  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);
  const job = await jobService.getJob(jobId);

  try {
    await appendSpend({
      userAddress: job.client,
      to: job.provider,
      amount: job.budget,
      reason: job.description,
      txHash: completeTxHash,
      jobId,
      type: 'job_deliverable',
      deliverableText
    });
  } catch (err) {
    console.error('[completeHiredJob] Failed to persist deliverable text:', err.message);
  }

  return { success: true, submitTxHash, completeTxHash, job, deliverableText };
}"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: completeHiredJob now persists deliverableText to Firestore.")
