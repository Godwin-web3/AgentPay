const { PaymentRequest } = require('../payments');

// In-memory store for demo. Replace with persistent store.
const store = new Map();

function createRequest(body) {
  const req = new PaymentRequest({
    from: body.from,
    to: body.to,
    amount: body.amount,
    asset: body.asset || 'USDC',
    network: body.network || 'arc',
    description: body.description || '',
    expiresAt: body.expiresAt || null,
  });
  store.set(req.id, req);
  return req.toJSON();
}

function getRequest(id) {
  const req = store.get(id);
  if (!req) return null;
  return req.toJSON();
}

function shareRequest(id) {
  const req = store.get(id);
  if (!req) return null;
  req.share();
  return req.toJSON();
}

function listRequests() {
  return Array.from(store.values()).map(r => r.toJSON());
}

module.exports = { createRequest, getRequest, shareRequest, listRequests };
