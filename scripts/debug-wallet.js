require('dotenv').config();
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET
});

async function main() {
  console.log('AGENT_WALLET_ID:', process.env.AGENT_WALLET_ID);
  console.log('AGENT_ADDRESS (env):', process.env.AGENT_ADDRESS);
  
  const res = await client.getWallet({ id: process.env.AGENT_WALLET_ID });
  console.log('Real Address from Circle:', res.data.wallet.address);
}

main().catch(console.error);
