const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const artifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault.json'), 'utf8')
);
const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault-deployment.json'), 'utf8')
);

let escrow = null;

function getEscrow(wallet) {
  if (!escrow) {
    escrow = new ethers.Contract(deployment.address, artifact.abi, wallet);
  }
  return escrow;
}

async function setPolicy(wallet, perTxCapSTT, dailyCapSTT, maxTxPerHour, whitelist) {
  const contract = getEscrow(wallet);
  const tx = await contract.setPolicy(
    ethers.parseEther(perTxCapSTT.toString()),
    ethers.parseEther(dailyCapSTT.toString()),
    maxTxPerHour,
    whitelist
  );
  await tx.wait();
  console.log('✅ Policy set onchain');
  return tx;
}

async function directSend(wallet, toAddress, amountSTT) {
  const contract = getEscrow(wallet);
  const amountWei = ethers.parseEther(amountSTT.toString());
  const address = await wallet.getAddress();
  const tx = await contract.execute(address, toAddress, amountWei);
  const receipt = await tx.wait();
  console.log('💸 Payment executed via vault');
  console.log('   TX: https://explorer.somnia.network/tx/' + receipt.hash);
  return receipt;
}

async function createJob(wallet, jobId, agentAddress, amountSTT) {
  const contract = getEscrow(wallet);
  const amountWei = ethers.parseEther(amountSTT.toString());
  const jobIdBytes = ethers.id(jobId);
  const tx = await contract.createJob(jobIdBytes, agentAddress, { value: amountWei });
  await tx.wait();
  console.log('✅ Job created onchain: ' + jobId);
  return tx;
}

async function releasePayment(wallet, jobId) {
  const contract = getEscrow(wallet);
  const jobIdBytes = ethers.id(jobId);
  const tx = await contract.releasePayment(jobIdBytes);
  const receipt = await tx.wait();
  console.log('💸 Payment released onchain');
  console.log('   TX: https://explorer.somnia.network/tx/' + receipt.hash);
  return receipt;
}

async function disputeJob(wallet, jobId) {
  const contract = getEscrow(wallet);
  const jobIdBytes = ethers.id(jobId);
  const tx = await contract.disputeJob(jobIdBytes);
  await tx.wait();
  console.log('⚠️  Job disputed: ' + jobId);
  return tx;
}

async function getJob(wallet, jobId) {
  const contract = getEscrow(wallet);
  const jobIdBytes = ethers.id(jobId);
  return await contract.getJob(jobIdBytes);
}

module.exports = { setPolicy, directSend, createJob, releasePayment, disputeJob, getJob, getEscrow };
