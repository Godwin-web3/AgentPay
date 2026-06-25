const { setGlobalDispatcher, Agent } = require('undici'); setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const { startServer } = require('./src/server');
const { startLoop } = require('./src/loop');
const walletService = require('./src/walletService');

async function main() {
  await startServer();

  // Dev mode: start CLI loop with a default wallet
  if (process.env.DEV_USER_ID) {
    const wallet = await walletService.createUserWallet(process.env.DEV_USER_ID);
    console.log('🧪 Dev wallet:', wallet.address);
    await startLoop(wallet.walletId, process.env.DEV_USER_ID);
  }
}

main().catch(console.error);
