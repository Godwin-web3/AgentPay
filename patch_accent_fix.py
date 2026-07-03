#!/usr/bin/env python3

path = "frontend/src/index.css"
with open(path) as f:
    content = f.read()

old = """  --blue:       #5B8CA6;
  --coral:      #D9A441;
  --cyan:       #5B8CA6;
  --seal:       #D9A441;
  --wire:       #5B8CA6;"""

new = """  --blue:       #D9A441;
  --coral:      #C4573F;
  --cyan:       #D9A441;
  --seal:       #D9A441;
  --wire:       #5B8CA6;"""

if old not in content:
    raise SystemExit("PATCH FAILED: color block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched — --blue/--cyan now point to brass --seal (primary), --wire stays muted slate for live/pending only")
