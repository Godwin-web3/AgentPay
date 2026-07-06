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
const MAX_ID = 147779;
const SAMPLE_SIZE = 800;
const STEP = Math.floor(MAX_ID / SAMPLE_SIZE);

async function main() {
  const providerCounts = {};
  const providerCompleted = {};
  const ids = [];
  for (let i = 1; i <= MAX_ID; i += STEP) ids.push(i);

  const CONCURRENCY = 15;
  let scanned = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (id) => {
      try {
        const job = await client.readContract({ address: CONTRACT, abi, functionName: 'getJob', args: [BigInt(id)] });
        if (job.client === '0x0000000000000000000000000000000000000000') return;
        const provider = job.provider;
        if (provider === '0x0000000000000000000000000000000000000000') return;
        providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        if (STATUS[job.status] === 'Completed') {
          providerCompleted[provider] = (providerCompleted[provider] || 0) + 1;
        }
      } catch (e) {}
    }));
    scanned += batch.length;
    if (scanned % 80 === 0) console.log(`Scanned ${scanned}/${ids.length}`);
  }

  const ranked = Object.entries(providerCounts)
    .map(([address, jobCount]) => ({
      address,
      jobCount,
      completed: providerCompleted[address] || 0,
      completionRate: ((providerCompleted[address] || 0) / jobCount * 100).toFixed(0) + '%'
    }))
    .sort((a, b) => b.jobCount - a.jobCount);

  fs.writeFileSync('top_providers.json', JSON.stringify(ranked, null, 2));
  console.log('\nDone.', ranked.length, 'unique providers found.');
  console.log('Top 15:', JSON.stringify(ranked.slice(0, 15), null, 2));
}

main().catch(console.error);
