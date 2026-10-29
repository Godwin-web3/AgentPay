# AgentPay Implementation Roadmap

Grounded in the existing AgentVault / DecisionLog boundary and the white paper phases. Each item must keep authorization on-chain.

## Done

- TECHNICAL_ARCHITECTURE.md maps the five layers to current contracts and code.
- src/adapters/: ExecutionAdapter, DirectUSDCAdapter, SwapAdapter, CrossNetworkAdapter, and registry. Planners call propose/estimate only.
- src/payments/PaymentRequest.js with explicit lifecycle states. Settlement still requires AgentVault.
- src/settlement/verify.js matches receipts to AgentVault Executed events.
- src/api/paymentRequests.js basic handlers (in-memory).
- frontend/src/views/PaymentRequestView.tsx skeleton for creating a request.

## Phase 1 remaining (Core Execution Foundation)

- Smart-account integration beyond current Circle SCA notes.
- Wire additional EVM networks into CrossNetworkAdapter with real bridging providers.
- Transaction monitoring that distinguishes submitted / included / confirmed.
- Connect verify.js into the request settlement path.

## Phase 2 remaining (Consumer Crypto Interface)

- Wire PaymentRequestView to the real API and add shareable link + receipt view.
- Natural-language transfer that produces a PaymentRequest then routes to vault.
- Balance and history aggregation across connected accounts.

## Phase 3 remaining (Intelligent Asset Operations)

- Inject a real quote provider into SwapAdapter.
- Fee estimation that is shown before authorization.
- Portfolio intelligence views that read on-chain state, not LLM claims.

## Phase 4 (Financial Automation)

- Extend existing schedules with explicit permission expiry and revocation.
- Conditional workflows that still commit to DecisionLog before any vault call.

## Phase 5 (Developer and Agent Ecosystem)

- Public API surface that exposes propose / authorize / status without raw keys.
- SDK that wraps the adapter registry and PaymentRequest.
- Agent execution interface that accepts structured intents from external agents and still enforces vault policy.

Every new adapter or workflow must:
1. Call propose() or estimate() only from the planning layer.
2. Require AgentVault (or equivalent) authorization before any fund movement.
3. Commit a decision hash to DecisionLog before execution when the action is AI-derived.
4. Emit a verifiable receipt that can be checked against on-chain events.
