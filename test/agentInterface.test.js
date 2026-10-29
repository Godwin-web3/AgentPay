const { describe, it } = require('node:test');
const assert = require('node:assert');
const { handleAgentIntent } = require('../src/api/agentInterface');

describe('agent interface', () => {
  it('returns proposals for propose action', async () => {
    const result = await handleAgentIntent({
      action: 'propose',
      asset: 'USDC',
      amount: '10',
      to: '0xabc',
      network: 'arc',
    });
    assert.equal(result.type, 'proposals');
    assert.ok(Array.isArray(result.proposals));
  });

  it('returns a payment request without settling', async () => {
    const result = await handleAgentIntent({
      action: 'request_payment',
      to: '0x1',
      amount: '5',
      description: 'test',
    });
    assert.equal(result.type, 'payment_request');
    assert.equal(result.request.state, 'created');
    assert.ok(result.request.id);
  });

  it('rejects unknown action', async () => {
    await assert.rejects(
      () => handleAgentIntent({ action: 'steal' }),
      /unsupported action/
    );
  });
});
