path = "src/server.js"

with open(path, "r") as f:
    content = f.read()

old = """  const scanIds = [];
  for (let i = 137000; i <= 137050; i++) scanIds.push(i);
  for (let i = 1; i <= 20; i++) scanIds.push(i);"""

new = """  const scanIds = [];
  for (let i = 146500; i <= 147200; i++) scanIds.push(i);
  for (let i = 1; i <= 20; i++) scanIds.push(i);"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: scan range now covers current job IDs plus headroom.")
