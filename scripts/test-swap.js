require('dotenv').config();
const { ethers, getAddress } = require('ethers');
const { estimateSwap, executeSwap, SOMNIA_ROUTER } = require('../src/dex');

// PING Token on Shannon Testnet
const PING = getAddress("0x4296495d4D3A766f9578278788Fe7640f0C034b7");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('🧪 Testing Swap on Somnia Shannon...');
  console.log('👛 Wallet: ' + wallet.address);
  console.log('🤖 Router: ' + SOMNIA_ROUTER);

  const amount = "0.01";
  console.log(`\n1. Estimating Swap: ${amount} STT -> PING...`);
  const est = await estimateSwap(wallet, 'STT', PING, amount);
  
  if (est.success) {
    console.log('✅ Estimation successful!');
    console.log('   Expected PING: ' + est.expectedOut);
    console.log('   Est. Gas Fee:  ' + est.estGasCost + ' STT');
    
    console.log(`\n2. Executing Swap: ${amount} STT -> PING...`);
    const res = await executeSwap(wallet, 'STT', PING, amount);
    
    if (res.success) {
      console.log('✅ Swap successful!');
      console.log('   TX: ' + res.txHash);
      console.log('   🔗 https://shannon-explorer.somnia.network/tx/' + res.txHash);
    } else {
      console.log('❌ Swap failed: ' + res.error);
    }
  } else {
    console.log('❌ Estimation failed: ' + est.error);
  }
}

main().catch(console.error);
