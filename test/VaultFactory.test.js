const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('VaultFactory — ownership and operator gate', function () {
  let usdc, factory, owner, operator, user, agent, outsider;

  beforeEach(async function () {
    [owner, operator, user, agent, outsider] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const Factory = await ethers.getContractFactory('VaultFactory');
    factory = await Factory.deploy(agent.address, await usdc.getAddress());
    await factory.waitForDeployment();
    await factory.connect(owner).setOperator(operator.address);
  });

  it('createVault assigns vault owner to the caller, not the factory', async function () {
    await factory.connect(user).createVault();
    const vaultAddr = await factory.getVault(user.address);
    const vault = await ethers.getContractAt('AgentVault', vaultAddr);
    expect(await vault.owner()).to.equal(user.address);
    expect(await vault.agent()).to.equal(agent.address);
    expect(await vault.guardian()).to.equal(operator.address);
    expect(await vault.usdc()).to.equal(await usdc.getAddress());
  });

  it('createVaultFor is operator-only and registers under the user', async function () {
    await expect(
      factory.connect(outsider).createVaultFor(user.address)
    ).to.be.revertedWithCustomError(factory, 'NotOperator');

    await factory.connect(operator).createVaultFor(user.address);
    const vaultAddr = await factory.getVault(user.address);
    const vault = await ethers.getContractAt('AgentVault', vaultAddr);
    expect(await vault.owner()).to.equal(user.address);
    expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
  });

  it('rejects a second vault for the same user', async function () {
    await factory.connect(user).createVault();
    await expect(factory.connect(user).createVault()).to.be.revertedWithCustomError(factory, 'VaultExists');
  });
});
