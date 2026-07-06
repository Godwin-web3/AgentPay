require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const ABI = ['function tokenURI(uint256) view returns (string)', 'function ownerOf(uint256) view returns (address)'];
const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
const contract = new ethers.Contract(REGISTRY, ABI, provider);

const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];
const MAX_ID = 845496;
const SAMPLE_SIZE = 500;
const STEP = Math.floor(MAX_ID / SAMPLE_SIZE);

async function fetchIPFS(cid) {
  for (const gw of GATEWAYS) {
    try {
      const res = await fetch(gw + cid, { signal: AbortSignal.timeout(6000) });
      if (res.ok) return res.json();
    } catch (e) {}
  }
  throw new Error('all gateways failed');
}

async function resolveMeta(uri) {
  if (!uri) throw new Error('empty uri');
  if (uri.startsWith('data:application/json,')) {
    return JSON.parse(decodeURIComponent(uri.replace('data:application/json,', '')));
  }
  if (uri.startsWith('data:application/json;base64,')) {
    return JSON.parse(Buffer.from(uri.replace('data:application/json;base64,', ''), 'base64').toString());
  }
  if (uri.startsWith('ipfs://')) return fetchIPFS(uri.replace('ipfs://', ''));
  const res = await fetch(uri, { signal: AbortSignal.timeout(6000) });
  return res.json();
}

async function checkAgent(id) {
  try {
    const uri = await contract.tokenURI(id);
    const meta = await resolveMeta(uri);
    if (meta.name === 'My AI Agent v1.0') return null;
    if (meta.name || meta.capabilities || meta.attributes) {
      const owner = await contract.ownerOf(id).catch(() => null);
      return { id, owner, name: meta.name || null, description: meta.description || null, attributes: meta.attributes || [] };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function main() {
  const ids = [];
  for (let i = 1; i <= MAX_ID; i += STEP) ids.push(i);

  const results = [];
  const CONCURRENCY = 10;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(checkAgent));
    results.push(...batchResults.filter(Boolean));
    console.log(`Scanned ${i + batch.length}/${ids.length}, found ${results.length} real agents so far`);
  }

  fs.writeFileSync('registered_agents.json', JSON.stringify(results, null, 2));
  console.log(`\nDone. ${results.length} real registered agents saved to registered_agents.json`);
}

main().catch(console.error);
