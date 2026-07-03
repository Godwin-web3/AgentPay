path = "src/server.js"

with open(path, "r") as f:
    content = f.read()

old = """    const created = [];
    for (const jobId of createdIds) {
      try {
        const job = await jobService.getJob(jobId);
        created.push({ jobId, role: 'client', ...job });
      } catch (e) {
        console.error('[jobs/mine] failed to fetch job', jobId, e.message);
      }"""

new = """    const created = [];
    for (const jobId of createdIds) {
      try {
        const job = await require('./jobService').getJob(jobId);
        created.push({ jobId, role: 'client', ...job });
      } catch (e) {
        console.error('[jobs/mine] failed to fetch job', jobId, e.message);
      }"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: jobs/mine now requires jobService correctly.")
