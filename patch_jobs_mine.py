#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

route = """
app.get('/api/jobs/mine', async (req, res) => {
  try {
    const uid = req.headers['x-user-id'];
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const createdSnap = await db.collection('spendStore')
      .where('userAddress', '==', uid)
      .where('type', '==', 'job_hire')
      .get();
    const createdIds = createdSnap.docs
      .map(doc => doc.data().jobId)
      .filter(Boolean);

    const created = [];
    for (const jobId of createdIds) {
      try {
        const job = await jobService.getJob(jobId);
        created.push({ jobId, role: 'client', ...job });
      } catch (e) {
        console.error('[jobs/mine] failed to fetch job', jobId, e.message);
      }
    }

    const agentAddress = (process.env.AGENT_ADDRESS || '').toLowerCase();
    const marketData = await fetchMarketData();
    const hiredJobs = marketData.recentJobs.filter(j =>
      j.provider && j.provider.toLowerCase() === agentAddress
    );

    res.status(200).json({ created, hired: hiredJobs });
  } catch (err) {
    console.error('[jobs/mine] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
"""

marker = "app.get('/api/market/jobs'"
if marker not in content:
    raise SystemExit("PATCH FAILED: insertion point not found")

content = content.replace(marker, route.strip() + "\n\n" + marker, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/server.js — added /api/jobs/mine")
