// src/poolVault.js — wrapper around contracts/PoolVault.sol.
// Mirrors two existing patterns rather than inventing a third:
//  - Member-facing calls (createPool, acceptInvite, leavePool, contribute,
//    withdrawPersonal, veto) must originate from the member's OWN address.
//    Users hold Circle-managed SCA wallets, not a raw private key this
//    backend can sign with — so these go through Circle's
//    createContractExecutionTransaction keyed by walletId, exactly like
//    src/walletService.js's approveAndDepositToVault/withdrawFromVault.
//  - Agent-gated calls (proposeSpend, proposeAmendConstitution,
//    proposeRemoveMember, resolveProposal) are onlyAgent on-chain, so they
//    sign with the operator's raw ethers.Wallet(PRIVATE_KEY), same as
//    src/escrow.js's executePayment.
// PoolVault is a singleton (see contracts/PoolVault.sol) — one address,
// no per-pool factory lookup like escrow.findVault needs.

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
const { toUnits, fromUnits } = require('../utils/usdc');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/PoolVault.json'), 'utf8'));

let deployment = null;
const deploymentPath = path.join(__dirname, '../artifacts/PoolVault-deployment.json');
if (fs.existsSync(deploymentPath)) {
  deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
}

function getAddress() {
  const addr = process.env.POOL_VAULT_ADDRESS || (deployment && deployment.address);
  if (!addr) {
    throw new Error('PoolVault is not deployed yet — run scripts/deployPoolVault.js, or set POOL_VAULT_ADDRESS');
  }
  return addr;
}

function getReadContract(provider) {
  return new ethers.Contract(getAddress(), artifact.abi, provider);
}

function getAgentContract(agentWallet) {
  return new ethers.Contract(getAddress(), artifact.abi, agentWallet);
}

const MEMBER_STATUS = ['None', 'Invited', 'Active'];
const PROPOSAL_KIND = ['Spend', 'AmendConstitution', 'RemoveMember', 'AddMember'];

function packConstitution(c) {
  return [toUnits(c.discretionaryThreshold).toString(), String(c.objectionWindow), toUnits(c.maxSingleProposal).toString()];
}

function unpackConstitution(c) {
  return {
    discretionaryThreshold: fromUnits(c.discretionaryThreshold),
    objectionWindow: Number(c.objectionWindow),
    maxSingleProposal: fromUnits(c.maxSingleProposal),
  };
}

// ── Member-signed calls (Circle contract-execution, keyed by walletId) ──────

async function waitForTxHash(txId, label) {
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: txId });
    const tx = check.data?.transaction;
    if (tx?.txHash && tx?.state === 'COMPLETE') return tx.txHash;
    if (tx?.state === 'FAILED') throw new Error(label + ' failed on chain');
  }
  throw new Error(label + ' timed out');
}

async function memberContractCall(walletId, abiFunctionSignature, abiParameters, label) {
  const res = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: getAddress(),
    blockchain: 'ARC-TESTNET',
    abiFunctionSignature,
    abiParameters,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  return await waitForTxHash(res.data.id, label);
}

async function createPool(walletId, invites, constitution) {
  const txHash = await memberContractCall(
    walletId,
    'createPool(address[],(uint256,uint256,uint256))',
    [invites, packConstitution(constitution)],
    'create pool'
  );
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  const receipt = await provider.getTransactionReceipt(txHash);
  const iface = new ethers.Interface(artifact.abi);
  for (const log of receipt.logs) {
    try {
      const decoded = iface.parseLog(log);
      if (decoded.name === 'PoolCreated') return { poolId: decoded.args.poolId.toString(), txHash };
    } catch { continue; }
  }
  throw new Error('Could not parse PoolCreated event');
}

async function acceptInvite(walletId, poolId) {
  return await memberContractCall(walletId, 'acceptInvite(uint256)', [poolId], 'accept invite');
}

async function leavePool(walletId, poolId) {
  return await memberContractCall(walletId, 'leavePool(uint256)', [poolId], 'leave pool');
}

async function contribute(walletId, poolId, amountUSDC, toShared) {
  const amountWei = toUnits(amountUSDC).toString();
  const usdcAddress = process.env.USDC_CONTRACT;

  // Step 1: approve PoolVault to pull the USDC (approve() lives on the USDC
  // contract, not PoolVault — a separate call target from memberContractCall).
  const approveRes = await client.createContractExecutionTransaction({
    walletId, contractAddress: usdcAddress, blockchain: 'ARC-TESTNET',
    abiFunctionSignature: 'approve(address,uint256)', abiParameters: [getAddress(), amountWei],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  await waitForTxHash(approveRes.data.id, 'approve USDC');

  // Step 2: contribute() pulls it via transferFrom.
  return await memberContractCall(walletId, 'contribute(uint256,uint256,bool)', [poolId, amountWei, toShared], 'contribute');
}

async function withdrawPersonal(walletId, poolId, amountUSDC) {
  return await memberContractCall(walletId, 'withdrawPersonal(uint256,uint256)', [poolId, toUnits(amountUSDC).toString()], 'withdraw personal');
}

async function veto(walletId, proposalId) {
  return await memberContractCall(walletId, 'veto(uint256)', [proposalId], 'veto');
}

// ── Agent-signed calls (onlyAgent on-chain) ─────────────────────────────────

async function proposeSpend(agentWallet, poolId, proposer, to, amountUSDC, reason) {
  const contract = getAgentContract(agentWallet);
  const proposalId = await contract.proposeSpend.staticCall(poolId, proposer, to, toUnits(amountUSDC), reason);
  const tx = await contract.proposeSpend(poolId, proposer, to, toUnits(amountUSDC), reason, { gasLimit: 300000 });
  const receipt = await tx.wait();
  return { proposalId: proposalId.toString(), txHash: receipt.hash };
}

async function proposeAmendConstitution(agentWallet, poolId, proposer, newConstitution) {
  const contract = getAgentContract(agentWallet);
  const packed = { discretionaryThreshold: toUnits(newConstitution.discretionaryThreshold), objectionWindow: newConstitution.objectionWindow, maxSingleProposal: toUnits(newConstitution.maxSingleProposal) };
  const proposalId = await contract.proposeAmendConstitution.staticCall(poolId, proposer, packed);
  const tx = await contract.proposeAmendConstitution(poolId, proposer, packed, { gasLimit: 300000 });
  const receipt = await tx.wait();
  return { proposalId: proposalId.toString(), txHash: receipt.hash };
}

async function proposeRemoveMember(agentWallet, poolId, proposer, targetMember) {
  const contract = getAgentContract(agentWallet);
  const proposalId = await contract.proposeRemoveMember.staticCall(poolId, proposer, targetMember);
  const tx = await contract.proposeRemoveMember(poolId, proposer, targetMember, { gasLimit: 300000 });
  const receipt = await tx.wait();
  return { proposalId: proposalId.toString(), txHash: receipt.hash };
}

async function resolveProposal(agentWallet, proposalId) {
  const contract = getAgentContract(agentWallet);
  const tx = await contract.resolveProposal(proposalId, { gasLimit: 250000 });
  return (await tx.wait()).hash;
}

// ── Reads ────────────────────────────────────────────────────────────────

async function getPool(provider, poolId) {
  const contract = getReadContract(provider);
  const [founder, memberList, constitution, sharedBalance, active] = await contract.getPool(poolId);
  return { founder, memberList, constitution: unpackConstitution(constitution), sharedBalance: fromUnits(sharedBalance), active };
}

async function getMemberStatus(provider, poolId, address) {
  const contract = getReadContract(provider);
  return MEMBER_STATUS[Number(await contract.memberStatus(poolId, address))];
}

async function getPersonalBalance(provider, poolId, address) {
  const contract = getReadContract(provider);
  return fromUnits(await contract.personalBalance(poolId, address));
}

async function getProposal(provider, proposalId) {
  const contract = getReadContract(provider);
  const [poolId, kind, to, amount, reason, windowEnds, vetoed, resolved, executed] = await contract.getProposal(proposalId);
  return { poolId: poolId.toString(), kind: PROPOSAL_KIND[Number(kind)], to, amount: fromUnits(amount), reason, windowEnds: Number(windowEnds), vetoed, resolved, executed };
}

module.exports = {
  getAddress,
  createPool,
  acceptInvite,
  leavePool,
  contribute,
  withdrawPersonal,
  veto,
  proposeSpend,
  proposeAmendConstitution,
  proposeRemoveMember,
  resolveProposal,
  getPool,
  getMemberStatus,
  getPersonalBalance,
  getProposal,
  MEMBER_STATUS,
  PROPOSAL_KIND,
};
