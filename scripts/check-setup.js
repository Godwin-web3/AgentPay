// Preflight check for local/hosted setup. Validates that the env vars in
// .env.example are present AND actually work (live RPC/Groq/Circle calls),
// instead of failing deep inside a chat request the first time something
// is missing or mistyped.
//
// Run with: node scripts/check-setup.js  (or: npm run setup:check)

require('dotenv').config();
const { ethers } = require('ethers');

const results = [];
function record(name, ok, detail, fatal = true) {
  results.push({ name, ok, detail, fatal });
}

function envPresent(name) {
  return Boolean((process.env[name] || '').trim());
}

async function checkRpc() {
  const rpc = process.env.ARC_RPC;
  if (!rpc) return record('ARC_RPC', false, 'missing from .env');
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const network = await provider.getNetwork();
    const expected = Number(process.env.ARC_CHAIN_ID || 5042002);
    const actual = Number(network.chainId);
    if (actual !== expected) {
      return record('ARC_RPC', false, `connected, but chain ID ${actual} != ARC_CHAIN_ID ${expected}`);
    }
    record('ARC_RPC', true, `reachable, chain ID ${actual}`);
    return provider;
  } catch (err) {
    record('ARC_RPC', false, err.message);
    return null;
  }
}

function checkAgentKey() {
  const key = process.env.PRIVATE_KEY;
  if (!key) return record('PRIVATE_KEY', false, 'missing from .env');
  try {
    const wallet = new ethers.Wallet(key);
    const configured = (process.env.AGENT_ADDRESS || '').toLowerCase();
    if (configured && configured !== wallet.address.toLowerCase()) {
      return record('PRIVATE_KEY', false, `derives ${wallet.address}, but AGENT_ADDRESS=${process.env.AGENT_ADDRESS} does not match`);
    }
    record('PRIVATE_KEY', true, `derives ${wallet.address}`);
  } catch (err) {
    record('PRIVATE_KEY', false, `not a valid private key: ${err.message}`);
  }
}

async function checkVaultFactory(provider) {
  const address = process.env.VAULT_FACTORY_ADDRESS;
  if (!address) return record('VAULT_FACTORY_ADDRESS', false, 'missing from .env');
  if (!provider) return record('VAULT_FACTORY_ADDRESS', false, 'skipped — ARC_RPC is not reachable');
  try {
    const code = await provider.getCode(address);
    if (!code || code === '0x') {
      return record('VAULT_FACTORY_ADDRESS', false, `no contract code at ${address} on this RPC`);
    }
    record('VAULT_FACTORY_ADDRESS', true, `contract deployed at ${address}`);
  } catch (err) {
    record('VAULT_FACTORY_ADDRESS', false, err.message);
  }
}

async function checkGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return record('GROQ_API_KEY', false, 'missing from .env');
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return record('GROQ_API_KEY', false, `Groq responded HTTP ${res.status}`);
    record('GROQ_API_KEY', true, `connected (model: ${process.env.GROQ_MODEL || 'default'})`);
  } catch (err) {
    record('GROQ_API_KEY', false, err.message);
  }
}

async function checkCircle() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    return record('Circle credentials', false, 'CIRCLE_API_KEY and/or CIRCLE_ENTITY_SECRET missing from .env');
  }
  let client;
  try {
    const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
    client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  } catch (err) {
    return record('Circle credentials', false, `client init failed: ${err.message}`);
  }

  const agentWalletId = process.env.AGENT_WALLET_ID;
  if (!agentWalletId) {
    return record('Circle credentials', false, 'AGENT_WALLET_ID missing from .env (needed to verify the key actually works)');
  }
  try {
    const res = await client.getWallet({ id: agentWalletId });
    const wallet = res.data?.wallet;
    if (!wallet) return record('Circle credentials', false, 'AGENT_WALLET_ID did not resolve to a wallet');
    record('Circle credentials', true, `agent wallet ${wallet.address} on ${wallet.blockchain} (${wallet.state})`);
  } catch (err) {
    record('Circle credentials', false, err.message);
  }
}

function checkAppApiKey() {
  const key = process.env.APP_API_KEY;
  if (!key) return record('APP_API_KEY', false, 'missing — required for Worker<->Render auth (generate with: openssl rand -hex 32)');
  if (key.length < 32) return record('APP_API_KEY', false, 'set, but shorter than the recommended 32+ chars');
  record('APP_API_KEY', true, 'set');
}

function checkOptional() {
  const optional = [
    ['DECISION_LOG_ADDRESS', 'decision provenance (npm test / scripts/deployDecisionLog.js)'],
    ['POOL_VAULT_ADDRESS', 'shared pools feature (scripts/deployPoolVault.js)'],
    ['MARKETPLACE_API_KEY', 'two-agent marketplace daemon (scripts/marketplace-agent.js)'],
  ];
  for (const [name, feature] of optional) {
    record(name, envPresent(name), envPresent(name) ? 'set' : `not set — ${feature} will be unavailable`, false);
  }
}

async function main() {
  const provider = await checkRpc();
  checkAgentKey();
  await checkVaultFactory(provider);
  await checkGroq();
  await checkCircle();
  checkAppApiKey();
  checkOptional();

  console.log('\nAgentPay setup check\n');
  for (const r of results) {
    const status = r.ok ? 'PASS' : (r.fatal ? 'FAIL' : 'WARN');
    console.log(`${status}  ${r.name}: ${r.detail}`);
  }

  const hasFailure = results.some((r) => !r.ok && r.fatal);
  if (hasFailure) {
    console.log('\nFix the FAILs above, then re-run: npm run setup:check');
    process.exitCode = 1;
  } else {
    console.log('\nCore setup is ready. Run: npm start');
  }
}

main().catch((err) => {
  console.error('Setup check crashed:', err);
  process.exitCode = 1;
});
