path = "frontend/src/views/Landing.tsx"

with open(path, "r") as f:
    content = f.read()

replacements = [
    ("'#4fdbc8'", "'var(--seal)'"),
    ("#0A0A0A", "#0B0D10"),
    ("color: '#fff'", "color: 'var(--text)'"),
    ("fontFamily: 'monospace'", "fontFamily: 'var(--font-mono)'"),
    ("fontFamily: 'sans-serif'", "fontFamily: 'var(--font-body)'"),
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

print(f"Done. {count} total replacements in {path}.")
