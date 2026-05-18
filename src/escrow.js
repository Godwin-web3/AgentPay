const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const artifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault.json'), 'utf8')
);
const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault-deployment.json'), 'utf8')
);

let vaultContract = null;

function getVaultContract(wallet) {
  if (!vaultContract) {
    vaultContract = new ethers.Contract(deployment.address, artifact.abi, wallet);
  }
  return vaultContract;
}

const TOKENS = {
  STT:  ethers.ZeroAddress,
  WSTT: "0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7",
  PING: "0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493",
  PONG: "0x9beaA0016c22B646Ac311Ab171270B0ECf23098F",
  SUSD: "0x65296738D4E5edB1515e40287B6FDf8320E6eE04",
};

function resolveTokenAddress(symbolOrAddr) {
  if (!symbolOrAddr) return ethers.ZeroAddress;
  if (symbolOrAddr.toUpperCase() === 'STT') return ethers.ZeroAddress;
  if (symbolOrAddr.startsWith('0x')) return symbolOrAddr;
  return TOKENS[symbolOrAddr.toUpperCase()] || ethers.ZeroAddress;
}

async function setPolicy(wallet, perTxCap, dailyCap, maxTxPerHour, whitelist) {
  const contract = getVaultContract(wallet);
  const tx = await contract.setPolicy(
    ethers.parseEther(perTxCap.toString()),
    ethers.parseEther(dailyCap.toString()),
    maxTxPerHour,
    whitelist
  );
  return await tx.wait();
}

async function executePayment(wallet, userAddress, token, to, amount, reason, requestId) {
  const contract = getVaultContract(wallet);
  const tokenAddr = resolveTokenAddress(token);
  const amountWei = ethers.parseEther(amount.toString());
  const reqIdBytes32 = requestId ? (requestId.startsWith('0x') ? requestId : ethers.id(requestId)) : ethers.ZeroHash;

  const tx = await contract.execute(userAddress, tokenAddr, to, amountWei, reason || '', reqIdBytes32, {
    gasLimit: 800000
  });
  return await tx.wait();
}

async function getOnChainPolicy(wallet, userAddress) {
  const contract = getVaultContract(wallet);
  const [policy, whitelist] = await contract.getPolicy(userAddress);
  const [todaySpent, currentHourTx] = await contract.getSpendMetrics(userAddress);
  const balance = await contract.getBalance(userAddress, ethers.ZeroAddress);
  
  return {
    perTxCap: parseFloat(ethers.formatEther(policy.perTxCap)),
    dailyCap: parseFloat(ethers.formatEther(policy.dailyCap)),
    maxTxPerHour: Number(policy.maxTxPerHour),
    active: policy.active,
    whitelist,
    todaySpent: parseFloat(ethers.formatEther(todaySpent)),
    currentHourTx: Number(currentHourTx),
    vaultBalance: parseFloat(ethers.formatEther(balance))
  };
}

async function createOnChainSchedule(wallet, userAddress, token, to, amount, interval, reason, minBalance) {
  const contract = getVaultContract(wallet);
  const tokenAddr = resolveTokenAddress(token);
  const tx = await contract.createSchedule(
    tokenAddr,
    to,
    ethers.parseEther(amount.toString()),
    interval,
    reason || '',
    ethers.parseEther((minBalance || 0).toString())
  );
  return await tx.wait();
}

async function getOnChainSchedules(wallet, userAddress) {
  const contract = getVaultContract(wallet);
  const schedules = await contract.getSchedules(userAddress);
  return schedules.map((s, index) => ({
    id: index,
    token: s.token,
    to: s.to,
    amount: parseFloat(ethers.formatEther(s.amount)),
    interval: Number(s.interval),
    nextRun: new Date(Number(s.nextRun) * 1000).toISOString(),
    active: s.active,
    reason: s.reason,
    minBalance: parseFloat(ethers.formatEther(s.minBalance))
  }));
}

async function cancelOnChainSchedule(wallet, index) {
  const contract = getVaultContract(wallet);
  const tx = await contract.cancelSchedule(index);
  return await tx.wait();
}

module.exports = {
  setPolicy,
  executePayment,
  getOnChainPolicy,
  createOnChainSchedule,
  getOnChainSchedules,
  cancelOnChainSchedule,
  getVaultContract,
  TOKENS,
  resolveTokenAddress
};
