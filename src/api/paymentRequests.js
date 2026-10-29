const { PaymentRequest } = require('../payments');
const { load, save } = require('../payments/store');

let store = load();

function persist() {
  save(store);
}

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
  persist();
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
  persist();
  return req.toJSON();
}

function listRequests() {
  return Array.from(store.values()).map(r => r.toJSON());
}

function updateRequest(id, patch) {
  const req = store.get(id);
  if (!req) return null;
  Object.assign(req, patch);
  persist();
  return req.toJSON();
}

module.exports = { createRequest, getRequest, shareRequest, listRequests, updateRequest };
