require('dotenv').config();
const { createPublicClient, http, parseAbiItem } = require('viem');
const fs = require('fs');

const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const client = createPublicClient({
  chain: { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: [process.env.ARC_RPC] } } },
  transport: http(process.env.ARC_RPC)
});

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');
const ZERO = '0x0000000000000000000000000000000000000000';
const CHUNK = 10000n;

async function main() {
  const latest = await client.getBlockNumber();
  const START_BLOCK = 0n;
  let mints = [];
  let scanned = 0n;
  const total = latest - START_BLOCK;

  for (let from = START_BLOCK; from <= latest; from += CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    try {
      const logs = await client.getLogs({
        address: REGISTRY,
        event: transferEvent,
        args: { from: ZERO },
        fromBlock: from,
        toBlock: to
      });
      mints = mints.concat(logs.map(l => ({ id: Number(l.args.tokenId), owner: l.args.to })));
    } catch (e) {
      console.error('chunk failed', from.toString(), '-', to.toString(), e.message);
    }
    scanned += (to - from);
    console.log(`Progress: block ${to} / ${latest}, ${mints.length} mints found so far`);
  }

  fs.writeFileSync('all_minted_tokens.json', JSON.stringify(mints, null, 2));
  console.log(`\nDone. ${mints.length} total mints found across full contract history.`);
}

main().catch(console.error);
