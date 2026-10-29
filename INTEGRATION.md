# Integration Notes

## Mount the API routes

In src/server.js, after the last app.get / app.post definitions and before:

```js
const server = require('http').createServer(app);
```

add:

```js
const { setupRoutes } = require('./api/serverRoutes');
setupRoutes(app);
```

Or call mountAgentPayRoutes from src/serverMount.js.

The routes live under /api/payment-requests and /api/adapters/propose.
POST /api/payment-requests/:id/settle only records a txHash after you have already verified the vault event. It does not move funds.

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

Register PayView at the /pay/:id route and ReceiptView where you display settlement status.
Neither component authorizes a transfer.

## Tests

```bash
node --test test/adapters.test.js test/links.test.js test/verify.test.js
```

Existing Hardhat tests for AgentVault and DecisionLog are unchanged.

## Authorization

Every path that settles value still requires AgentVault.execute or executeWithSig.
The new code only proposes, records, or verifies after the fact.
