path = "src/server.js"

with open(path, "r") as f:
    content = f.read()

old = """async function checkHiredJobs() {
  const { market, recentJobs } = await fetchMarketData();
  const agentAddress = (process.env.AGENT_ADDRESS || '').toLowerCase();
  if (!agentAddress) return { checked: 0, submitted: [] };

  const myFundedJobs = recentJobs.filter(j =>
    j.provider && j.provider.toLowerCase() === agentAddress && j.status === 'Funded'
  );

  const submitted = [];
  for (const job of myFundedJobs) {
    try {
      console.log('[HiredCheck] Found job ' + job.id + ' hiring AgentPay, submitting deliverable...');
      const deliverableText = await require('./agent').performTask(job.description);
      const providerWalletId = process.env.AGENT_WALLET_ID;
      const result = await require('./jobService').submitDeliverable(providerWalletId, job.id, deliverableText);
      submitted.push({ jobId: job.id, txHash: result.txHash });
      console.log('[HiredCheck] ✅ Submitted deliverable for job ' + job.id);
    } catch (err) {
      console.error('[HiredCheck] ❌ Job ' + job.id + ' submission failed:', err.message);
    }
  }

  return { checked: myFundedJobs.length, submitted };
}"""

new = """async function checkHiredJobs() {
  const { market, recentJobs } = await fetchMarketData();
  const agentAddress = (process.env.AGENT_ADDRESS || '').toLowerCase();
  if (!agentAddress) return { checked: 0, submitted: [] };

  const myFundedJobs = recentJobs.filter(j =>
    j.provider && j.provider.toLowerCase() === agentAddress && j.status === 'Funded'
  );

  const submitted = [];
  for (const job of myFundedJobs) {
    try {
      console.log('[HiredCheck] Found job ' + job.id + ' hiring AgentPay, submitting deliverable...');
      const providerWalletId = process.env.AGENT_WALLET_ID;

      const jobDetail = await require('./jobService').getJob(job.id);
      const wallets = await walletStore.getAllWallets();
      const evaluatorEntry = Object.values(wallets).find(
        w => w.address && w.address.toLowerCase() === jobDetail.evaluator.toLowerCase()
      );

      if (!evaluatorEntry) {
        console.error('[HiredCheck] Could not resolve evaluator walletId for job ' + job.id);
        continue;
      }

      const result = await require('./agent').completeHiredJob(
        evaluatorEntry.walletId, job.id, providerWalletId, 'work completed'
      );
      submitted.push({ jobId: job.id, txHash: result.completeTxHash });
      console.log('[HiredCheck] ✅ Submitted deliverable for job ' + job.id);
    } catch (err) {
      console.error('[HiredCheck] ❌ Job ' + job.id + ' submission failed:', err.message);
    }
  }

  return { checked: myFundedJobs.length, submitted };
}"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: checkHiredJobs now routes through completeHiredJob so deliverableText gets saved.")
