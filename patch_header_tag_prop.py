path = "frontend/src/App.tsx"

with open(path, "r") as f:
    lines = f.readlines()

target = '          userAddress={userAddress}\n'
found = False
new_lines = []

for i, line in enumerate(lines):
    new_lines.append(line)
    if not found and line.strip() == 'userAddress={userAddress}' and 271 <= i+1 <= 281:
        new_lines.append('          tag={tag}\n')
        found = True

if not found:
    print("LINE NOT FOUND near expected range. Aborting, no changes made.")
    exit(1)

with open(path, "w") as f:
    f.writelines(new_lines)

print("Patched: tag now passed to AgentHeader.")
