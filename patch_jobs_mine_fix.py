#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old = """    const createdSnap = await db.collection('spendStore')
      .where('userAddress', '==', uid)
      .where('type', '==', 'job_hire')
      .get();
    const createdIds = createdSnap.docs
      .map(doc => doc.data().jobId)
      .filter(Boolean);"""

new = """    const { getJobsCreatedBy } = require('./spendStore');
    const createdIds = await getJobsCreatedBy(uid);"""

if old not in content:
    raise SystemExit("PATCH FAILED: db.collection block not found in server.js")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/server.js — /api/jobs/mine now uses getJobsCreatedBy")
