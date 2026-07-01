#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

# 1. Add a reusable function that scans for jobs where AgentPay is the hired provider
old_marker = """// Shared market data fetcher — used by both x402 route and internal proxy
async function fetchMarketData() {"""

new_marker = """// Check for jobs where AgentPay is the hired provider (Funded, not yet submitted)
async function checkHiredJobs() {
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
}

// GET /jobs/check-hired — manual trigger to check + auto-fulfill jobs hiring AgentPay
async function handleCheckHiredJobs(req, res) {
  try {
    const result = await checkHiredJobs();
    return send(res, 200, result);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// Shared market data fetcher — used by both x402 route and internal proxy
async function fetchMarketData() {"""

if old_marker not in content:
    raise SystemExit("PATCH FAILED: fetchMarketData marker not found")
content = content.replace(old_marker, new_marker, 1)

# 2. Register the route
old_route = "app.get('/market-intel', handleMarketIntel);"
new_route = "app.get('/market-intel', handleMarketIntel);\napp.get('/jobs/check-hired', handleCheckHiredJobs);"

if old_route not in content:
    raise SystemExit("PATCH FAILED: market-intel route line not found")
content = content.replace(old_route, new_route, 1)

# 3. Wire into the existing 60s keeper loop for automatic background checking
old_keeper_end = """    } catch (err) {
      console.error('Keeper error:', err.message);
    }
  }
  setInterval(runKeeper, 60000);"""

new_keeper_end = """    } catch (err) {
      console.error('Keeper error:', err.message);
    }

    try {
      const hiredResult = await checkHiredJobs();
      if (hiredResult.submitted.length > 0) {
        console.log('[HiredCheck] Auto-submitted ' + hiredResult.submitted.length + ' deliverable(s)');
      }
    } catch (err) {
      console.error('[HiredCheck] error:', err.message);
    }
  }
  setInterval(runKeeper, 60000);"""

if old_keeper_end not in content:
    raise SystemExit("PATCH FAILED: keeper end block not found")
content = content.replace(old_keeper_end, new_keeper_end, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched src/server.js — AgentPay now auto-detects and fulfills jobs where it's hired")
