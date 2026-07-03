path = "frontend/src/views/Landing.tsx"

with open(path, "r") as f:
    content = f.read()

replacements = [
    ("'#4fdbc810'", "'#D9A44110'"),
    ("'#4fdbc830'", "'#D9A44130'"),
    ("border: '1px solid #4fdbc8',", "border: '1px solid var(--seal)',"),
]

count = 0
for old, new in replacements:
    n = content.count(old)
    if n:
        content = content.replace(old, new)
        count += n
        print(f"Replaced {n}x: {old} -> {new}")
    else:
        print(f"Not found, skipped: {old}")

if count == 0:
    print("Nothing changed. Aborting write.")
    exit(1)

with open(path, "w") as f:
    f.write(content)

print(f"Done. {count} total replacements.")
