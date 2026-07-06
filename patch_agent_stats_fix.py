#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old = """    const providers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'top_providers.json')));
    const ownerSet = new Set(agents.map(a => a.owner.toLowerCase()));
    const overlap = providers.filter(p => ownerSet.has(p.address.toLowerCase()));
    return send(res, 200, {
      registeredCount: agents.length,
      activeProviderCount: providers.length,
      overlapCount: overlap.length,
      overlap
    });"""

new = """    const activity = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'registered_provider_activity.json')));
    return send(res, 200, {
      registeredCount: agents.length,
      activeAgentsWithJobs: activity.length,
      overlap: activity
    });"""

if old not in content:
    raise SystemExit("PATCH FAILED: agent-stats body not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/server.js — agent-stats now reads real overlap data")
