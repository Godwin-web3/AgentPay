# AgentPay Implementation Roadmap

Grounded in the existing AgentVault / DecisionLog boundary and the white paper phases. Each item must keep authorization on-chain.

## Done in this pass

- TECHNICAL_ARCHITECTURE.md maps the five layers to current contracts and code.
- src/adapters/ExecutionAdapter.js + DirectUSDCAdapter.js + registry. Planners can propose; only vault-authorized paths execute.
- src/payments/PaymentRequest.js with explicit lifecycle states. Settlement still requires AgentVault.

## Phase 1 remaining (Core Execution Foundation)

- Smart-account integration beyond current Circle SCA notes.
- Additional EVM network adapters (Base, etc.) that still call an on-chain policy check.
- Transaction monitoring that distinguishes submitted / included / confirmed.
- Settlement verification that matches AgentVault Executed events to PaymentRequest or adapter receipts.

## Phase 2 (Consumer Crypto Interface)

- Frontend payment request creation, shareable link, and receipt view.
- Natural-language transfer that produces a PaymentRequest then routes to vault.
- Balance and history aggregation across connected accounts.

## Phase 3 (Intelligent Asset Operations)

- Swap adapter (DEX or aggregator) that returns a proposal only.
- Cross-network route adapter.
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
