#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old_import = "import Marketplace from './views/Marketplace'\n"
if old_import in content:
    content = content.replace(old_import, "", 1)

old_nav = "  { id: 'marketplace', icon: MarketplaceIcon, label: 'Marketplace' },\n"
if old_nav in content:
    content = content.replace(old_nav, "", 1)

old_render = "            {view === 'marketplace' && <Marketplace userAddress={userAddress} userId={userId} />}\n"
if old_render in content:
    content = content.replace(old_render, "", 1)

old_type = "'marketplace' | "
if old_type in content:
    content = content.replace(old_type, "", 1)

with open(path, "w") as f:
    f.write(content)
print("Removed Marketplace from App.tsx")
