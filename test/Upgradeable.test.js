const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployProxied } = require('./deployProxy');

const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

describe('upgradeable proxies', function () {
  it('keeps PoolVault state when the logic is replaced', async function () {
    const [owner, agent, founder] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const usdc = await MockUSDC.deploy();
    const pool = await deployProxied('PoolVault', [agent.address, await usdc.getAddress()]);
    const constitution = {
      discretionaryThreshold: ethers.parseUnits('50', 6),
      objectionWindow: 3600,
      maxSingleProposal: ethers.parseUnits('1000', 6),
    };
    await pool.connect(founder).createPool([], constitution);
    expect((await pool.getPool(1)).founder).to.equal(founder.address);

    const before = await ethers.provider.getStorage(await pool.getAddress(), IMPL_SLOT);
    const Factory = await ethers.getContractFactory('PoolVault');
    const next = await Factory.deploy();
    await next.waitForDeployment();
    await expect(pool.connect(agent).upgradeTo(await next.getAddress())).to.be.revertedWithCustomError(pool, 'NotUpgradeOwner');
    await pool.connect(owner).transferOwnership(agent.address);
    expect(await pool.owner()).to.equal(agent.address);
    expect(await pool.upgradeAdmin()).to.equal(owner.address);
    await expect(pool.connect(agent).upgradeTo(await next.getAddress())).to.be.revertedWithCustomError(pool, 'NotUpgradeOwner');
    const Bad = await ethers.getContractFactory('BadImplementation');
    const bad = await Bad.deploy();
    await bad.waitForDeployment();
    await expect(pool.connect(owner).upgradeTo(await bad.getAddress())).to.be.revertedWithCustomError(pool, 'InvalidImplementation');
    await pool.connect(owner).upgradeTo(await next.getAddress());
    const after = await ethers.provider.getStorage(await pool.getAddress(), IMPL_SLOT);
    expect(after).to.not.equal(before);
    expect((await pool.getPool(1)).founder).to.equal(founder.address);
    expect(await pool.agent()).to.equal(agent.address);
    await expect(pool.initialize(agent.address, await usdc.getAddress())).to.be.revertedWithCustomError(pool, 'AlreadyInitialized');
    await expect(next.initialize(agent.address, await usdc.getAddress())).to.be.revertedWithCustomError(next, 'AlreadyInitialized');
  });

  it('upgrades every user vault from one beacon', async function () {
    const [owner, agent, alice, bob] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const usdc = await MockUSDC.deploy();
    const Impl = await ethers.getContractFactory('AgentVault');
    const impl = await Impl.deploy();
    await impl.waitForDeployment();
    const Beacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await Beacon.deploy(await impl.getAddress(), owner.address);
    const Factory = await ethers.getContractFactory('VaultFactory');
    const factory = await deployProxied('VaultFactory', [agent.address, await usdc.getAddress(), await beacon.getAddress()]);

    await factory.connect(alice).createVault();
    await factory.connect(bob).createVault();
    const aliceVault = Impl.attach(await factory.getVault(alice.address));
    const bobVault = Impl.attach(await factory.getVault(bob.address));
    expect(await aliceVault.agent()).to.equal(agent.address);
    expect(await bobVault.usdc()).to.equal(await usdc.getAddress());

    await usdc.mint(alice.address, ethers.parseUnits('10', 6));
    await usdc.connect(alice).approve(await aliceVault.getAddress(), ethers.parseUnits('10', 6));
    await aliceVault.connect(alice).deposit(ethers.parseUnits('10', 6));

    const next = await Impl.deploy();
    await next.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    await ethers.provider.send('hardhat_setBalance', [factoryAddress, '0x3635C9ADC5DEA00000']);
    await ethers.provider.send('hardhat_impersonateAccount', [factoryAddress]);
    const factorySigner = await ethers.getSigner(factoryAddress);
    await expect(aliceVault.connect(factorySigner).upgradeTo(await next.getAddress()))
      .to.be.revertedWithCustomError(aliceVault, 'UseBeacon');
    await ethers.provider.send('hardhat_stopImpersonatingAccount', [factoryAddress]);
    await expect(beacon.connect(agent).upgradeTo(await next.getAddress())).to.be.revertedWithCustomError(beacon, 'NotOwner');
    await beacon.connect(owner).upgradeTo(await next.getAddress());
    expect(await beacon.implementation()).to.equal(await next.getAddress());
    expect(await aliceVault.agent()).to.equal(agent.address);
    expect(await aliceVault.balances(alice.address)).to.equal(ethers.parseUnits('10', 6));
    expect(await bobVault.agent()).to.equal(agent.address);
    expect(await factory.beacon()).to.equal(await beacon.getAddress());
    await expect(aliceVault.initialize(agent.address, await usdc.getAddress())).to.be.revertedWithCustomError(aliceVault, 'AlreadyInitialized');
  });

  it('upgrades a single ERC-1967 AgentVault', async function () {
    const [owner, agent] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const usdc = await MockUSDC.deploy();
    const vault = await deployProxied('AgentVault', [agent.address, await usdc.getAddress()]);
    const Impl = await ethers.getContractFactory('AgentVault');
    const next = await Impl.deploy();
    await next.waitForDeployment();
    await vault.connect(owner).upgradeTo(await next.getAddress());
    expect(await vault.agent()).to.equal(agent.address);
    expect(await vault.usdc()).to.equal(await usdc.getAddress());
  });
});
