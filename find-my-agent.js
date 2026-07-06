require('dotenv').config();

const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const MY_ADDRESS = '0x80ea270e071b315AE70aC5DE00B05491FFA98580'.toLowerCase();
const TARGET_IDS = ['722871', '722856'];
const MAX_PAGES = 40;

async function findMyAgent() {
  let url = `https://testnet.arcscan.app/api/v2/addresses/${REGISTRY}/logs`;
  let pages = 0;
  const found = [];

  while (url && pages < MAX_PAGES) {
    const res = await fetch(url);
    const data = await res.json();

    for (const item of data.items || []) {
      const call = item.decoded?.method_call || '';
      if (call.startsWith('Registered(')) {
        const params = item.decoded.parameters;
        const agentId = params.find(p => p.name === 'agentId')?.value;
        const owner = params.find(p => p.name === 'owner')?.value || '';
        if (TARGET_IDS.includes(agentId) || owner.toLowerCase() === MY_ADDRESS) {
          found.push({ agentId, owner, agentURI: params.find(p => p.name === 'agentURI')?.value });
        }
      }
    }

    pages++;
    console.log(`Page ${pages}, found so far: ${found.length}`);
    if (found.length > 0) break;

    if (data.next_page_params) {
      const qs = new URLSearchParams(data.next_page_params).toString();
      url = `https://testnet.arcscan.app/api/v2/addresses/${REGISTRY}/logs?${qs}`;
    } else {
      url = null;
    }
  }

  console.log(JSON.stringify(found, null, 2));
}

findMyAgent().catch(err => console.error('ERROR:', err.message));
