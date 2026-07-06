#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old = "recentJobs: jobs.slice(0, 10) };"
new = "recentJobs: jobs.slice(0, 30) };"

if old not in content:
    raise SystemExit("PATCH FAILED: slice line not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/server.js — recentJobs now shows 30")
