const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployProxied } = require('./deployProxy');

describe('PoolVault — authorization and objection-window hardening', function () {
  let usdc, pool, owner, agent, founder, mike, sarah, outsider, vendor;
  const defaultConstitution = {
    discretionaryThreshold: ethers.parseUnits('50', 6),
    objectionWindow: 4 * 60 * 60,
    maxSingleProposal: ethers.parseUnits('1000', 6),
  };
  const types = {
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

  beforeEach(async function () {
    [owner, agent, founder, mike, sarah, outsider, vendor] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    pool = await deployProxied('PoolVault', [agent.address, await usdc.getAddress()]);
    for (const signer of [founder, mike, sarah]) {
      await usdc.mint(signer.address, ethers.parseUnits('3000', 6));
      await usdc.connect(signer).approve(await pool.getAddress(), ethers.parseUnits('3000', 6));
    }
  });

  async function createPool() {
    const tx = await pool.connect(founder).createPool([mike.address, sarah.address], defaultConstitution);
    const receipt = await tx.wait();
    const event = receipt.logs.map(l => { try { return pool.interface.parseLog(l); } catch { return null; } })
      .find(e => e && e.name === 'PoolCreated');
    return event.args.poolId;
  }

  async function authorize(signer, poolId, kind, fields = {}, deadline) {
    if (deadline === undefined) deadline = (await ethers.provider.getBlock('latest')).timestamp + 3600;
    const nonce = await pool.proposalNonces(poolId, signer.address);
    const value = {
      poolId, proposer: signer.address, kind,
      to: fields.to || ethers.ZeroAddress,
      amount: fields.amount || 0n,
      reasonHash: fields.reasonHash || ethers.ZeroHash,
      discretionaryThreshold: fields.discretionaryThreshold || 0n,
      objectionWindow: fields.objectionWindow || 0n,
      maxSingleProposal: fields.maxSingleProposal || 0n,
      targetMember: fields.targetMember || ethers.ZeroAddress,
      nonce, deadline,
    };
    const network = await ethers.provider.getNetwork();
    const signature = await signer.signTypedData(
      { name: 'PoolVault', version: '1', chainId: network.chainId, verifyingContract: await pool.getAddress() },
      types, value
    );
    return { deadline, signature };
  }

  async function proposeSpend(poolId, signer, to, amount, reason) {
    const auth = await authorize(signer, poolId, 0, {
      to, amount, reasonHash: ethers.keccak256(ethers.toUtf8Bytes(reason)),
      discretionaryThreshold: defaultConstitution.discretionaryThreshold,
      objectionWindow: defaultConstitution.objectionWindow,
      maxSingleProposal: defaultConstitution.maxSingleProposal,
    });
    return pool.connect(agent).proposeSpend(poolId, signer.address, to, amount, reason, auth.deadline, auth.signature);
  }

  it('requires a member signature and does not execute a spend inside the objection window', async function () {
    const poolId = await createPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    await expect(
      pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address, ethers.parseUnits('30', 6),
        'internet bill', Math.floor(Date.now() / 1000) + 3600, '0x')
    ).to.be.revertedWithCustomError(pool, 'InvalidSignature');
    await expect(proposeSpend(poolId, founder, vendor.address, ethers.parseUnits('30', 6), 'internet bill'))
      .to.emit(pool, 'ProposalCreated');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);
    expect(await pool.proposalNonces(poolId, founder.address)).to.equal(1n);
  });

  it('accepts a signed proposal submitted by the member wallet and still waits', async function () {
    const poolId = await createPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    const amount = ethers.parseUnits('25', 6);
    const reason = 'member-submitted payment';
    const auth = await authorize(founder, poolId, 0, {
      to: vendor.address, amount, reasonHash: ethers.keccak256(ethers.toUtf8Bytes(reason)),
      discretionaryThreshold: defaultConstitution.discretionaryThreshold,
      objectionWindow: defaultConstitution.objectionWindow,
      maxSingleProposal: defaultConstitution.maxSingleProposal,
    });
    await expect(
      pool.connect(founder).proposeSpend(
        poolId, founder.address, vendor.address, amount, reason, auth.deadline, auth.signature
      )
    ).to.emit(pool, 'ProposalCreated');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);
  });

  it('rejects a signature that does not bind the live constitution', async function () {
    const poolId = await createPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    const amount = ethers.parseUnits('20', 6);
    const auth = await authorize(founder, poolId, 0, {
      to: vendor.address, amount, reasonHash: ethers.keccak256(ethers.toUtf8Bytes('rent')),
    });
    await expect(
      pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address, amount, 'rent', auth.deadline, auth.signature)
    ).to.be.revertedWithCustomError(pool, 'InvalidSignature');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);
  });

  it('does not let one member submit a proposal attributed to another member', async function () {
    const poolId = await createPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    await expect(
      pool.connect(mike).proposeSpend(
        poolId, founder.address, vendor.address, ethers.parseUnits('25', 6),
        'forged proposer', 0, '0x'
      )
    ).to.be.revertedWithCustomError(pool, 'NotAgent');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);
  });

  it('binds the signature to recipient, amount, reason, pool, chain and contract', async function () {
    const poolId = await createPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    const auth = await authorize(founder, poolId, 0, {
      to: vendor.address, amount: ethers.parseUnits('20', 6),
      reasonHash: ethers.keccak256(ethers.toUtf8Bytes('rent')),
      discretionaryThreshold: defaultConstitution.discretionaryThreshold,
      objectionWindow: defaultConstitution.objectionWindow,
      maxSingleProposal: defaultConstitution.maxSingleProposal,
    });
    await expect(
      pool.connect(agent).proposeSpend(poolId, founder.address, outsider.address,
        ethers.parseUnits('20', 6), 'rent', auth.deadline, auth.signature)
    ).to.be.revertedWithCustomError(pool, 'InvalidSignature');
    expect(await usdc.balanceOf(outsider.address)).to.equal(0n);
  });

  it('rejects expired signatures without consuming the nonce', async function () {
    const poolId = await createPool();
    const auth = await authorize(founder, poolId, 0, {
      to: vendor.address, amount: ethers.parseUnits('20', 6),
      reasonHash: ethers.keccak256(ethers.toUtf8Bytes('rent')),
      discretionaryThreshold: defaultConstitution.discretionaryThreshold,
      objectionWindow: defaultConstitution.objectionWindow,
      maxSingleProposal: defaultConstitution.maxSingleProposal,
    }, 1);
    await expect(
      pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address,
        ethers.parseUnits('20', 6), 'rent', auth.deadline, auth.signature)
    ).to.be.revertedWithCustomError(pool, 'SignatureExpired');
    expect(await pool.proposalNonces(poolId, founder.address)).to.equal(0n);
  });

  it('does not permit a member to veto after the objection window closes', async function () {
    const poolId = await createPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    const tx = await proposeSpend(poolId, founder, vendor.address, ethers.parseUnits('150', 6), 'groceries');
    const receipt = await tx.wait();
    const parsed = receipt.logs.map(l => { try { return pool.interface.parseLog(l); } catch { return null; } })
      .find(e => e && e.name === 'ProposalCreated');
    const proposalId = parsed.args.proposalId;
    await ethers.provider.send('evm_increaseTime', [defaultConstitution.objectionWindow + 1]);
    await ethers.provider.send('evm_mine');
    await expect(pool.connect(mike).veto(proposalId)).to.be.revertedWithCustomError(pool, 'VetoWindowClosed');
    await expect(pool.connect(agent).resolveProposal(proposalId)).to.emit(pool, 'ProposalResolved');
    expect(await usdc.balanceOf(vendor.address)).to.equal(ethers.parseUnits('150', 6));
  });

  it('allows a member to veto inside the window and permanently blocks resolution', async function () {
    const poolId = await createPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    const tx = await proposeSpend(poolId, founder, vendor.address, ethers.parseUnits('150', 6), 'groceries');
    const receipt = await tx.wait();
    const parsed = receipt.logs.map(l => { try { return pool.interface.parseLog(l); } catch { return null; } })
      .find(e => e && e.name === 'ProposalCreated');
    await expect(pool.connect(mike).veto(parsed.args.proposalId)).to.emit(pool, 'ProposalVetoed');
    await ethers.provider.send('evm_increaseTime', [defaultConstitution.objectionWindow + 1]);
    await ethers.provider.send('evm_mine');
    await expect(pool.connect(agent).resolveProposal(parsed.args.proposalId))
      .to.be.revertedWithCustomError(pool, 'ProposalVetoedError');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);
  });

  it('requires signatures for constitution changes and member removal too', async function () {
    const poolId = await createPool();
    await expect(
      pool.connect(agent).proposeAmendConstitution(poolId, founder.address, defaultConstitution, 9999999999, '0x')
    ).to.be.revertedWithCustomError(pool, 'InvalidSignature');

    const constitutionAuth = await authorize(founder, poolId, 1, {
      discretionaryThreshold: ethers.parseUnits('100', 6),
      objectionWindow: 2 * 60 * 60,
      maxSingleProposal: ethers.parseUnits('500', 6),
    });
    await pool.connect(agent).proposeAmendConstitution(poolId, founder.address, {
      discretionaryThreshold: ethers.parseUnits('100', 6),
      objectionWindow: 2 * 60 * 60,
      maxSingleProposal: ethers.parseUnits('500', 6),
    }, constitutionAuth.deadline, constitutionAuth.signature);

    await pool.connect(mike).acceptInvite(poolId);
    const removalAuth = await authorize(founder, poolId, 2, { targetMember: mike.address });
    await pool.connect(agent).proposeRemoveMember(
      poolId, founder.address, mike.address, removalAuth.deadline, removalAuth.signature
    );
    expect(await pool.proposalNonces(poolId, founder.address)).to.equal(2n);
  });

  it('rejects non-agent proposal relays and non-member vetoes', async function () {
    const poolId = await createPool();
    await expect(
      pool.connect(outsider).proposeSpend(poolId, founder.address, vendor.address, 1, 'x', 9999999999, '0x')
    ).to.be.revertedWithCustomError(pool, 'NotAgent');
    await expect(pool.connect(outsider).veto(999)).to.be.revertedWithCustomError(pool, 'ProposalNotFound');
  });

  it('pauses and resumes a pool through the emergency owner circuit breaker', async function () {
    const poolId = await createPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('10', 6), true);
    await pool.pausePool(poolId);
    await expect(pool.connect(founder).contribute(poolId, 1, true))
      .to.be.revertedWithCustomError(pool, 'PoolPausedError');
    await pool.resumePool(poolId);
    await expect(pool.connect(founder).contribute(poolId, 1, true)).not.to.be.reverted;
  });

  it('freezes the objection window while the pool is paused', async function () {
    const poolId = await createPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    const tx = await proposeSpend(poolId, founder, vendor.address, ethers.parseUnits('80', 6), 'rent');
    const receipt = await tx.wait();
    const proposalId = receipt.logs.map(l => { try { return pool.interface.parseLog(l); } catch { return null; } })
      .find(e => e && e.name === 'ProposalCreated').args.proposalId;
    const before = Number((await pool.getProposal(proposalId)).windowEnds);
    await pool.pausePool(poolId);
    await ethers.provider.send('evm_increaseTime', [Number(defaultConstitution.objectionWindow) + 10]);
    await ethers.provider.send('evm_mine');
    const during = Number((await pool.getProposal(proposalId)).windowEnds);
    expect(during).to.be.greaterThan(before);
    await expect(pool.connect(agent).resolveProposal(proposalId)).to.be.revertedWithCustomError(pool, 'PoolPausedError');
    await expect(pool.connect(mike).veto(proposalId)).to.not.be.reverted;
    await pool.resumePool(poolId);
    await expect(pool.connect(agent).resolveProposal(proposalId)).to.be.revertedWithCustomError(pool, 'ProposalVetoedError');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);
  });

  it('keeps personal balances independently withdrawable while pool is active', async function () {
    const poolId = await createPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(mike).contribute(poolId, ethers.parseUnits('100', 6), false);
    await pool.connect(mike).withdrawPersonal(poolId, ethers.parseUnits('40', 6));
    expect(await pool.personalBalance(poolId, mike.address)).to.equal(ethers.parseUnits('60', 6));
  });

  it('lets a former member withdraw personal funds after leaving', async function () {
    const poolId = await createPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('50', 6), true);
    await pool.connect(mike).contribute(poolId, ethers.parseUnits('100', 6), false);
    await pool.connect(mike).leavePool(poolId);
    expect(await pool.memberStatus(poolId, mike.address)).to.equal(0n);

    const before = await usdc.balanceOf(mike.address);
    await expect(pool.connect(mike).withdrawPersonal(poolId, ethers.parseUnits('100', 6)))
      .to.emit(pool, 'PersonalWithdrawn');
    expect(await pool.personalBalance(poolId, mike.address)).to.equal(0n);
    expect(await usdc.balanceOf(mike.address)).to.equal(before + ethers.parseUnits('100', 6));
    expect((await pool.getPool(poolId)).sharedBalance).to.equal(ethers.parseUnits('50', 6));
  });

  it('lets a removed member withdraw personal funds', async function () {
    const poolId = await createPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(mike).contribute(poolId, ethers.parseUnits('80', 6), false);
    const auth = await authorize(founder, poolId, 2, { targetMember: mike.address });
    const tx = await pool.connect(agent).proposeRemoveMember(
      poolId, founder.address, mike.address, auth.deadline, auth.signature
    );
    const receipt = await tx.wait();
    const proposalId = receipt.logs.map(l => { try { return pool.interface.parseLog(l); } catch { return null; } })
      .find(e => e && e.name === 'ProposalCreated').args.proposalId;
    await ethers.provider.send('evm_increaseTime', [defaultConstitution.objectionWindow + 1]);
    await ethers.provider.send('evm_mine');
    await pool.connect(agent).resolveProposal(proposalId);
    expect(await pool.memberStatus(poolId, mike.address)).to.equal(0n);

    await pool.connect(mike).withdrawPersonal(poolId, ethers.parseUnits('80', 6));
    expect(await pool.personalBalance(poolId, mike.address)).to.equal(0n);
    expect(await usdc.balanceOf(mike.address)).to.equal(ethers.parseUnits('3000', 6));
  });

  it('does not trap personal funds while the pool is paused', async function () {
    const poolId = await createPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(mike).contribute(poolId, ethers.parseUnits('25', 6), false);
    await pool.pausePool(poolId);
    await expect(pool.connect(mike).withdrawPersonal(poolId, ethers.parseUnits('25', 6))).not.to.be.reverted;
    expect(await pool.personalBalance(poolId, mike.address)).to.equal(0n);
  });

  it('hands emergency control to the configured agent and checks it on chain', async function () {
    expect(await pool.owner()).to.equal(owner.address);
    expect(await pool.agent()).to.equal(agent.address);
    const poolId = await createPool();
    await expect(pool.connect(agent).pausePool(poolId)).to.be.revertedWithCustomError(pool, 'NotOwner');

    await expect(pool.connect(owner).transferOwnership(agent.address))
      .to.emit(pool, 'OwnerUpdated')
      .withArgs(agent.address);
    expect(await pool.owner()).to.equal(agent.address);
    expect(await pool.agent()).to.equal(agent.address);

    await pool.connect(agent).pausePool(poolId);
    expect(await pool.isPoolPaused(poolId)).to.equal(true);
    await expect(pool.connect(owner).resumePool(poolId)).to.be.revertedWithCustomError(pool, 'NotOwner');
  });
});
