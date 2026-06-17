require('dotenv').config();
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
const fs = require('fs');
const path = require('path');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET
});

async function main() {
  console.log('🔄 Starting Agent Migration to Smart Contract Account (SCA)...');

  // 1. Ensure Wallet Set
  let walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) {
    console.log('📁 Creating new Wallet Set...');
    const wsRes = await client.createWalletSet({ name: 'AgentPay-SCA-Set' });
    walletSetId = wsRes.data.walletSet.id;
    console.log(`✅ Created Wallet Set: ${walletSetId}`);
  }

  // 2. Create SCA Wallet for the Agent
  console.log('💳 Provisioning new SCA Wallet on Arc Testnet...');
  const walletRes = await client.createWallets({
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId: walletSetId,
    accountType: 'SCA'
  });

  const agentWallet = walletRes.data.wallets[0];
  console.log('✨ New SCA Agent Wallet Created!');
  console.log(`📍 Address: ${agentWallet.address}`);
  console.log(`🆔 Wallet ID: ${agentWallet.id}`);

  // 3. Update .env or output instructions
  console.log('\n--- 🛠️  Action Required ---');
  console.log('Update your .env file with these new values:');
  console.log(`AGENT_WALLET_ID=${agentWallet.id}`);
  console.log(`AGENT_ADDRESS=${agentWallet.address}`);
  console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
  
  // 4. Register on Arc Identity Registry (ERC-8004)
  console.log('\n🚀 Next Step: Registering your identity on Arc...');
  console.log('This SCA can now be registered as an official Arc Agent.');
  
  // Save to a temp file for other scripts to use
  const migrationData = {
    agentWalletId: agentWallet.id,
    agentAddress: agentWallet.address,
    walletSetId: walletSetId,
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../data/agent-sca-migration.json'), 
    JSON.stringify(migrationData, null, 2)
  );
  
  console.log('\n✅ Migration data saved to data/agent-sca-migration.json');
}

main().catch(console.error);
