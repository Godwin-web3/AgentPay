#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old_import = "import Marketplace from './views/Marketplace'"
new_import = "import Marketplace from './views/Marketplace'\nimport Agent from './views/Agent'"
if old_import not in content:
    raise SystemExit("PATCH FAILED: Marketplace import not found")
content = content.replace(old_import, new_import, 1)

old_render = "            {view === 'marketplace' && <Marketplace userAddress={userAddress} userId={userId} />}"
new_render = "            {view === 'marketplace' && <Marketplace userAddress={userAddress} userId={userId} />}\n            {view === 'agent' && <Agent />}"
if old_render not in content:
    raise SystemExit("PATCH FAILED: marketplace render line not found")
content = content.replace(old_render, new_render, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched App.tsx: wired Agent view")
