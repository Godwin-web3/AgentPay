path = "frontend/src/views/Landing.tsx"

with open(path, "r") as f:
    content = f.read()

count = 0

old_grid = "gridTemplateColumns: 'repeat(4, 1fr)'"
new_grid = "gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'"
if old_grid in content:
    content = content.replace(old_grid, new_grid)
    count += 1
    print("Grid columns fixed.")
else:
    print("Grid marker not found.")

old_label = "fontSize: 9, letterSpacing: 3, fontFamily: 'var(--font-mono)', marginBottom: 8"
new_label = "fontSize: 9, letterSpacing: 3, fontFamily: 'var(--font-mono)', marginBottom: 8, overflowWrap: 'break-word'"
if old_label in content:
    content = content.replace(old_label, new_label)
    count += 1
    print("Label wrap fixed.")
else:
    print("Label marker not found.")

if count == 0:
    print("Nothing changed.")
    exit(1)

with open(path, "w") as f:
    f.write(content)

print(f"Done. {count} fixes applied.")
