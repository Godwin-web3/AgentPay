path = "src/server.js"

with open(path, "r") as f:
    content = f.read()

old = """// GET /jobs/:id
async function handleGetJob(req, res) {
  try {
    const job = await require('./jobService').getJob(req.params.id);
    return send(res, 200, job);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}"""

new = """// GET /jobs/:id
async function handleGetJob(req, res) {
  try {
    const job = await require('./jobService').getJob(req.params.id);
    const { getHistory } = require('./spendStore');
    const history = await getHistory(null, 500);
    const deliverable = history.find(tx => tx.jobId === req.params.id && tx.type === 'job_deliverable');
    if (deliverable) job.deliverableText = deliverable.deliverableText;
    return send(res, 200, job);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: GET /jobs/:id now returns deliverableText when available.")
