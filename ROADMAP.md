# AgentPay Implementation Roadmap

Grounded in the existing AgentVault / DecisionLog boundary and the white paper phases. Each item must keep authorization on-chain.

## Done

- TECHNICAL_ARCHITECTURE.md maps the five layers to current contracts and code.
- src/adapters/: ExecutionAdapter, DirectUSDCAdapter, SwapAdapter, CrossNetworkAdapter, DeFiAdapter (env-configurable DEFI_QUOTE_URL), registry, and providers.js (env-configurable quote URLs).
- src/payments/PaymentRequest.js + file-based store + links.js for shareable URLs.
- src/settlement/verify.js and src/monitoring/txStatus.js.
- src/api/paymentRequests.js (persistent) and src/api/serverRoutes.js (includes settle endpoint and /api/agent/intent).
- src/api/agentInterface.js accepts structured intents and returns proposals or PaymentRequests without moving funds.
- src/serverMount.js and src/startup.js (mountIfNeeded hook).
- src/server.js now calls setupRoutes(app) before listen. The payment, adapter, and agent endpoints are registered.
- sdk/index.js.
- frontend/src/views/PaymentRequestView.tsx, PayView.tsx, and ReceiptView.tsx.
- frontend/src/App.tsx now includes a Requests nav item that renders PaymentRequestView.
- test/adapters.test.js, test/links.test.js, test/verify.test.js, test/verify.integration.test.js, and test/agentInterface.test.js.
- INTEGRATION.md with the exact insertion point, patch file, and startup hook.
- .env.example documents QUOTE_SWAP_URL, QUOTE_BRIDGE_URL, and DEFI_QUOTE_URL.

## Still required for production

- Set the quote URL environment variables to real endpoints if live quotes are needed.
- Concurrent-safe store (database) only if multiple processes will write concurrently.
- Expand the integration test to spin up a local vault and exercise verifySettlement against real Executed events.
- Deploy the updated server so the new routes are live.

Every new adapter or workflow must:
1. Call propose() or estimate() only from the planning layer.
2. Require AgentVault (or equivalent) authorization before any fund movement.
3. Commit a decision hash to DecisionLog before execution when the action is AI-derived.
4. Emit a verifiable receipt that can be checked against on-chain events.

The white paper phases are scaffolded. The Requests view is in the frontend nav. An external agent can submit structured intents. The server now mounts the new routes. Providers accept real URLs via environment. Settlement still happens only inside AgentVault. Firebase remains the existing auth and store path.
