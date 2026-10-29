# AgentPay Implementation Roadmap

Grounded in the existing AgentVault / DecisionLog boundary and the white paper phases. Each item must keep authorization on-chain.

## Done

- TECHNICAL_ARCHITECTURE.md maps the five layers to current contracts and code.
- src/adapters/: ExecutionAdapter, DirectUSDCAdapter, SwapAdapter, CrossNetworkAdapter, DeFiAdapter (env-configurable DEFI_QUOTE_URL), registry, and providers.js (env-configurable quote URLs).
- src/payments/PaymentRequest.js + file-based store + links.js for shareable URLs.
- src/settlement/verify.js and src/monitoring/txStatus.js.
- src/api/paymentRequests.js (persistent) and src/api/serverRoutes.js (includes settle endpoint).
- src/serverMount.js example for mounting routes.
- sdk/index.js.
- frontend/src/views/PaymentRequestView.tsx, PayView.tsx, and ReceiptView.tsx.
- test/adapters.test.js, test/links.test.js, and test/verify.test.js.
- INTEGRATION.md with the exact insertion point in src/server.js.

## Still required for production

- Set QUOTE_SWAP_URL, QUOTE_BRIDGE_URL, and DEFI_QUOTE_URL to real endpoints.
- Insert the two lines from INTEGRATION.md into src/server.js and deploy.
- Register PayView and ReceiptView in the frontend router.
- Concurrent-safe store (database) if multiple processes write.
- External agent interface that accepts structured intents and still enforces vault policy.
- Broader test coverage that spins up a local vault and exercises verifySettlement against real Executed events.

Every new adapter or workflow must:
1. Call propose() or estimate() only from the planning layer.
2. Require AgentVault (or equivalent) authorization before any fund movement.
3. Commit a decision hash to DecisionLog before execution when the action is AI-derived.
4. Emit a verifiable receipt that can be checked against on-chain events.

The white paper phases are scaffolded. Providers accept real URLs via environment. The mount point is documented. Settlement still happens only inside AgentVault.
