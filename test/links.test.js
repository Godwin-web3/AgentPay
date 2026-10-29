const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeShareLink, parseShareLink } = require('../src/payments/links');

describe('links', () => {
  it('makes and parses a share link', () => {
    const id = 'abc-123';
    const link = makeShareLink(id, 'https://example.com');
    assert.equal(link, 'https://example.com/pay/abc-123');
    assert.equal(parseShareLink(link), id);
  });

  it('returns null for non-matching url', () => {
    assert.equal(parseShareLink('https://example.com/other'), null);
  });
});
