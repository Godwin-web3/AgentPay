// Deploys the upgradeable contracts once, using the key already on the server.
// Addresses are remembered in Firestore so a restart does not deploy again.
// Base and Robinhood vaults that are not proxies are replaced once.
// Old test balances stay on the previous addresses.

const { ethers } = require('ethers');
const registry = require('./chainRegistry');
const { getChain, getProvider } = require('./chain');
const { deployImplementation, deployProxy, loadArtifact } = require('../scripts/proxyDeploy');

const DOC = 'arc-proxies';

function redact(error) {
  const text = String(error && (error.shortMessage || error.message) || error);
  return text.replace(/0x[0-9a-fA-F]{64}/g, '0x…').slice(0, 400);
}

function apply(record) {
  if (!record) return;
  if (record.pool) process.env.POOL_VAULT_ADDRESS = record.pool;
  if (record.decisionLog) process.env.DECISION_LOG_ADDRESS = record.decisionLog;
  if (record.vault) process.env.VAULT_ADDRESS = record.vault;
  if (record.factory) process.env.VAULT_FACTORY_ADDRESS = record.factory;
  if (record.baseExecutor) process.env.SWAP_EXECUTOR_BASE = record.baseExecutor;
  registry.remember(DOC, record);
}

async function hydrateProxies() {
  if (!registry.firebaseReady()) return registry.recall(DOC);
  try {
    const stored = await registry.load(DOC);
    apply(stored);
    return stored;
  } catch (err) {
    console.error('[proxies] could not read stored deployment:', redact(err));
    return registry.recall(DOC);
  }
}

function implementationAt(wallet, name, address) {
  const artifact = loadArtifact(name);
  return new ethers.Contract(address, artifact.abi, wallet);
}

async function deployArc(wallet, record) {
  const usdc = getChain('arc').stable.address;
  const agent = wallet.address;

  if (!record.vaultImplementation) {
    const impl = await deployImplementation(wallet, 'AgentVault');
    record.vaultImplementation = await impl.getAddress();
    await registry.save(DOC, { vaultImplementation: record.vaultImplementation });
  }
  const vaultImpl = implementationAt(wallet, 'AgentVault', record.vaultImplementation);

  if (!record.vault) {
    const deployed = await deployProxy(wallet, vaultImpl, 'initialize', [agent, usdc]);
    record.vault = deployed.address;
    record.vaultTx = deployed.txHash;
    await registry.save(DOC, { vault: record.vault, vaultTx: record.vaultTx });
    console.log('[proxies] AgentVault ' + record.vault);
  }

  if (!record.pool) {
    const impl = await deployImplementation(wallet, 'PoolVault');
    const deployed = await deployProxy(wallet, impl, 'initialize', [agent, usdc]);
    const owner = await deployed.contract.owner();
    const onAgent = await deployed.contract.agent();
    const admin = await deployed.contract.upgradeAdmin();
    if (owner.toLowerCase() !== agent.toLowerCase()) throw new Error('Pool owner is ' + owner);
    if (onAgent.toLowerCase() !== agent.toLowerCase()) throw new Error('Pool agent is ' + onAgent);
    if (admin.toLowerCase() !== agent.toLowerCase()) throw new Error('Pool upgrade admin is ' + admin);
    record.pool = deployed.address;
    record.poolImplementation = deployed.implementation;
    record.poolTx = deployed.txHash;
    await registry.save(DOC, {
      pool: record.pool,
      poolImplementation: record.poolImplementation,
      poolTx: record.poolTx,
    });
    console.log('[proxies] PoolVault ' + record.pool);
  }

  if (!record.decisionLog) {
    const impl = await deployImplementation(wallet, 'DecisionLog');
    const deployed = await deployProxy(wallet, impl, 'initialize', [agent]);
    record.decisionLog = deployed.address;
    record.decisionImplementation = deployed.implementation;
    record.decisionTx = deployed.txHash;
    await registry.save(DOC, {
      decisionLog: record.decisionLog,
      decisionImplementation: record.decisionImplementation,
      decisionTx: record.decisionTx,
    });
    console.log('[proxies] DecisionLog ' + record.decisionLog);
  }

  if (!record.beacon) {
    const beaconArtifact = loadArtifact('UpgradeableBeacon');
    const beaconFactory = new ethers.ContractFactory(beaconArtifact.abi, beaconArtifact.bytecode, wallet);
    const beacon = await beaconFactory.deploy(record.vaultImplementation, wallet.address);
    await beacon.waitForDeployment();
    record.beacon = await beacon.getAddress();
    record.beaconTx = beacon.deploymentTransaction().hash;
    await registry.save(DOC, { beacon: record.beacon, beaconTx: record.beaconTx });
    console.log('[proxies] beacon ' + record.beacon);
  }

  if (!record.factory) {
    const impl = await deployImplementation(wallet, 'VaultFactory');
    const deployed = await deployProxy(wallet, impl, 'initialize', [agent, usdc, record.beacon]);
    record.factory = deployed.address;
    record.factoryImplementation = deployed.implementation;
    record.factoryTx = deployed.txHash;
    await registry.save(DOC, {
      factory: record.factory,
      factoryImplementation: record.factoryImplementation,
      factoryTx: record.factoryTx,
    });
    console.log('[proxies] VaultFactory ' + record.factory);
  }
}

async function deployBaseExecutor(record) {
  if (record.baseExecutor || record.baseExecutorSkipped) return;
  const chain = getChain('base');
  const provider = getProvider('base');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);
  if (balance < ethers.parseEther('0.0004')) {
    record.baseExecutorSkipped = wallet.address + ' has ' + ethers.formatEther(balance) + ' ETH on Base Sepolia';
    await registry.save(DOC, { baseExecutorSkipped: record.baseExecutorSkipped });
    return;
  }
  const impl = await deployImplementation(wallet, 'SwapExecutor');
  const deployed = await deployProxy(wallet, impl, 'initialize', [wallet.address, chain.stable.address, chain.swapRouter]);
  record.baseExecutor = deployed.address;
  record.baseExecutorImplementation = deployed.implementation;
  record.baseExecutorTx = deployed.txHash;
  await registry.save(DOC, {
    baseExecutor: record.baseExecutor,
    baseExecutorImplementation: record.baseExecutorImplementation,
    baseExecutorTx: record.baseExecutorTx,
  });
  const current = (await registry.load('base')) || {};
  if (current.vault) {
    await registry.save('base', {
      executor: record.baseExecutor,
      executorImplementation: record.baseExecutorImplementation,
      executorUpgradeKind: 'proxy',
    });
  }
  console.log('[proxies] Base SwapExecutor ' + record.baseExecutor);
}

async function runDeploy() {
  if (process.env.DEPLOY_PROXIES === '0') {
    return registry.remember(DOC, { status: 'disabled' });
  }
  if (!process.env.PRIVATE_KEY) {
    return registry.remember(DOC, { status: 'skipped', reason: 'PRIVATE_KEY is not set' });
  }
  if (!registry.firebaseReady()) {
    return registry.remember(DOC, { status: 'skipped', reason: 'Firestore is not configured' });
  }

  const existing = await hydrateProxies();
  if (existing && existing.status === 'deployed' && existing.pool && existing.vault && existing.factory && existing.decisionLog) {
    console.log('[proxies] using ' + existing.pool);
    return existing;
  }

  let claim;
  try {
    claim = await registry.claim(DOC);
  } catch (err) {
    return registry.remember(DOC, { status: 'skipped', reason: 'Could not lock the deploy: ' + redact(err) });
  }
  if (!claim.won) {
    const stored = await hydrateProxies();
    console.log('[proxies] deploy already running or finished');
    return stored;
  }

  const provider = getProvider('arc');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const record = { ...(await registry.load(DOC) || {}), deployer: wallet.address, agent: wallet.address };
  try {
    const balance = await provider.getBalance(wallet.address);
    console.log('[proxies] deployer ' + wallet.address + ' arc ' + ethers.formatEther(balance));
    if (balance < ethers.parseEther('0.02')) {
      const reason = wallet.address + ' has ' + ethers.formatEther(balance) + ' native USDC on Arc. Need at least 0.02 to deploy.';
      console.log('[proxies] ' + reason);
      return registry.save(DOC, { status: 'no-gas', deployer: wallet.address, reason });
    }
    await deployArc(wallet, record);
    await deployBaseExecutor(record);
    const done = await registry.save(DOC, {
      status: 'deployed',
      vault: record.vault,
      executor: record.baseExecutor || null,
      executorSkipped: !record.baseExecutor,
      pool: record.pool,
      poolImplementation: record.poolImplementation,
      decisionLog: record.decisionLog,
      decisionImplementation: record.decisionImplementation,
      factory: record.factory,
      factoryImplementation: record.factoryImplementation,
      beacon: record.beacon,
      vaultImplementation: record.vaultImplementation,
      baseExecutor: record.baseExecutor || null,
      baseExecutorImplementation: record.baseExecutorImplementation || null,
      baseExecutorSkipped: record.baseExecutorSkipped || null,
      deployer: wallet.address,
      agent: wallet.address,
      chainId: 5042002,
      deployedAt: new Date().toISOString(),
      reason: 'Base and Robinhood vaults already hold funds, so those addresses were left in place.',
    });
    apply(done);
    return done;
  } catch (err) {
    const reason = redact(err);
    console.error('[proxies] deploy failed:', reason);
    return registry.save(DOC, { status: 'failed', deployer: wallet.address, reason, failedAt: new Date().toISOString() });
  }
}

let running = false;
let timer = null;

async function hasRequestGuard(provider, address) {
  const probe = new ethers.Contract(address, ['function executedRequests(bytes32) view returns (bool)'], provider);
  try {
    await probe.executedRequests(ethers.ZeroHash);
    return true;
  } catch (err) {
    if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT' || err.code === 'SERVER_ERROR') throw err;
    return false;
  }
}

// The live Arc vault is a proxy. This swaps in the build that rejects a
// repeated request id, without changing the vault address.
async function ensureRequestGuard(record) {
  if (!record || record.requestGuard || !record.vault || !record.beacon || !process.env.PRIVATE_KEY) return record;
  const provider = getProvider('arc');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const vaultReady = await hasRequestGuard(provider, record.vault);
  const beacon = new ethers.Contract(record.beacon, [
    'function implementation() view returns (address)',
    'function owner() view returns (address)',
    'function upgradeTo(address)',
  ], wallet);
  const beaconReady = await hasRequestGuard(provider, await beacon.implementation());
  if (vaultReady && beaconReady) {
    return registry.save(DOC, { requestGuard: true, requestGuardError: null });
  }

  console.log('[proxies] upgrading AgentVault so a request id cannot pay twice');
  const implementation = await deployImplementation(wallet, 'AgentVault');
  const next = await implementation.getAddress();
  if (!vaultReady) {
    const vault = new ethers.Contract(record.vault, [
      'function owner() view returns (address)',
      'function agent() view returns (address)',
      'function upgradeTo(address)',
    ], wallet);
    const owner = await vault.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('Vault owner is ' + owner + '. This key cannot upgrade it.');
    }
    const agentBefore = await vault.agent();
    const tx = await vault.upgradeTo(next);
    await tx.wait();
    const agentAfter = await vault.agent();
    if (agentAfter.toLowerCase() !== agentBefore.toLowerCase()) {
      throw new Error('Vault agent changed during the upgrade');
    }
  }
  if (!beaconReady) {
    const owner = await beacon.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('Beacon owner is ' + owner + '. This key cannot upgrade it.');
    }
    const tx = await beacon.upgradeTo(next);
    await tx.wait();
  }
  if (!(await hasRequestGuard(provider, record.vault))) {
    throw new Error('Vault upgrade did not expose executedRequests');
  }
  const saved = await registry.save(DOC, { requestGuard: true, vaultImplementation: next, requestGuardError: null });
  apply(saved);
  console.log('[proxies] request guard live');
  return saved;
}

// The Base and Robinhood vaults were deployed before proxies existed.
// Test balances stay on the old addresses. The app follows the new proxy.
async function replaceLegacyVault(chainKey) {
  const chain = getChain(chainKey);
  const provider = getProvider(chainKey);
  const stored = (await registry.load(chainKey)) || {};
  if (stored.vault && await hasRequestGuard(provider, stored.vault)) {
    process.env['VAULT_ADDRESS_' + chain.id.toUpperCase()] = stored.vault;
    return stored;
  }
  if (!stored.vault) return stored;
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);
  if (balance < ethers.parseEther('0.0003')) {
    const reason = wallet.address + ' has ' + ethers.formatEther(balance) + ' ' + chain.gasSymbol + ' on ' + chain.name + '. Not enough to replace the vault.';
    await registry.save(chainKey, { replaceError: reason });
    throw new Error(reason);
  }
  const { deployUpgradeable } = require('./bootstrapBase');
  const deployed = await deployUpgradeable(wallet, 'AgentVault', [wallet.address, chain.stable.address]);
  if (!(await hasRequestGuard(provider, deployed.address))) {
    throw new Error(chain.name + ' replacement is missing the request guard');
  }
  const token = await new ethers.Contract(deployed.address, ['function usdc() view returns (address)', 'function agent() view returns (address)'], provider);
  const usdc = await token.usdc();
  if (usdc.toLowerCase() !== chain.stable.address.toLowerCase()) {
    throw new Error(chain.name + ' replacement holds the wrong token');
  }
  const saved = await registry.save(chainKey, {
    status: 'deployed',
    vault: deployed.address,
    vaultTx: deployed.txHash,
    vaultImplementation: deployed.implementation,
    upgradeKind: 'proxy',
    previousVault: stored.vault,
    agent: await token.agent(),
    chainId: chain.chainId,
    token: chain.stable.address,
    tokenSymbol: chain.stable.symbol,
    replacedAt: new Date().toISOString(),
    replaceError: null,
    reason: 'Old vault was not upgradeable. Test balances were left there and can be minted again.',
  });
  process.env['VAULT_ADDRESS_' + chain.id.toUpperCase()] = deployed.address;
  console.log('[proxies] replaced ' + chainKey + ' ' + stored.vault + ' -> ' + deployed.address);
  return saved;
}

async function replaceLegacyVaults(record) {
  if (record && record.legacyVaultsReplaced) return record;
  const errors = [];
  let base = null;
  let hood = null;
  try {
    base = await replaceLegacyVault('base');
  } catch (err) {
    errors.push(redact(err));
  }
  try {
    hood = await replaceLegacyVault('robinhood-testnet');
  } catch (err) {
    errors.push(redact(err));
  }
  if (errors.length || !base || !base.vault || !hood || !hood.vault) {
    return registry.save(DOC, { legacyReplaceError: errors.join(' | ') || 'replacement did not finish' });
  }
  return registry.save(DOC, {
    legacyVaultsReplaced: true,
    baseVault: base.vault,
    robinhoodVault: hood.vault,
    legacyReplaceError: null,
    reason: 'Base and Robinhood vaults are proxies. Old test balances were left on the previous contracts and can be minted again.',
  });
}

function watchProxies() {
  if (running) return;
  running = true;
  runDeploy()
    .then(async (record) => {
      if (record && record.status === 'deployed') {
        try {
          record = await ensureRequestGuard(record);
          record = await replaceLegacyVaults(record);
        } catch (err) {
          const reason = redact(err);
          console.error('[proxies] request guard upgrade failed:', reason);
          record = await registry.save(DOC, { requestGuardError: reason });
        }
      }
      if (record && record.status === 'deployed' && record.requestGuard && record.legacyVaultsReplaced && !record.requestGuardError && !record.legacyReplaceError) return;
      if (record && (record.status === 'disabled' || record.status === 'no-gas')) return;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          watchProxies();
        }, 10 * 60 * 1000);
      }
    })
    .catch((err) => {
      console.error('[proxies] bootstrap failed:', redact(err));
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          watchProxies();
        }, 10 * 60 * 1000);
      }
    })
    .finally(() => {
      running = false;
    });
}

module.exports = { watchProxies, hydrateProxies, apply };
