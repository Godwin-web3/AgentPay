#!/usr/bin/env python3

path = "src/jobService.js"
with open(path) as f:
    content = f.read()

old1 = """  const CHUNK = 10000n;
  const event = agenticCommerceAbi.find(a => a.type === 'event' && a.name === 'JobCreated');
  const latest = await publicClient.getBlockNumber();
  const START_BLOCK = latest > 100000n ? latest - 100000n : 0n;
  let allLogs = [];
  for (let from = START_BLOCK; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    try {
      const logs = await publicClient.getLogs({
        address: AGENTIC_COMMERCE_CONTRACT,
        event,
        fromBlock: from,
        toBlock: to
      });
      allLogs = allLogs.concat(logs);
    } catch { }
  }"""

new1 = """  const CHUNK = 10000n;
  const event = agenticCommerceAbi.find(a => a.type === 'event' && a.name === 'JobCreated');
  const latest = await publicClient.getBlockNumber();
  const START_BLOCK = latest > 20000n ? latest - 20000n : 0n;
  let allLogs = [];
  for (let from = START_BLOCK; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    try {
      const logTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('getLogs timeout')), 8000));
      const logs = await Promise.race([
        publicClient.getLogs({ address: AGENTIC_COMMERCE_CONTRACT, event, fromBlock: from, toBlock: to }),
        logTimeout
      ]);
      allLogs = allLogs.concat(logs);
    } catch (e) {
      console.error('[getRecentJobs] chunk failed', from.toString(), '-', to.toString(), e.message);
    }
  }"""

if old1 not in content:
    raise SystemExit("PATCH FAILED: block scan loop not found")
content = content.replace(old1, new1, 1)

old2 = """      const job = await getJob(id);
      if (job.client !== '0x0000000000000000000000000000000000000000') {
        jobs.push({
          ...job,
          budget: Number(job.budget).toFixed(2),
          description: job.description.slice(0, 80)
        });
      }
    } catch { }
  }"""

new2 = """      const jobTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('getJob timeout')), 5000));
      const job = await Promise.race([getJob(id), jobTimeout]);
      if (job.client !== '0x0000000000000000000000000000000000000000') {
        jobs.push({
          ...job,
          budget: Number(job.budget).toFixed(2),
          description: job.description.slice(0, 80)
        });
      }
    } catch (e) {
      console.error('[getRecentJobs] job fetch failed', id.toString(), e.message);
    }
  }"""

if old2 not in content:
    raise SystemExit("PATCH FAILED: job fetch loop not found")
content = content.replace(old2, new2, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/jobService.js — timeouts on both loops, reduced block range")
