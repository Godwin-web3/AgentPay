# Integration Notes

## Mount the API routes

In your existing server.js (or index.js):

```js
const { setupRoutes } = require('./src/api/serverRoutes');
// after you create the Express app
setupRoutes(app);
```

The routes live under /api/payment-requests and /api/adapters/propose.
They do not move funds.

## Persistent store

Payment requests are written to data/payment-requests.json.
The directory is created on first write.
Replace the file store with a database when you need concurrent access.

## Adapters

SwapAdapter now calls quoteSwap from src/adapters/providers.js.
Replace the body of quoteSwap with a real aggregator HTTP call.
Do the same for quoteBridge when you wire CrossNetworkAdapter.

## Tests

```bash
node --test test/adapters.test.js
```

Existing Hardhat tests for AgentVault and DecisionLog are unchanged.

## Authorization

Every path that settles value still requires AgentVault.execute or executeWithSig.
The new code only proposes, records, or verifies after the fact.
