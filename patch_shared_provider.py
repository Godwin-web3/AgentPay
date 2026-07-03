import re
import sys

path = 'src/server.js'
with open(path, 'r') as f:
    content = f.read()

old_import = "const { ethers } = require('ethers');"
if old_import not in content:
    print("ABORT: ethers import not found")
    sys.exit(1)
content = content.replace(
    old_import,
    old_import + "\nconst sharedProvider = require('./provider');",
    1
)

pattern = re.compile(
    r"const provider = new ethers\.JsonRpcProvider\(process\.env\.ARC_RPC,\s*\{\s*chainId:\s*5042002,\s*name:\s*[\"']arc-testnet[\"']\s*\}\);"
)
count = len(pattern.findall(content))
if count == 0:
    print("ABORT: no inline provider lines matched in server.js")
    sys.exit(1)

content = pattern.sub("const provider = sharedProvider;", content)

with open(path, 'w') as f:
    f.write(content)

print(f"OK: replaced {count} inline provider instantiations in server.js")
