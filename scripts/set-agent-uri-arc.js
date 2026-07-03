require('dotenv').config();
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET
});

const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

async function main() {
  console.log('🔗 Updating Agent URI on Arc (ERC-8004)...');

  const walletId = process.env.AGENT_WALLET_ID;
  const agentId = process.argv[2] || '722871';
  const newURI = 'ipfs://bafkreig3rfgabd577kbnhzgzkpuc6qrhmqlz3zklh4pcbqnyod73a7feaq';

  console.log(`📡 Sending setAgentURI(${agentId}) from SCA: ${process.env.AGENT_ADDRESS}`);

  try {
    const response = await client.createContractExecutionTransaction({
      walletId: walletId,
      contractAddress: IDENTITY_REGISTRY,
      blockchain: 'ARC-TESTNET',
      abiFunctionSignature: 'setAgentURI(uint256,string)',
      abiParameters: [agentId, newURI],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
    });

    const txId = response.data.id;
    console.log(`⏳ Transaction created (ID: ${txId}). Polling for hash...`);

    let txHash = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const check = await client.getTransaction({ id: txId });
      const tx = check.data?.transaction;

      if (tx?.txHash) {
        txHash = tx.txHash;
        break;
      }

      if (tx?.state === 'FAILED') {
        throw new Error(`Transaction failed: ${tx.errorReason || 'Unknown error'}`);
      }

      process.stdout.write('.');
    }

    if (txHash) {
      console.log(`\n✨ Agent URI updated!`);
      console.log(`🔗 Tx Hash: ${txHash}`);
      console.log(`🌐 View on Explorer: https://testnet.arcscan.app/tx/${txHash}`);
    } else {
      console.log('\n⚠️  Transaction is still pending. Check Circle console for details.');
    }

  } catch (error) {
    console.error('\n❌ setAgentURI failed:', error.message);
  }
}

main().catch(console.error);
