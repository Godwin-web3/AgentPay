path = "frontend/src/views/Terminal.tsx"

with open(path, "r") as f:
    content = f.read()

old_import = "import { sendChat, executePay, generateRequestId, getPolicy, updatePolicy, getChatHistory, clearChatHistory, getVaultBalanceApi, createOnChainSchedule, hireAgent, decodePolicyError, depositToVault } from '../api'"
new_import = "import { sendChat, executePay, generateRequestId, getPolicy, updatePolicy, getChatHistory, clearChatHistory, getVaultBalanceApi, createOnChainSchedule, hireAgent, decodePolicyError, depositToVault, getJob } from '../api'"

if old_import not in content:
    print("IMPORT MARKER NOT FOUND. Aborting.")
    exit(1)

content = content.replace(old_import, new_import)

old_hire = """      } else if (prop.status === 'proposing_hire') {
        const hireRes = await hireAgent(prop.description, prop.budget, userId)
        res = { status: hireRes.success ? 'executed' : 'rejected', txHash: hireRes.fundTxHash || hireRes.createTxHash, explorer: 'https://testnet.arcscan.app/tx/' + (hireRes.fundTxHash || hireRes.createTxHash || ''), type: 'hire', to: prop.to, amount: prop.budget, reason: hireRes.reason || '' }
      }"""

new_hire = """      } else if (prop.status === 'proposing_hire') {
        const hireRes = await hireAgent(prop.description, prop.budget, userId)
        res = { status: hireRes.success ? 'executed' : 'rejected', txHash: hireRes.fundTxHash || hireRes.createTxHash, explorer: 'https://testnet.arcscan.app/tx/' + (hireRes.fundTxHash || hireRes.createTxHash || ''), type: 'hire', to: prop.to, amount: prop.budget, reason: hireRes.reason || '', jobId: hireRes.jobId }
        if (hireRes.success && hireRes.jobId) {
          const poll = async (attempt: number) => {
            if (attempt > 20) return
            try {
              const job = await getJob(hireRes.jobId, userId)
              if (job.deliverableText) {
                setTxResults(r => ({ ...r, [msgIdx]: { ...r[msgIdx], deliverableText: job.deliverableText } }))
                return
              }
            } catch {}
            setTimeout(() => poll(attempt + 1), 4000)
          }
          setTimeout(() => poll(0), 4000)
        }
      }"""

if old_hire not in content:
    print("HIRE BLOCK MARKER NOT FOUND. Aborting.")
    exit(1)

content = content.replace(old_hire, new_hire)

with open(path, "w") as f:
    f.write(content)

print("Patched: hire flow now polls for deliverableText and stores it in txResults.")
