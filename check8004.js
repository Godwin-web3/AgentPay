require('dotenv').config();

async function fetchIPFS(cid) {
  const url = `https://ipfs.io/ipfs/${cid}`;
  const res = await fetch(url);
  return res.json();
}

async function main() {
  const cids = [
    'bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei',
    'bafkreid2mxclj5xbcculgn64lqvdaahymag7s7il3ges7zoppxiqruqbgm',
  ];

  for (const cid of cids) {
    console.log('\n--- CID:', cid);
    try {
      const data = await fetchIPFS(cid);
      console.log(JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('Failed:', e.message);
    }
  }
}

main().catch(console.error);
