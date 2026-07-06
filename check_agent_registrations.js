require('dotenv').config();
const { ethers } = require('ethers');

const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const ABI = ['function tokenURI(uint256) view returns (string)'];
const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
const contract = new ethers.Contract(REGISTRY, ABI, provider);

const sampleIds = [];
for (let i = 0; i < 25; i++) sampleIds.push(722871 + i * 100);
for (let i = 0; i < 25; i++) sampleIds.push(845496 - i * 100);

const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];

async function fetchIPFS(cid) {
  for (const gw of GATEWAYS) {
    try {
      const res = await fetch(gw + cid, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return res.json();
    } catch (e) {}
  }
  throw new Error('all gateways failed');
}

async function resolveMeta(uri) {
  if (uri.startsWith('data:application/json,')) {
    const decoded = decodeURIComponent(uri.replace('data:application/json,', ''));
    return JSON.parse(decoded);
  }
  if (uri.startsWith('data:application/json;base64,')) {
    const b64 = uri.replace('data:application/json;base64,', '');
    return JSON.parse(Buffer.from(b64, 'base64').toString());
  }
  if (uri.startsWith('ipfs://')) {
    return fetchIPFS(uri.replace('ipfs://', ''));
  }
  const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
  return res.json();
}

async function main() {
  let real = 0, placeholder = 0, broken = 0;
  for (const id of sampleIds) {
    try {
      const uri = await contract.tokenURI(id);
      const meta = await resolveMeta(uri);
      if (meta.name === 'My AI Agent v1.0') {
        placeholder++;
        console.log(id, 'PLACEHOLDER');
      } else if (meta.name || meta.capabilities || meta.attributes) {
        real++;
        console.log(id, 'REAL:', meta.name);
      } else {
        broken++;
        console.log(id, 'UNKNOWN SHAPE');
      }
    } catch (e) {
      broken++;
      console.log(id, 'BROKEN:', e.message);
    }
  }
  console.log('\n--- Summary ---');
  console.log('Real:', real);
  console.log('Placeholder:', placeholder);
  console.log('Broken/empty:', broken);
}

main().catch(console.error);
