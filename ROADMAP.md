# AgentPay Implementation Roadmap

Grounded in the existing AgentVault / DecisionLog boundary and the white paper phases. Each item must keep authorization on-chain.

## Done

- TECHNICAL_ARCHITECTURE.md maps the five layers to current contracts and code.
- src/adapters/: ExecutionAdapter, DirectUSDCAdapter, SwapAdapter, CrossNetworkAdapter, DeFiAdapter, and registry. Planners call propose/estimate only.
- src/payments/PaymentRequest.js with explicit lifecycle states. Settlement still requires AgentVault.
- src/settlement/verify.js matches receipts to AgentVault Executed events.
- src/api/paymentRequests.js and src/api/serverRoutes.js (Express-style handlers).
- src/monitoring/txStatus.js distinguishes submitted / included / confirmed.
- sdk/index.js minimal client for propose() and PaymentRequest creation.
- frontend/src/views/PaymentRequestView.tsx wired to the API endpoints.

## Still required for production

- Persistent store for payment requests (current is in-memory).
- Real quote provider injected into SwapAdapter.
- Real bridge provider for CrossNetworkAdapter.
- Real DeFi protocol integration inside DeFiAdapter (currently stub with risk notes).
- Mount setupRoutes in the existing server.js and deploy.
- Shareable link generation that encodes the request ID.
- Full frontend routing and receipt display after vault execution.
- External agent interface that accepts structured intents and still enforces vault policy.
- Tests covering the new adapters and verification helper.

Every new adapter or workflow must:
1. Call propose() or estimate() only from the planning layer.
2. Require AgentVault (or equivalent) authorization before any fund movement.
3. Commit a decision hash to DecisionLog before execution when the action is AI-derived.
4. Emit a verifiable receipt that can be checked against on-chain events.

The white paper phases are now scaffolded. Production use still requires wiring real providers and persistent storage while keeping the vault as the only authorization path.
