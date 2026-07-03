require('dotenv').config();
const { createPublicClient, http, decodeEventLog } = require('viem');

const client = createPublicClient({
  chain: { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: [process.env.ARC_RPC] } } },
  transport: http(process.env.ARC_RPC)
});

const CONTRACT = '0x0747EEf0706327138c69792bF28Cd525089e4583';
const STATUS = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];

const abi = [
  {
    type: 'function', name: 'getJob', stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'id', type: 'uint256' },
      { name: 'client', type: 'address' },
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'description', type: 'string' },
      { name: 'budget', type: 'uint256' },
      { name: 'expiredAt', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'hook', type: 'address' }
    ]}]
  }
];

async function main() {
  // Scan job IDs -- your last known job was 137036
  // Try a range around it and some recent ones
  const idsToCheck = [];
  for (let i = 137030; i <= 137050; i++) idsToCheck.push(i);
  for (let i = 1; i <= 10; i++) idsToCheck.push(i);

  const jobs = [];
  for (const id of idsToCheck) {
    try {
      const job = await client.readContract({ address: CONTRACT, abi, functionName: 'getJob', args: [BigInt(id)] });
      if (job.client !== '0x0000000000000000000000000000000000000000') {
        jobs.push({
          id: id,
          client: job.client,
          provider: job.provider,
          description: job.description.slice(0, 60),
          budget: (Number(job.budget) / 1e6).toFixed(2),
          status: STATUS[Number(job.status)]
        });
      }
    } catch { continue; }
  }

  console.log('Jobs found:', jobs.length);
  console.log(JSON.stringify(jobs, null, 2));
}

main().catch(console.error);
