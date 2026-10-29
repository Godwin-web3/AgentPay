/**
 * Startup hook
 *
 * Call this from index.js after the server module is loaded but before listen,
 * or require it early. It attempts to mount the new routes.
 * Safe to call multiple times.
 */

let mounted = false;

function mountIfNeeded(app) {
  if (mounted || !app) return;
  try {
    const { setupRoutes } = require('./api/serverRoutes');
    setupRoutes(app);
    mounted = true;
    console.log('AgentPay payment and agent routes mounted');
  } catch (e) {
    console.error('Failed to mount AgentPay routes:', e.message);
  }
}

module.exports = { mountIfNeeded };
