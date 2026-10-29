const { createRequest, getRequest, shareRequest, listRequests, updateRequest } = require('./paymentRequests');
const { getAdaptersFor } = require('../adapters');
const { makeShareLink } = require('../payments/links');

// Minimal route handlers. Mount these in your existing Express/server.js.
// None of these move funds. Settlement still requires AgentVault.

function setupRoutes(app) {
  app.post('/api/payment-requests', (req, res) => {
    try {
      const result = createRequest(req.body);
      result.shareLink = makeShareLink(result.id, req.get('origin') || '');
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/payment-requests', (req, res) => {
    res.json(listRequests());
  });

  app.get('/api/payment-requests/:id', (req, res) => {
    const r = getRequest(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    r.shareLink = makeShareLink(r.id, req.get('origin') || '');
    res.json(r);
  });

  app.post('/api/payment-requests/:id/share', (req, res) => {
    const r = shareRequest(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    r.shareLink = makeShareLink(r.id, req.get('origin') || '');
    res.json(r);
  });

  app.post('/api/payment-requests/:id/settle', (req, res) => {
    // Caller must have already verified the vault event off-chain.
    // This only records the outcome.
    const { txHash, requestId } = req.body;
    if (!txHash) return res.status(400).json({ error: 'txHash required' });
    const updated = updateRequest(req.params.id, {
      state: 'settled',
      txHash,
      requestId: requestId || null,
      settledAt: Date.now(),
    });
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });

  app.post('/api/adapters/propose', async (req, res) => {
    const intent = req.body;
    const adapters = getAdaptersFor(intent);
    const proposals = [];
    for (const a of adapters) {
      proposals.push(await a.propose(intent));
    }
    res.json({ proposals });
  });
}

module.exports = { setupRoutes };
