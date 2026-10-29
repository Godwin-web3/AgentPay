/**
 * Example mount
 *
 * Copy the relevant lines into your existing server.js / index.js
 * after the Express app is created.
 *
 * This file is not required at runtime. It documents the integration point.
 */

const { setupRoutes } = require('./api/serverRoutes');

function mountAgentPayRoutes(app) {
  setupRoutes(app);
  console.log('AgentPay routes mounted at /api/payment-requests and /api/adapters/propose');
}

module.exports = { mountAgentPayRoutes };
