const { describe, it } = require('node:test');
const assert = require('node:assert');
const { verifySettlement } = require('../src/settlement/verify');

describe('verifySettlement', () => {
  it('returns unverified when inputs are missing', async () => {
    const result = await verifySettlement({ requestId: null, vaultContract: null });
    assert.equal(result.verified, false);
    assert.ok(result.reason);
  });
});
