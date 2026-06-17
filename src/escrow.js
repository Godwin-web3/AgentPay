const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const artifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault.json'), 'utf8')
);
const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault-deployment.json'), 'utf8')
);

const factoryArtifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/VaultFactory.json'), 'utf8')
);
const factoryDeployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../artifacts/VaultFactory-deployment.json'), 'utf8')
);

async function findVault(userAddress) {
  if (process.env.VAULT_ADDRESS) return process.env.VAULT_ADDRESS;
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC);
  const factory = new ethers.Contract(factoryDeployment.address, factoryArtifact.abi, provider);
  const vaultAddr = await factory.getVault(userAddress);
  return vaultAddr === ethers.ZeroAddress ? null : vaultAddr;
}

async function getVaultContract(wallet, userAddress) {
  // Always prefer VAULT_ADDRESS from env if set
  if (!userAddress || process.env.VAULT_ADDRESS) {
    const defaultAddr = process.env.VAULT_ADDRESS || deployment.address;
    return new ethers.Contract(defaultAddr, artifact.abi, wallet);
  }

  const factory = new ethers.Contract(factoryDeployment.address, factoryArtifact.abi, wallet);
  let vaultAddr = await factory.getVault(userAddress);

  if (vaultAddr === ethers.ZeroAddress) {
    console.log(`🏭 Creating new AgentVault for ${userAddress}...`);
    const tx = await factory.createVault(userAddress);
    await tx.wait();
    vaultAddr = await factory.getVault(userAddress);
    console.log(`✅ Vault created at ${vaultAddr}`);
  }

  return new ethers.Contract(vaultAddr, artifact.abi, wallet);
}

const TOKENS = {
  USDC: process.env.USDC_CONTRACT || "0x3600000000000000000000000000000000000000",
};

function resolveTokenAddress(symbolOrAddr) {
  if (!symbolOrAddr) return ethers.ZeroAddress;
  if (symbolOrAddr.toUpperCase() === 'USDC') return TOKENS.USDC;
  if (symbolOrAddr.startsWith('0x')) return symbolOrAddr;
  return TOKENS[symbolOrAddr.toUpperCase()] || ethers.ZeroAddress;
}

async function setPolicy(wallet, perTxCap, dailyCap, maxTxPerHour, whitelist, userAddress) {
  const contract = await getVaultContract(wallet, userAddress);
  const tx = await contract.setPolicy(
    ethers.parseEther(perTxCap.toString()),
    ethers.parseEther(dailyCap.toString()),
    maxTxPerHour,
    whitelist
  );
  return await tx.wait();
}

async function executePayment(wallet, userAddress, token, to, amount, reason, requestId) {
  const contract = await getVaultContract(wallet, userAddress);
  const tokenAddr = resolveTokenAddress(token);
  // Note: Native USDC on Arc uses 18 decimals internally for gas representation, 
  // but if we are calling an ERC20 execute, we should use the correct decimals.
  // AgentVault.sol likely uses 18 decimals for its internal accounting to match native.
  const amountWei = ethers.parseEther(amount.toString());
  const reqIdBytes32 = requestId ? (requestId.startsWith('0x') ? requestId : ethers.id(requestId)) : ethers.ZeroHash;

  const tx = await contract.execute(userAddress, tokenAddr, to, amountWei, reason || '', reqIdBytes32, {
    gasLimit: 3000000
  });
  return await tx.wait();
}

async function getOnChainPolicy(wallet, userAddress) {
  const contract = await getVaultContract(wallet, userAddress);
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
  const contract = await getVaultContract(wallet, userAddress);
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
  const contract = await getVaultContract(wallet, userAddress);
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

async function cancelOnChainSchedule(wallet, index, userAddress) {
  const contract = await getVaultContract(wallet, userAddress);
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
  findVault,
  TOKENS,
  resolveTokenAddress
};
