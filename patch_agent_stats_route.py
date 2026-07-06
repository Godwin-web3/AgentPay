#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

route = """
app.get('/api/agent-stats', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const agents = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'registered_agents.json')));
    const providers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'top_providers.json')));
    const ownerSet = new Set(agents.map(a => a.owner.toLowerCase()));
    const overlap = providers.filter(p => ownerSet.has(p.address.toLowerCase()));
    return send(res, 200, {
      registeredCount: agents.length,
      activeProviderCount: providers.length,
      overlapCount: overlap.length,
      overlap
    });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
});
"""

marker = "app.get('/api/market/jobs'"
if marker not in content:
    raise SystemExit("PATCH FAILED: insertion point not found")

content = content.replace(marker, route.strip() + "\n\n" + marker, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/server.js — added /api/agent-stats")
