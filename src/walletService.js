require('dotenv').config();
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET
});

let walletSetId = process.env.CIRCLE_WALLET_SET_ID || null;

async function ensureWalletSet() {
  if (walletSetId) return walletSetId;
  const res = await client.createWalletSet({ name: 'AgentPayUsers' });
  walletSetId = res.data?.walletSet?.id;
  console.log('✅ WalletSet created:', walletSetId);
  console.log('👉 Add to .env: CIRCLE_WALLET_SET_ID=' + walletSetId);
  return walletSetId;
}

async function createUserWallet(userId) {
  const setId = await ensureWalletSet();
  const response = await client.createWallets({
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId: setId,
    accountType: 'SCA'
  });
  const wallet = response.data.wallets[0];
  return { walletId: wallet.id, address: wallet.address };
}

async function getWalletBalance(walletId) {
  const response = await client.getWalletTokenBalance({ id: walletId });
  const balances = response.data?.tokenBalances || [];
  // Prefer ERC20 USDC (6 decimals), fall back to native
  const erc20 = balances.find(b => b.token?.symbol === 'USDC' && b.token?.isNative === false);
  const native = balances.find(b => b.token?.symbol === 'USDC' && b.token?.isNative === true);
  const usdc = erc20 || native;
  if (!usdc) return '0.00';
  // ERC20 has 6 decimals, native has 18
  return parseFloat(usdc.amount).toFixed(2);
}

async function getWalletAddress(walletId) {
  const response = await client.getWallet({ id: walletId });
  return response.data.wallet.address;
}

async function sendUSDC(walletId, toAddress, amountUSDC) {
  // Native USDC on Arc — pass human-readable amount
  const amountUnits = parseFloat(amountUSDC).toString();
  const response = await client.createTransaction({
    walletId,
    tokenId: '15dc2b5d-0994-58b0-bf8c-3a0501148ee8',
    destinationAddress: toAddress,
    amounts: [amountUnits],
    blockchain: 'ARC-TESTNET',
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });
  const txId = response.data.id;
  // Poll for onchain hash
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: txId });
    const tx = check.data?.transaction;
    if (tx?.txHash) return tx.txHash;
    if (tx?.state === 'FAILED') throw new Error('Transaction failed on chain');
  }
  return txId; // fallback to Circle ID if polling times out
}

module.exports = { createUserWallet, getWalletBalance, getWalletAddress, sendUSDC };

async function approveAndDepositToVault(walletId, vaultAddress, amountUSDC) {
  const usdcAddress = process.env.USDC_CONTRACT;
  const { toUnits } = require('../utils/usdc');
  // Use the shared decimal config so deposit and execute agree on unit scale.
  const amountWei = toUnits(amountUSDC).toString();

  // Step 1: Approve vault to spend USDC
  const approveRes = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: usdcAddress,
    blockchain: 'ARC-TESTNET',
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [vaultAddress, amountWei],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  // Poll for approval confirmation
  const approveId = approveRes.data.id;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: approveId });
    const tx = check.data?.transaction;
    if (tx?.state === 'CONFIRMED') break;
    if (tx?.state === 'FAILED') throw new Error('Approve failed');
  }

  // Step 2: Call deposit on vault
  const depositRes = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: vaultAddress,
    blockchain: 'ARC-TESTNET',
    abiFunctionSignature: 'deposit(uint256)',
    abiParameters: [amountWei],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  const depositId = depositRes.data.id;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: depositId });
    const tx = check.data?.transaction;
    if (tx?.txHash) return tx.txHash;
    if (tx?.state === 'FAILED') throw new Error('Deposit failed');
  }
  return depositId;
}

async function withdrawFromVault(walletId, vaultAddress, amountUSDC) {
  const { toUnits } = require('../utils/usdc');
  const amountWei = toUnits(amountUSDC).toString();

  const res = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: vaultAddress,
    blockchain: 'ARC-TESTNET',
    abiFunctionSignature: 'withdraw(uint256)',
    abiParameters: [amountWei],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  const txId = res.data.id;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: txId });
    const tx = check.data?.transaction;
    if (tx?.txHash) return tx.txHash;
    if (tx?.state === 'FAILED') throw new Error('Withdraw failed');
  }
  return txId;
}

async function createVaultSchedule(walletId, vaultAddress, toAddress, amountUSDC, intervalSec, reason, minBalanceUSDC) {
  const { toUnits } = require('../utils/usdc');
  const amountWei = toUnits(amountUSDC).toString();
  const minBalWei = toUnits(minBalanceUSDC || 0).toString();

  const res = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: vaultAddress,
    blockchain: 'ARC-TESTNET',
    abiFunctionSignature: 'createSchedule(address,uint256,uint256,string,uint256)',
    abiParameters: [toAddress, amountWei, String(intervalSec), reason || '', minBalWei],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  return await waitForTxHash(res.data.id, 'createSchedule');
}

async function cancelVaultSchedule(walletId, vaultAddress, index) {
  const res = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: vaultAddress,
    blockchain: 'ARC-TESTNET',
    abiFunctionSignature: 'cancelSchedule(uint256)',
    abiParameters: [String(index)],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  return await waitForTxHash(res.data.id, 'cancelSchedule');
}

async function waitForTxHash(txId, label) {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: txId });
    const tx = check.data?.transaction;
    if (tx?.txHash) return tx.txHash;
    if (tx?.state === 'FAILED') throw new Error(label + ' failed');
  }
  return txId;
}

async function executeOnChainSchedule(walletId, vaultAddress, userAddress, index) {
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const abi = ['function executeScheduled(address user, uint256 index) external'];
  const contract = new ethers.Contract(vaultAddress, abi, agentWallet);
  const tx = await contract.executeScheduled(userAddress, index);
  const receipt = await tx.wait();
  return receipt.hash;
}

module.exports = { ...module.exports, approveAndDepositToVault, withdrawFromVault, createVaultSchedule, cancelVaultSchedule, executeOnChainSchedule };
