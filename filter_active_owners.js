require('dotenv').config();
const { createPublicClient, http } = require('viem');
const fs = require('fs');

const CONTRACT = '0x0747EEf0706327138c69792bF28Cd525089e4583';
const abi = [{
  type: 'function', name: 'getJob', stateMutability: 'view',
  inputs: [{ name: 'jobId', type: 'uint256' }],
  outputs: [{
    type: 'tuple',
    components: [
      { name: 'id', type: 'uint256' },
      { name: 'client', type: 'address' },
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'description', type: 'string' },
      { name: 'budget', type: 'uint256' },
      { name: 'expiredAt', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'hook', type: 'address' }
    ]
  }]
}];

const client = createPublicClient({
  chain: { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: [process.env.ARC_RPC] } } },
  transport: http(process.env.ARC_RPC)
});

const STATUS = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];
const MAX_ID = 148822;
const STEP = 3;

async function main() {
  const activeAddresses = {};
  const ids = [];
  for (let i = 1; i <= MAX_ID; i += STEP) ids.push(i);

  const CONCURRENCY = 15;
  let scanned = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (id) => {
      try {
        const t = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000));
        const job = await Promise.race([
          client.readContract({ address: CONTRACT, abi, functionName: 'getJob', args: [BigInt(id)] }),
          t
        ]);
        if (job.client === '0x0000000000000000000000000000000000000000') return;
        const p = job.provider.toLowerCase();
        if (p !== '0x0000000000000000000000000000000000000000') {
          if (!activeAddresses[p]) activeAddresses[p] = { jobCount: 0, completed: 0 };
          activeAddresses[p].jobCount++;
          if (STATUS[job.status] === 'Completed') activeAddresses[p].completed++;
        }
      } catch (e) {}
    }));
    scanned += batch.length;
    if (scanned % 1000 === 0) console.log(`Scanned ${scanned}/${ids.length}, ${Object.keys(activeAddresses).length} active providers so far`);
  }

  fs.writeFileSync('active_providers_full.json', JSON.stringify(activeAddresses, null, 2));
  console.log(`\nDone. ${Object.keys(activeAddresses).length} unique active provider addresses found.`);
}

main().catch(console.error);
