#!/usr/bin/env python3

path1 = "src/spendStore.js"
with open(path1) as f:
    content1 = f.read()

marker = "module.exports = {"

new_fn = """async function getJobsCreatedBy(userAddress) {
  const snap = await db.collection(COLLECTION)
    .where('userAddress', '==', userAddress)
    .where('type', '==', 'job_hire')
    .get();
  return snap.docs.map(doc => doc.data().jobId).filter(Boolean);
}

module.exports = {"""

if marker not in content1:
    raise SystemExit("PATCH FAILED (spendStore.js): module.exports not found")
content1 = content1.replace(marker, new_fn, 1)

with open(path1, "w") as f:
    f.write(content1)
print("Patched src/spendStore.js — added getJobsCreatedBy")
