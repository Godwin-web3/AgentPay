# AgentPay Implementation Roadmap

Grounded in the existing AgentVault / DecisionLog boundary and the white paper phases. Each item must keep authorization on-chain.

## Done

- TECHNICAL_ARCHITECTURE.md maps the five layers to current contracts and code.
- src/adapters/: ExecutionAdapter, DirectUSDCAdapter, SwapAdapter, CrossNetworkAdapter, DeFiAdapter, registry, and providers.js stubs.
- src/payments/PaymentRequest.js + file-based store in src/payments/store.js.
- src/settlement/verify.js and src/monitoring/txStatus.js.
- src/api/paymentRequests.js (persistent) and src/api/serverRoutes.js.
- sdk/index.js.
- frontend/src/views/PaymentRequestView.tsx wired to the API.
- test/adapters.test.js for propose paths and request lifecycle.
- INTEGRATION.md with mount instructions.

## Still required for production

- Replace quoteSwap and quoteBridge stubs with real aggregator and bridge HTTP calls.
- Real protocol integration inside DeFiAdapter.
- Mount setupRoutes in the live server process and deploy.
- Shareable link that encodes the request ID and a receipt view after vault execution.
- Concurrent-safe store (database) if multiple processes write.
- External agent interface that accepts structured intents and still enforces vault policy.
- Broader test coverage that includes the verification helper against a local vault.

Every new adapter or workflow must:
1. Call propose() or estimate() only from the planning layer.
2. Require AgentVault (or equivalent) authorization before any fund movement.
3. Commit a decision hash to DecisionLog before execution when the action is AI-derived.
4. Emit a verifiable receipt that can be checked against on-chain events.

The white paper phases are scaffolded and the request store is persistent. Production settlement still happens only inside AgentVault.
