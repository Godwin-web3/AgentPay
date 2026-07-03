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

new = """async function checkHiredJobs() {
  const agentAddress = (process.env.AGENT_ADDRESS || '').toLowerCase();
  if (!agentAddress) return { checked: 0, submitted: [] };

  const { getActiveUsers, getJobsCreatedBy } = require('./spendStore');
  const jobService = require('./jobService');
  const wallets = await walletStore.getAllWallets();
  const users = await getActiveUsers();

  const allJobIds = new Set();
  for (const uid of users) {
    const jobIds = await getJobsCreatedBy(uid);
    jobIds.forEach(id => allJobIds.add(id));
  }

  const submitted = [];
  let checked = 0;

  for (const jobId of allJobIds) {
    try {
      const job = await jobService.getJob(jobId);
      if (!job.provider || job.provider.toLowerCase() !== agentAddress || job.status !== 'Funded') continue;
      checked++;

      console.log('[HiredCheck] Found job ' + jobId + ' hiring AgentPay, submitting deliverable...');
      const providerWalletId = process.env.AGENT_WALLET_ID;

      const evaluatorEntry = Object.values(wallets).find(
        w => w.address && w.address.toLowerCase() === job.evaluator.toLowerCase()
      );

      if (!evaluatorEntry) {
        console.error('[HiredCheck] Could not resolve evaluator walletId for job ' + jobId);
        continue;
      }

      const result = await require('./agent').completeHiredJob(
        evaluatorEntry.walletId, jobId, providerWalletId, 'work completed'
      );
      submitted.push({ jobId, txHash: result.completeTxHash });
      console.log('[HiredCheck] Submitted deliverable for job ' + jobId);
    } catch (err) {
      console.error('[HiredCheck] Job ' + jobId + ' submission failed:', err.message);
    }
  }

  return { checked, submitted };
}"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: checkHiredJobs now reads real job IDs from Firestore instead of scanning a fixed range.")
