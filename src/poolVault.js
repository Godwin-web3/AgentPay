// src/poolVault.js — wrapper around contracts/PoolVault.sol.
// Member calls (create, accept, leave, contribute, withdraw, veto) must be
// sent by the member. This server only builds the unsigned transaction.
// The Privy wallet signs it. Proposal calls are different: the member signs
// EIP-712 typed data and the operator key relays that signature. A missing
// signature is refused.
// PoolVault is a singleton (see contracts/PoolVault.sol) — one address,
// no per-pool factory lookup like escrow.findVault needs.

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { toUnits, fromUnits } = require('../utils/usdc');

const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/PoolVault.json'), 'utf8'));

let deployment = null;
const deploymentPath = path.join(__dirname, '../artifacts/PoolVault-deployment.json');
const { getProvider, getChain } = require('./chain');
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

// ── Unsigned member calls. The Privy wallet sends these. ───────────────────

function poolChainId() {
  return getChain('arc').chainId;
}

function unsignedCall(to, data) {
  return { chainId: poolChainId(), to, data, value: '0' };
}

function encodePool(fragment, args) {
  const iface = new ethers.Interface(artifact.abi);
  return unsignedCall(getAddress(), iface.encodeFunctionData(fragment, args));
}

function usdcAddress() {
  return process.env.USDC_CONTRACT || getChain('arc').stable.address;
}

function createPoolCall(invites, constitution) {
  return encodePool('createPool', [invites, packConstitution(constitution)]);
}

function acceptInviteCall(poolId) {
  return encodePool('acceptInvite', [poolId]);
}

function leavePoolCall(poolId) {
  return encodePool('leavePool', [poolId]);
}

function contributeCalls(poolId, amountUSDC, toShared) {
  const amountWei = toUnits(amountUSDC).toString();
  const erc20 = new ethers.Interface(['function approve(address spender, uint256 amount)']);
  return {
    approve: unsignedCall(usdcAddress(), erc20.encodeFunctionData('approve', [getAddress(), amountWei])),
    tx: encodePool('contribute', [poolId, amountWei, !!toShared]),
    amountWei,
  };
}

function withdrawPersonalCall(poolId, amountUSDC) {
  return encodePool('withdrawPersonal', [poolId, toUnits(amountUSDC)]);
}

function vetoCall(proposalId) {
  return encodePool('veto', [proposalId]);
}

function findEvent(receipt, name) {
  const iface = new ethers.Interface(artifact.abi);
  for (const log of receipt.logs) {
    try {
      const decoded = iface.parseLog(log);
      if (decoded && decoded.name === name) return decoded;
    } catch { continue; }
  }
  return null;
}

async function memberReceipt(provider, txHash, expectedFrom, expectedTo) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) {
    throw new Error('A transaction from your wallet is required.');
  }
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new Error('That transaction is not on Arc yet.');
  if (receipt.status !== 1) throw new Error('That transaction failed. Nothing was recorded.');
  if (ethers.getAddress(receipt.from) !== ethers.getAddress(expectedFrom)) {
    throw new Error('That transaction was not sent by your wallet.');
  }
  let to = receipt.to;
  if (!to && expectedTo) {
    const tx = await provider.getTransaction(txHash);
    to = tx && tx.to;
  }
  if (expectedTo && ethers.getAddress(to) !== ethers.getAddress(expectedTo)) {
    throw new Error('That transaction did not call the pool.');
  }
  return receipt;
}

async function readPoolCreated(provider, txHash, expectedFrom) {
  const receipt = await memberReceipt(provider, txHash, expectedFrom, getAddress());
  const decoded = findEvent(receipt, 'PoolCreated');
  if (!decoded || ethers.getAddress(decoded.args.founder) !== ethers.getAddress(expectedFrom)) {
    throw new Error('That transaction did not create a pool.');
  }
  return { poolId: decoded.args.poolId.toString(), txHash };
}

async function readMemberJoined(provider, txHash, expectedFrom, poolId) {
  const receipt = await memberReceipt(provider, txHash, expectedFrom, getAddress());
  const decoded = findEvent(receipt, 'MemberJoined');
  if (!decoded || decoded.args.poolId.toString() !== String(poolId) || ethers.getAddress(decoded.args.member) !== ethers.getAddress(expectedFrom)) {
    throw new Error('That transaction did not accept this invite.');
  }
  return { txHash };
}

async function readMemberLeft(provider, txHash, expectedFrom, poolId) {
  const receipt = await memberReceipt(provider, txHash, expectedFrom, getAddress());
  const decoded = findEvent(receipt, 'MemberLeft');
  if (!decoded || decoded.args.poolId.toString() !== String(poolId) || ethers.getAddress(decoded.args.member) !== ethers.getAddress(expectedFrom)) {
    throw new Error('That transaction did not leave this pool.');
  }
  return { txHash };
}

async function readContributed(provider, txHash, expectedFrom, poolId, amountUSDC) {
  const receipt = await memberReceipt(provider, txHash, expectedFrom, getAddress());
  const decoded = findEvent(receipt, 'Contributed');
  const expected = toUnits(amountUSDC);
  if (!decoded || decoded.args.poolId.toString() !== String(poolId) || ethers.getAddress(decoded.args.member) !== ethers.getAddress(expectedFrom) || decoded.args.amount !== expected) {
    throw new Error('That transaction is not this contribution.');
  }
  return { txHash, toShared: decoded.args.toShared };
}

async function readWithdrawn(provider, txHash, expectedFrom, poolId, amountUSDC) {
  const receipt = await memberReceipt(provider, txHash, expectedFrom, getAddress());
  const decoded = findEvent(receipt, 'PersonalWithdrawn');
  if (!decoded || decoded.args.poolId.toString() !== String(poolId) || ethers.getAddress(decoded.args.member) !== ethers.getAddress(expectedFrom) || decoded.args.amount !== toUnits(amountUSDC)) {
    throw new Error('That transaction is not this withdrawal.');
  }
  return { txHash };
}

async function readVeto(provider, txHash, expectedFrom, proposalId) {
  const receipt = await memberReceipt(provider, txHash, expectedFrom, getAddress());
  const decoded = findEvent(receipt, 'ProposalVetoed');
  if (!decoded || decoded.args.proposalId.toString() !== String(proposalId) || ethers.getAddress(decoded.args.by) !== ethers.getAddress(expectedFrom)) {
    throw new Error('That transaction is not this objection.');
  }
  return { txHash };
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
  createPoolCall,
  acceptInviteCall,
  leavePoolCall,
  contributeCalls,
  withdrawPersonalCall,
  vetoCall,
  readPoolCreated,
  readMemberJoined,
  readMemberLeft,
  readContributed,
  readWithdrawn,
  readVeto,
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
