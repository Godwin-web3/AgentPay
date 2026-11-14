// src/poolVault.js — wrapper around contracts/PoolVault.sol.
// Mirrors two existing patterns rather than inventing a third:
//  - Member-facing calls (createPool, acceptInvite, leavePool, contribute,
//    withdrawPersonal, veto) must originate from the member's OWN address.
//    Users hold Circle-managed SCA wallets, not a raw private key this
//    backend can sign with — so these go through Circle's
//    createContractExecutionTransaction keyed by walletId, exactly like
//    src/walletService.js's approveAndDepositToVault/withdrawFromVault.
//  - Proposal calls are never sent from the member's developer-controlled wallet.
//    The member signs EIP-712 typed data. The operator key only relays that
//    signature. A missing signature is refused.
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
const { getProvider } = require('./chain');
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
  const provider = getProvider();
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

const PROPOSAL_TYPES = {
  PoolProposal: [
    { name: 'poolId', type: 'uint256' },
    { name: 'proposer', type: 'address' },
    { name: 'kind', type: 'uint8' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'reasonHash', type: 'bytes32' },
    { name: 'discretionaryThreshold', type: 'uint256' },
    { name: 'objectionWindow', type: 'uint256' },
    { name: 'maxSingleProposal', type: 'uint256' },
    { name: 'targetMember', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

function getAgentWallet() {
  if (!process.env.PRIVATE_KEY) throw new Error('The agent key is not configured.');
  return new ethers.Wallet(process.env.PRIVATE_KEY, getProvider());
}

function requireMemberSignature(signature, deadline) {
  if (!deadline || !signature || signature === '0x') {
    const err = new Error('A member signature is required. The server will not submit this proposal.');
    err.code = 'SIGNATURE_REQUIRED';
    throw err;
  }
}

async function proposalContext(provider, poolId, proposer) {
  const contract = getReadContract(provider);
  const pool = await contract.getPool(poolId);
  const nonce = await contract.proposalNonces(poolId, proposer);
  const network = await provider.getNetwork();
  return {
    rules: pool.constitution,
    nonce,
    domain: {
      name: 'PoolVault',
      version: '1',
      chainId: Number(network.chainId),
      verifyingContract: getAddress(),
    },
  };
}

function typedData(domain, message) {
  return { domain, types: PROPOSAL_TYPES, primaryType: 'PoolProposal', message };
}

async function spendTypedData(provider, { poolId, proposer, to, amount, reason, deadline }) {
  const ctx = await proposalContext(provider, poolId, proposer);
  return typedData(ctx.domain, {
    poolId: String(poolId),
    proposer,
    kind: 0,
    to,
    amount: toUnits(amount).toString(),
    reasonHash: ethers.keccak256(ethers.toUtf8Bytes(reason || '')),
    discretionaryThreshold: ctx.rules.discretionaryThreshold.toString(),
    objectionWindow: ctx.rules.objectionWindow.toString(),
    maxSingleProposal: ctx.rules.maxSingleProposal.toString(),
    targetMember: ethers.ZeroAddress,
    nonce: ctx.nonce.toString(),
    deadline: String(deadline),
  });
}

async function amendTypedData(provider, { poolId, proposer, constitution, deadline }) {
  const ctx = await proposalContext(provider, poolId, proposer);
  return typedData(ctx.domain, {
    poolId: String(poolId),
    proposer,
    kind: 1,
    to: ethers.ZeroAddress,
    amount: '0',
    reasonHash: ethers.ZeroHash,
    discretionaryThreshold: toUnits(constitution.discretionaryThreshold).toString(),
    objectionWindow: String(constitution.objectionWindow),
    maxSingleProposal: toUnits(constitution.maxSingleProposal).toString(),
    targetMember: ethers.ZeroAddress,
    nonce: ctx.nonce.toString(),
    deadline: String(deadline),
  });
}

async function removeTypedData(provider, { poolId, proposer, targetMember, deadline }) {
  const ctx = await proposalContext(provider, poolId, proposer);
  return typedData(ctx.domain, {
    poolId: String(poolId),
    proposer,
    kind: 2,
    to: ethers.ZeroAddress,
    amount: '0',
    reasonHash: ethers.ZeroHash,
    discretionaryThreshold: '0',
    objectionWindow: '0',
    maxSingleProposal: '0',
    targetMember,
    nonce: ctx.nonce.toString(),
    deadline: String(deadline),
  });
}

async function relayProposal(abi, args) {
  const contract = getAgentContract(getAgentWallet());
  const tx = await contract[abi](...args, { gasLimit: 400000 });
  const receipt = await tx.wait();
  for (const log of receipt.logs) {
    try {
      const decoded = contract.interface.parseLog(log);
      if (decoded && decoded.name === 'ProposalCreated') {
        return { proposalId: decoded.args.proposalId.toString(), txHash: receipt.hash };
      }
    } catch { continue; }
  }
  throw new Error('Could not parse ProposalCreated event');
}

async function proposeSpend(proposer, poolId, to, amountUSDC, reason, deadline, signature) {
  requireMemberSignature(signature, deadline);
  return relayProposal('proposeSpend', [poolId, proposer, to, toUnits(amountUSDC), reason || '', deadline, signature]);
}

async function proposeAmendConstitution(proposer, poolId, newConstitution, deadline, signature) {
  requireMemberSignature(signature, deadline);
  const packed = [toUnits(newConstitution.discretionaryThreshold).toString(), String(newConstitution.objectionWindow), toUnits(newConstitution.maxSingleProposal).toString()];
  return relayProposal('proposeAmendConstitution', [poolId, proposer, packed, deadline, signature]);
}

async function proposeRemoveMember(proposer, poolId, targetMember, deadline, signature) {
  requireMemberSignature(signature, deadline);
  return relayProposal('proposeRemoveMember', [poolId, proposer, targetMember, deadline, signature]);
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
  spendTypedData,
  amendTypedData,
  removeTypedData,
  resolveProposal,
  getPool,
  getMemberStatus,
  getPersonalBalance,
  getProposal,
  MEMBER_STATUS,
  PROPOSAL_KIND,
};
