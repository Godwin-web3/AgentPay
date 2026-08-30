require('dotenv').config();
const { randomBytes } = require('crypto');
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const entitySecret = randomBytes(32).toString('hex');
console.log('Generated secret:', entitySecret);

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret
});

client.getPublicKey().then(res => {
  console.log('✅ Entity secret works!');
  console.log('Add to .env: CIRCLE_ENTITY_SECRET=' + entitySecret);
}).catch(err => {
  console.log('❌ Failed:', err.message);
});
