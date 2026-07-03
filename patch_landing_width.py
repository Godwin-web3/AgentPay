path = "frontend/src/views/Landing.tsx"

with open(path, "r") as f:
    content = f.read()

old_targets = [
    "maxWidth: 600, margin: '0 auto'",
]

count = 0
for old in old_targets:
    n = content.count(old)
    if n:
        new = "maxWidth: 720, width: '100%', margin: '0 auto'"
        content = content.replace(old, new)
        count += n
        print(f"Replaced {n}x: {old}")
    else:
        print(f"Not found: {old}")

if count == 0:
    print("Nothing changed.")
    exit(1)

with open(path, "w") as f:
    f.write(content)

print(f"Done. {count} replacements.")
