require('dotenv').config();
const { randomBytes } = require('crypto');
const { registerEntitySecretCiphertext } = require('@circle-fin/developer-controlled-wallets');

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = randomBytes(32).toString('hex');

registerEntitySecretCiphertext({ apiKey, entitySecret })
  .then(() => {
    console.log('✅ Entity secret registered');
    console.log('CIRCLE_ENTITY_SECRET=' + entitySecret);
  })
  .catch(console.error);
