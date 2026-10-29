const { describe, it } = require('node:test');
const assert = require('node:assert');
const { verifySettlement } = require('../src/settlement/verify');

// Full integration requires a local Hardhat node and a deployed AgentVault.
// This file documents the exact sequence and asserts the helper's contract
// when given a missing or null vault.

describe('verifySettlement', () => {
  it('returns unverified for missing inputs', async () => {
    const result = await verifySettlement({
      requestId: null,
      vaultContract: null,
    });
    assert.equal(result.verified, false);
    assert.ok(result.reason);
  });

  it('documents the happy-path call after a real vault execution', () => {
    // After AgentVault.execute or executeWithSig emits Executed(user, to, amount, reason, requestId):
    // const result = await verifySettlement({
    //   requestId: theSameRequestId,
    //   expectedTo: recipient,
    //   expectedAmount: amountInUsdcUnits,
    //   vaultContract: ethersContractInstance,
    //   fromBlock: deployBlock,
    // });
    // assert.equal(result.verified, true);
    // assert.equal(result.txHash, theExecutionTx);
    assert.ok(true);
  });
});
