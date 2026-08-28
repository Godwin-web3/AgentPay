// src/decisionLog.js — chain wrapper around contracts/DecisionLog.sol.
// Mirrors src/escrow.js's pattern for AgentVault: read the compiled artifact
// + deployment record from ./artifacts, expose thin commit/finalize/read calls.

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/DecisionLog.json'), 'utf8'));

let deployment = null;
const deploymentPath = path.join(__dirname, '../artifacts/DecisionLog-deployment.json');
if (fs.existsSync(deploymentPath)) {
  deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
}

function getAddress() {
  const addr = process.env.DECISION_LOG_ADDRESS || (deployment && deployment.address);
  if (!addr) {
    throw new Error('DecisionLog is not deployed yet — run scripts/deployDecisionLog.js, or set DECISION_LOG_ADDRESS');
  }
  return addr;
}

function getContract(signerOrProvider) {
  return new ethers.Contract(getAddress(), artifact.abi, signerOrProvider);
}

// Deterministic, unique per (planId, stepIndex) so retried ticks never
// double-commit the same step and can be cross-referenced against the
// AgentVault requestId used for that same step's payment.
function makeRequestId(planId, stepIndex) {
  return ethers.id(`intent:${planId}:${stepIndex}`);
}

function hashRecord(record) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(record)));
}

async function commitDecision(wallet, requestId, record, summary) {
  const contract = getContract(wallet);
  const decisionHash = hashRecord(record);
  const tx = await contract.commit(requestId, decisionHash, String(summary).slice(0, 200), { gasLimit: 300000 });
  await tx.wait();
  return decisionHash;
}

async function finalizeDecision(wallet, requestId, outcomeRecord) {
  const contract = getContract(wallet);
  const outcomeHash = hashRecord(outcomeRecord);
  const tx = await contract.finalize(requestId, outcomeHash, { gasLimit: 200000 });
  await tx.wait();
  return outcomeHash;
}

async function getDecision(providerOrWallet, requestId) {
  const contract = getContract(providerOrWallet);
  const d = await contract.getDecision(requestId);
  return {
    decisionHash: d.decisionHash,
    outcomeHash: d.outcomeHash,
    committedAt: Number(d.committedAt),
    committedBlock: Number(d.committedBlock),
    finalizedAt: Number(d.finalizedAt),
    finalized: d.finalized,
    summary: d.summary,
  };
}

async function verifyDecision(providerOrWallet, requestId, record) {
  const contract = getContract(providerOrWallet);
  return await contract.verify(requestId, hashRecord(record));
}

module.exports = {
  makeRequestId,
  hashRecord,
  commitDecision,
  finalizeDecision,
  getDecision,
  verifyDecision,
  getAddress,
};
