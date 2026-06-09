const { init, registerAgent, setupEscrowPolicy } = require('./src/agent');
const { startLoop } = require('./src/loop');
const { startServer } = require('./src/server');

async function main() {
  const { address, wallet } = await init();
  await startServer(wallet);
  await registerAgent();
  await setupEscrowPolicy();
  await startLoop(address);
}

main().catch(console.error);
