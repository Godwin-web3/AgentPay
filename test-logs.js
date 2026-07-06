require('dotenv').config();
const { createPublicClient, http } = require('viem');

const client = createPublicClient({
  chain: {
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
    rpcUrls: { default: { http: [process.env.ARC_RPC] } }
  },
  transport: http(process.env.ARC_RPC)
});

const CONTRACT = '0x0747EEf0706327138c69792bF28Cd525089e4583';

async function main() {
  console.log('ARC_RPC:', process.env.ARC_RPC);
  console.log('Querying logs from block 0 to latest...');
  const logs = await client.getLogs({
    address: CONTRACT,
    fromBlock: 0n,
    toBlock: 'latest'
  });
  console.log(`Found ${logs.length} total logs`);
  console.log(JSON.stringify(logs.slice(0, 3), null, 2));
}

main().catch(err => console.error('ERROR:', err.message));
