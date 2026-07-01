#!/usr/bin/env python3

path = "src/spendStore.js"
with open(path) as f:
    content = f.read()

old = """module.exports = {
  appendSpend,
  appendSwap,
  appendFailure,
  appendInference,
  getTodaySpend,"""

new = """module.exports = {
  appendSpend,
  appendSwap,
  appendFailure,
  appendInference,
  getJobsCreatedBy,
  getTodaySpend,"""

if old not in content:
    raise SystemExit("PATCH FAILED: exports block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/spendStore.js — exported getJobsCreatedBy")
