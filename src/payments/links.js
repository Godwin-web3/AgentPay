/**
 * Shareable link helper
 *
 * Generates a URL that points at a payment request ID.
 * Opening the link does not move funds. The payer still authorizes via AgentVault.
 */

function makeShareLink(requestId, baseUrl = '') {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/pay/${requestId}`;
}

function parseShareLink(url) {
  const match = url.match(/\/pay\/([^/?#]+)/);
  return match ? match[1] : null;
}

module.exports = { makeShareLink, parseShareLink };
