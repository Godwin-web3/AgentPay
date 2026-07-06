require('dotenv').config();

const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const MAX_PAGES = 5;
const MAX_AGENTS = 30;

async function fetchAgentDirectory() {
  const agents = [];
  let url = `https://testnet.arcscan.app/api/v2/addresses/${REGISTRY}/logs`;
  let pages = 0;

  while (url && pages < MAX_PAGES && agents.length < MAX_AGENTS) {
    const res = await fetch(url);
    const data = await res.json();

    for (const item of data.items || []) {
      const call = item.decoded?.method_call || '';
      if (call.startsWith('Registered(')) {
        const params = item.decoded.parameters;
        agents.push({
          agentId: params.find(p => p.name === 'agentId')?.value,
          agentURI: params.find(p => p.name === 'agentURI')?.value,
          owner: params.find(p => p.name === 'owner')?.value,
          blockTimestamp: item.block_timestamp
        });
      }
    }

    pages++;
    if (data.next_page_params) {
      const qs = new URLSearchParams(data.next_page_params).toString();
      url = `https://testnet.arcscan.app/api/v2/addresses/${REGISTRY}/logs?${qs}`;
    } else {
      url = null;
    }
  }

  return agents.slice(0, MAX_AGENTS);
}

fetchAgentDirectory().then(agents => {
  console.log(`Found ${agents.length} registered agents`);
  console.log(JSON.stringify(agents, null, 2));
}).catch(err => console.error('ERROR:', err.message));
