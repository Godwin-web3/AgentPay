path = "src/server.js"

with open(path, "r") as f:
    content = f.read()

old = """    const created = [];
    for (const jobId of createdIds) {
      try {
        const job = await require('./jobService').getJob(jobId);
        created.push({ jobId, role: 'client', ...job });
      } catch (e) {
        console.error('[jobs/mine] failed to fetch job', jobId, e.message);
      }
    }"""

new = """    const jobService = require('./jobService');
    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);

    const jobResults = await Promise.allSettled(
      createdIds.map(jobId => withTimeout(jobService.getJob(jobId), 8000).then(job => ({ jobId, job })))
    );

    const created = [];
    jobResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        created.push({ jobId: r.value.jobId, role: 'client', ...r.value.job });
      } else {
        console.error('[jobs/mine] failed to fetch job', createdIds[i], r.reason.message);
      }
    });"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: jobs/mine now fetches jobs in parallel with an 8s timeout per call.")
