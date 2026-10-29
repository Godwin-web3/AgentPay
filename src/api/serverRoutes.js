const { createRequest, getRequest, shareRequest, listRequests } = require('./paymentRequests');
const { getAdaptersFor } = require('../adapters');

// Minimal route handlers. Mount these in your existing Express/server.js.
// None of these move funds. Settlement still requires AgentVault.

function setupRoutes(app) {
  app.post('/api/payment-requests', (req, res) => {
    try {
      const result = createRequest(req.body);
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
    res.json(r);
  });

  app.post('/api/payment-requests/:id/share', (req, res) => {
    const r = shareRequest(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json(r);
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
