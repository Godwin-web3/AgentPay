require('dotenv').config();
const readline = require('readline');
const { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat } = require('./agent');
const walletService = require('./walletService');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, a => resolve(a.trim())));
}

async function handleIntent(intent, walletId, userAddress) {
  switch (intent.action) {

    case 'pay': {
      console.log('\n💸 Payment requested: ' + intent.amount + ' USDC → ' + intent.to);
      const confirm = await ask('Confirm? (yes/no): ');
      if (confirm.toLowerCase() !== 'yes') {
        console.log('❌ Cancelled');
        break;
      }
      const result = await pay(walletId, intent.to, intent.amount, intent.reason, userAddress);
      if (result.success) console.log('✅ Sent | tx: ' + result.txHash);
      else console.log('❌ Blocked: ' + result.reason);
      break;
    }

    case 'fetch_and_pay': {
      console.log('\n🌐 Fetching: ' + intent.url + ' (max ' + intent.maxAmount + ' USDC)');
      const result = await fetchAndPay(walletId, intent.url, intent.maxAmount, intent.reason, userAddress);
      if (result.success) console.log('✅ Data:\n' + JSON.stringify(result.data, null, 2));
      else console.log('❌ Failed: ' + result.reason);
      break;
    }

    case 'balance': {
      const bal = await getBalance(walletId);
      console.log('\n💰 USDC Balance: ' + bal);
      break;
    }

    case 'history': {
      const history = await getUnifiedHistory(userAddress, 10);
      console.log('\n📜 Recent Activity:');
      history.forEach(h => {
        console.log('  ' + new Date(h.timestamp).toLocaleTimeString() + ' | ' + h.type + ' | ' + h.amount + ' USDC | ' + (h.to || h.reason || ''));
      });
      break;
    }

    case 'policy': {
      const summary = await getSummary();
      console.log('\n🛡️  Policy:\n' + JSON.stringify(summary, null, 2));
      break;
    }

    case 'chat':
    default:
      console.log('\n🤖 ' + intent.message);
      break;
  }
}

async function startLoop(walletId, userAddress) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🛡️  AgentPay — Autonomous USDC Agent on Arc');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const address = await walletService.getWalletAddress(walletId);
  const balance = await walletService.getWalletBalance(walletId);
  console.log('👛 Wallet:  ' + address);
  console.log('💰 Balance: ' + balance + ' USDC');
  console.log('Type your goal or instruction. Ctrl+C to exit.\n');

  const loop = async () => {
    const input = await ask('> ');
    if (!input) return loop();

    try {
      const intent = await chat(input, walletId, userAddress);
      await handleIntent(intent, walletId, userAddress);
    } catch (err) {
      console.error('❌ Error: ' + err.message);
    }

    loop();
  };

  loop();
}

module.exports = { startLoop };
