path = "frontend/src/views/Landing.tsx"

with open(path, "r") as f:
    content = f.read()

count = 0

old_grid = "gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'"
new_grid = "gridTemplateColumns: window.innerWidth < 500 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))'"
if old_grid in content:
    content = content.replace(old_grid, new_grid)
    count += 1
    print("Grid set to 2x2 on mobile.")
else:
    print("Grid marker not found.")

old_label = "fontSize: 9, letterSpacing: 3, fontFamily: 'var(--font-mono)', marginBottom: 8, overflowWrap: 'break-word'"
new_label = "fontSize: 9, letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 8, whiteSpace: 'nowrap'"
if old_label in content:
    content = content.replace(old_label, new_label)
    count += 1
    print("Label letterSpacing reduced, wrapping removed.")
else:
    print("Label marker not found.")

if count == 0:
    print("Nothing changed.")
    exit(1)

with open(path, "w") as f:
    f.write(content)

print(f"Done. {count} fixes applied.")
