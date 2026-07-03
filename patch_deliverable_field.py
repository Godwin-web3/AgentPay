path = "src/spendStore.js"

with open(path, "r") as f:
    content = f.read()

old_sig = "async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, scheduleId, token, isScheduled, triggerProof, type }) {"
new_sig = "async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, scheduleId, token, isScheduled, triggerProof, type, deliverableText }) {"

if old_sig not in content:
    print("SIGNATURE MARKER NOT FOUND. Aborting.")
    exit(1)

content = content.replace(old_sig, new_sig)

old_field = "    triggerProof: triggerProof || null,"
new_field = "    triggerProof: triggerProof || null,\n    deliverableText: deliverableText || null,"

if old_field not in content:
    print("FIELD MARKER NOT FOUND. Aborting.")
    exit(1)

content = content.replace(old_field, new_field)

with open(path, "w") as f:
    f.write(content)

print("Patched: appendSpend now accepts and stores deliverableText.")
