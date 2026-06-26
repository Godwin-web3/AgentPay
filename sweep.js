require('dotenv').config();
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET
});

const AGENT_ADDRESS = '0x80ea270e071b315AE70aC5DE00B05491FFA98580';
const AGENT_WALLET_ID = '1a61b02b-2dbb-513f-8da4-c6af7d95876e';

const WALLETS = [
  { label: 'test-user-1', walletId: 'b6cc13b9-d938-5090-90b8-f53404102981' },
  { label: 'test-provider-1', walletId: 'd583db81-28e4-5752-bcd8-19b2c85f240e' },
  { label: 'anonymous', walletId: '9893be47-2222-5c3a-b76b-319a1372484e' },
  { label: 'wallet-4', walletId: 'f5bd6cd9-9c4d-554d-aa4f-02c716e08b82' },
  { label: 'wallet-5', walletId: '91d66753-756d-51a1-92bf-4af5c1d54ef1' },
];

async function getBalance(walletId) {
  const response = await client.getWalletTokenBalance({ id: walletId });
  const balances = response.data?.tokenBalances || [];
  const erc20 = balances.find(b => b.token?.symbol === 'USDC' && b.token?.isNative === false);
  const native = balances.find(b => b.token?.symbol === 'USDC' && b.token?.isNative === true);
  const usdc = erc20 || native;
  if (!usdc) return '0';
  return usdc.amount;
}

async function sendUSDC(walletId, toAddress, amount) {
  const response = await client.createTransaction({
    walletId,
    tokenId: '15dc2b5d-0994-58b0-bf8c-3a0501148ee8',
    destinationAddress: toAddress,
    amounts: [amount],
    blockchain: 'ARC-TESTNET',
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });
  const txId = response.data.id;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: txId });
    const tx = check.data?.transaction;
    if (tx?.txHash) return tx.txHash;
    if (tx?.state === 'FAILED') throw new Error('Transaction failed');
  }
  return txId;
}

async function sweep() {
  console.log('Sweeping all USDC to agent wallet:', AGENT_ADDRESS);
  console.log('---');
  for (const wallet of WALLETS) {
    if (wallet.walletId === AGENT_WALLET_ID) continue;
    try {
      const balance = await getBalance(wallet.walletId);
      const amount = parseFloat(balance);
      if (amount < 0.01) {
        console.log(wallet.label + ': ' + balance + ' USDC - skipping');
        continue;
      }
      console.log(wallet.label + ': ' + balance + ' USDC - sending...');
      const txHash = await sendUSDC(wallet.walletId, AGENT_ADDRESS, balance);
      console.log(wallet.label + ': done - ' + txHash);
    } catch (err) {
      console.error(wallet.label + ': failed - ' + err.message);
    }
  }
  console.log('---');
  const agentBalance = await getBalance(AGENT_WALLET_ID);
  console.log('Agent wallet final balance: ' + agentBalance + ' USDC');
}

sweep().catch(console.error);
