# Integration Notes

## Mount the API routes

Preferred: apply patches/mount-routes.patch to src/server.js, or insert these two lines immediately before the createServer call:

```js
const { setupRoutes } = require('./api/serverRoutes');
setupRoutes(app);
```

Alternative: require the startup hook early and call it with the Express app instance before listen.

```js
const { mountIfNeeded } = require('./src/startup');
mountIfNeeded(app);
```

The routes live under /api/payment-requests, /api/adapters/propose, and /api/agent/intent.
POST /api/payment-requests/:id/settle only records a txHash after you have already verified the vault event. It does not move funds.
POST /api/agent/intent accepts structured intents from external agents and returns proposals or PaymentRequests without moving funds.

## Persistent store

Payment requests are written to data/payment-requests.json.
The directory is created on first write.
Replace the file store with a database when you need concurrent access.

## Share links

createRequest and getRequest return a shareLink field built by src/payments/links.js.
The link encodes the request ID. Opening it does not authorize a payment.

## Adapters

SwapAdapter and CrossNetworkAdapter call quote functions from src/adapters/providers.js.
DeFiAdapter checks DEFI_QUOTE_URL.
Set QUOTE_SWAP_URL, QUOTE_BRIDGE_URL, or DEFI_QUOTE_URL to real endpoints.
The functions remain side-effect free.

## Frontend

The Requests view is already in the main navigation (frontend/src/App.tsx).

## Tests

```bash
node --test test/adapters.test.js test/links.test.js test/verify.test.js test/agentInterface.test.js
```

Existing Hardhat tests for AgentVault and DecisionLog are unchanged.

## Authorization

Every path that settles value still requires AgentVault.execute or executeWithSig.
The new code only proposes, records, or verifies after the fact.
Firebase auth and stores are unchanged.
