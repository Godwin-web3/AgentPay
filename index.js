const { setGlobalDispatcher, Agent } = require('undici'); setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const { startServer } = require('./src/server');
const { startLoop } = require('./src/loop');
const walletService = require('./src/walletService');
const { mountIfNeeded } = require('./src/startup');

async function main() {
  // The Express app is created inside src/server.js. If it is exported in a future
  // change, call mountIfNeeded(app) here before startServer. For now the patch
  // or the two-line insert in server.js remains the reliable path.
  await startServer();

  // Advances any in-flight intent-solver plans (src/intentEngine.js) whose
  // next step is blocked on a wait_for_condition/check_balance primitive.
  require('./src/intentEngine').startTicker();
  require('./src/poolEngine').startTicker();

  // Dev mode: start CLI loop with a default wallet
  if (process.env.DEV_USER_ID) {
    const wallet = await walletService.createUserWallet(process.env.DEV_USER_ID);
    console.log('🧪 Dev wallet:', wallet.address);
    await startLoop(wallet.walletId, process.env.DEV_USER_ID);
  }
}

main().catch(console.error);
