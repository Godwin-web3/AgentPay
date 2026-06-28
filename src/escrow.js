const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { toUnits, fromUnits } = require('../utils/usdc');

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

// Subset ABI used by the vault frontend (kept aligned with the hardened contract).
const VAULT_ABI = [
  "function balances(address) view returns (uint256)",
  "function policies(address) view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy)",
  "function setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, address[] calldata whitelist) external",
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function execute(address user, address to, uint256 amount, string reason, bytes32 requestId) external",
  "function executeWithSig(address user, address to, uint256 amount, bytes32 requestId, uint256 deadline, bytes sig) external",
  "function multicall(address user, address[] targets, uint256[] amounts, string reason, bytes32 requestId) external",
  "function createSchedule(address to, uint256 amount, uint256 interval, string reason, uint256 minBalance) external",
  "function cancelSchedule(uint256 index) external",
  "function executeScheduled(address user, uint256 index) external",
  "function getSchedules(address user) view returns (tuple(address to, uint256 amount, uint256 interval, uint256 nextRun, bool active, string reason, uint256 minBalance)[])",
  "function getBalance(address user) view returns (uint256)",
  "function getPolicy(address user) view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] whitelist)",
  "function getSpendMetrics(address user) view returns (uint256 todaySpent, uint256 currentHourTx)",
  "function pauseUser(address user) external",
  "function resumeUser(address user) external",
  "function userPaused(address) view returns (bool)",
  "function nonces(address) view returns (uint256)",
  "function getNonce(address user) view returns (uint256)",
  "function proposeAgent(address newAgent) external",
  "function acceptAgent() external"
];

async function findVault(userAddress) {
  if (process.env.VAULT_ADDRESS) return process.env.VAULT_ADDRESS;
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC);
  const factory = new ethers.Contract(factoryDeployment.address, factoryArtifact.abi, provider);
  if (!userAddress) {
    return process.env.VAULT_ADDRESS || deployment.address || null;
  }
  const vaultAddr = await factory.getVault(userAddress);
  return vaultAddr === ethers.ZeroAddress ? null : vaultAddr;
}

async function getVaultContract(wallet, userAddress) {
  if (!userAddress || process.env.VAULT_ADDRESS) {
    const defaultAddr = process.env.VAULT_ADDRESS || deployment.address;
    return new ethers.Contract(defaultAddr, VAULT_ABI, wallet);
  }

  const factory = new ethers.Contract(factoryDeployment.address, factoryArtifact.abi, wallet);
  let vaultAddr = await factory.getVault(userAddress);

  if (vaultAddr === ethers.ZeroAddress) {
    console.log(`🏭 Creating new AgentVault for ${userAddress}...`);
    const tx = await factory.createVault();
    await tx.wait();
    vaultAddr = await factory.getVault(userAddress);
    console.log(`✅ Vault created at ${vaultAddr}`);
  }

  return new ethers.Contract(vaultAddr, VAULT_ABI, wallet);
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
    toUnits(perTxCap),
    toUnits(dailyCap),
    maxTxPerHour,
    whitelist
  );
  return await tx.wait();
}

// P0-2: executes via the vault (policy-enforced path), never direct transfer.
async function executePayment(wallet, userAddress, token, to, amount, reason, requestId) {
  const contract = await getVaultContract(wallet, userAddress);
  // AgentVault is single-asset (USDC-only) — execute() takes no token param.
  // 'token' is accepted here for API symmetry/future-proofing but currently unused.
  const amountWei = toUnits(amount);
  const reqIdBytes32 = requestId ? (requestId.startsWith('0x') ? requestId : ethers.id(requestId)) : ethers.ZeroHash;

  const tx = await contract.execute(userAddress, to, amountWei, reason || '', reqIdBytes32, {
    gasLimit: 3000000
  });
  return await tx.wait();
}

// P0-1: signature-based execution so users (SCAs) can authorize a payment
// without the operator holding a spend key. The signed payload is
// (user,to,amount,requestId,nonce,deadline) — `reason` is NOT signed (it is
// logged in the Executed event and recorded off-chain). Returns packed sig.
async function signExecute(vaultAddress, signerWallet, { user, to, amount, requestId, deadlineSec }) {
  const deadline = Math.floor((deadlineSec ? Date.now()/1000 + deadlineSec : (Date.now()/1000 + 300)));
  const userAddr = user || (await signerWallet.getAddress());
  const contract = new ethers.Contract(vaultAddress, [
    "function getNonce(address) view returns (uint256)",
    "function domainSeparator() view returns (bytes32)"
  ], signerWallet);
  const nonce = await contract.getNonce(userAddr);

  const types = {
    ExecuteWithSig: [
      { name: "user", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "requestId", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };
  const domain = {
    name: "AgentVault",
    version: "1",
    chainId: 5042002,
    verifyingContract: vaultAddress
  };
  const value = {
    user: userAddr,
    to,
    amount: toUnits(amount),
    requestId: requestId || ethers.ZeroHash,
    nonce,
    deadline
  };
  const sigHex = await signerWallet.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(sigHex);
  // Pack as r || s || v (65 bytes) to match AgentVault._splitSig.
  const packedSig = ethers.concat([r, s, ethers.toBeArray(v)]);
  return { sig: packedSig, deadline, nonce, user: userAddr };
}

async function executePaymentWithSig(vaultAddress, wallet, payload) {
  const contract = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);
  const { user, to, amount, requestId, deadline, sig } = payload;
  const tx = await contract.executeWithSig(
    user, to, toUnits(amount), requestId || ethers.ZeroHash, deadline, sig,
    { gasLimit: 3000000 }
  );
  return await tx.wait();
}

// P2-12: operator-side circuit breaker passthrough.
async function pauseUser(wallet, userAddress) {
  const contract = await getVaultContract(wallet, userAddress);
  const tx = await contract.pauseUser(userAddress);
  return await tx.wait();
}

async function resumeUser(wallet, userAddress) {
  const contract = await getVaultContract(wallet, userAddress);
  const tx = await contract.resumeUser(userAddress);
  return await tx.wait();
}

async function getOnChainPolicy(wallet, userAddress) {
  const contract = await getVaultContract(wallet, userAddress);
  const [policy, whitelist] = await contract.getPolicy(userAddress);
  const [todaySpent, currentHourTx] = await contract.getSpendMetrics(userAddress);
  const balance = await contract.getBalance(userAddress);

  return {
    perTxCap: fromUnits(policy.perTxCap),
    dailyCap: fromUnits(policy.dailyCap),
    maxTxPerHour: Number(policy.maxTxPerHour),
    active: policy.active,
    whitelist,
    todaySpent: fromUnits(todaySpent),
    currentHourTx: Number(currentHourTx),
    vaultBalance: fromUnits(balance)
  };
}

async function createOnChainSchedule(wallet, userAddress, token, to, amount, interval, reason, minBalance) {
  const contract = await getVaultContract(wallet, userAddress);
  const tx = await contract.createSchedule(
    to,
    toUnits(amount),
    interval,
    reason || '',
    toUnits(minBalance || 0)
  );
  return await tx.wait();
}

async function getOnChainSchedules(wallet, userAddress) {
  const contract = await getVaultContract(wallet, userAddress);
  const schedules = await contract.getSchedules(userAddress);
  return schedules.map((s, index) => ({
    id: index,
    to: s.to,
    amount: fromUnits(s.amount),
    interval: Number(s.interval),
    nextRun: new Date(Number(s.nextRun) * 1000).toISOString(),
    active: s.active,
    reason: s.reason,
    minBalance: fromUnits(s.minBalance)
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
  executePaymentWithSig,
  signExecute,
  pauseUser,
  resumeUser,
  getOnChainPolicy,
  createOnChainSchedule,
  getOnChainSchedules,
  cancelOnChainSchedule,
  getVaultContract,
  findVault,
  TOKENS,
  resolveTokenAddress,
  VAULT_ABI
};