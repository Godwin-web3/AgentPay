# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AgentPay is an AI payment agent for the Arc testnet, built for a hackathon. A user talks to an LLM in natural language ("send 0.5 USDC to 0x...", "pay if it rains in London"); the LLM parses that into a structured intent, and the intent is executed against a per-user **AgentVault** smart contract that enforces spending policy (per-tx cap, daily cap, hourly velocity, whitelist) on-chain. The core design split is:

- **Decision (off-chain)**: `src/brain.js` calls Groq (Llama 3.3) to turn free text into a JSON action.
- **Permission (on-chain)**: `contracts/AgentVault.sol` is the sole source of truth for whether a payment is allowed; `src/policyEngine.js` is only an advisory pre-check to avoid burning gas on obviously-rejected payments.

Read `README.md`'s "⚠️ Honest status" section before trusting any other claim in that file — several original claims (verifiable AI inference, gas sponsorship, permissionless triggers) were aspirational and have since been corrected or stubbed. Treat `src/arcAi.js` as a documented stub, not working functionality.

## Commands

Backend (Node/Express, root of repo):
```bash
npm install
node index.js              # starts src/server.js; also starts a CLI loop if DEV_USER_ID is set in .env
```
There is no lint/test/build script for the backend (`npm test` is a stub). There is no test suite in this repo — verify changes manually against the running server.

Frontend (`frontend/`, React + TS + Vite):
```bash
cd frontend
npm install
npm run dev       # vite dev server
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview
```

Smart contracts (compiled with `solc` directly, no Hardhat/Foundry):
```bash
node scripts/compile.js          # compiles contracts/*.sol -> artifacts/*.json (abi + bytecode)
node scripts/deploy.js           # deploys AgentVault, writes artifacts/AgentVault-deployment.json
node scripts/deployFactory.js    # deploys VaultFactory, writes artifacts/VaultFactory-deployment.json
node scripts/verify-vault.js     # sanity-check a deployed vault
```
`src/escrow.js` reads the ABI/address straight out of `artifacts/*.json` at require-time, so after changing a contract you must recompile (and redeploy if the ABI changed) before the backend picks it up.

Cloudflare Worker (edge gateway — see "Two backends" below before touching this):
```bash
npx wrangler deploy
```

## Architecture

### Hybrid stack, but really two backends

- **`src/server.js`** (Express, deployed to Render per `render.yaml`) is the real backend. It owns wallet creation, chat, policy, vault reads/writes, scheduling, and the job-escrow marketplace. All routes are defined here (`app.get/post/delete(...)` near the bottom of the file).
- **`worker.js`** (Cloudflare Worker, deployed via `wrangler.toml`) is a second, independent implementation of a subset of the same routes (`/health`, `/chat`, `/policy`, `/pay`, `/balance`) plus a `scheduled()` cron handler for on-chain schedules. It duplicates logic rather than proxying to `src/server.js`, and it still uses 18-decimal `ethers.parseEther`/`formatEther` for USDC amounts — inconsistent with the 6-decimal convention the rest of the codebase standardized on via `utils/usdc.js`. The frontend's `WORKER_URL` (`frontend/src/api.ts`) defaults straight to the Render URL, **not** the Worker, so in the current deployment the Worker is effectively a parallel/legacy path, not something requests flow through. Don't assume changes to `src/server.js` are mirrored in `worker.js`, and don't assume the Worker is exercised by the live frontend.
- Frontend (`frontend/`) is a Vite/React SPA that talks directly to the Render backend via `frontend/src/api.ts`.

### Money flow (per payment)

1. User message → `src/brain.js` (`parseIntent`) → structured JSON action (`pay`, `schedule`, `hire_agent`, `update_policy`, `deposit`, `fetch_and_pay`, `balance`, `history`, `policy`, `chat`).
2. `src/agent.js` executes the action:
   - `pay()`: advisory check via `PolicyEngine.check()` (in-process, file-backed policy — see below), then builds an EIP-712 `executeWithSig` payload (`src/escrow.js: signExecute`) signed by the operator key and submits it to the user's `AgentVault` (`executePaymentWithSig`). Direct wallet-to-wallet transfer (`walletService.sendUSDC`) is **not** in this path anymore — it's reserved for x402 facilitation where no vault exists for the payee.
   - `fetchAndPay()`: same advisory check, then pays via x402 (`src/x402Client.js`) for the resource.
   - `hireAgent()` / `completeHiredJob()`: ERC-8183-style job escrow via `src/jobService.js` against a fixed `AGENTIC_COMMERCE_CONTRACT` address.
3. `AgentVault.execute`/`executeWithSig` is the **only** authoritative enforcement point: per-tx cap, daily cap, hourly velocity, whitelist, and per-user pause are all checked on-chain (`contracts/AgentVault.sol`). If a vault reverts with a cap/whitelist error, `agent.js` best-effort mirrors it into an on-chain `pauseUser` call so the user's vault stops accepting further attempts until resumed.
4. Every attempt (success or failure) is logged via `src/spendStore.js` (Firestore) for the unified `/history` view.

### Vault contracts

- `contracts/AgentVault.sol`: one vault per user, deployed by `VaultFactory`. Holds the user's USDC balance, policy (`perTxCap`, `dailyCap`, `maxTxPerHour`), whitelist, and on-chain `Schedule[]`. Key entry points: `execute` (agent-signed, direct), `executeWithSig` (EIP-712, user-authorized without exposing a spend key), `multicall`, `createSchedule`/`cancelSchedule`/`executeScheduled` (agent-only), `pauseUser`/`resumeUser` (owner-only circuit breaker), `proposeAgent`/`acceptAgent` (two-step agent-key rotation).
- `contracts/VaultFactory.sol`: `createVault()` deploys a new `AgentVault` for `msg.sender` and records it in `userVaults`. Vault lookups everywhere (`escrow.findVault`, worker.js's `getDynamicVaultAddress`) go through this factory unless `VAULT_ADDRESS` is set in the environment, which forces a single shared vault (used for local/dev single-tenant testing).
- ABIs are duplicated in three places that must be kept in sync by hand when the contract interface changes: `src/escrow.js` (`VAULT_ABI`), `worker.js` (`VAULT_ABI`), and the compiled JSON in `artifacts/`.

### USDC decimals — single source of truth, with one known drift

`utils/usdc.js` (`toUnits`/`fromUnits`, driven by `USDC_DECIMALS`, default 6) is meant to be the only place amount conversions happen, and `src/escrow.js`/`src/walletService.js`/`src/jobService.js` all route through it. `config/network.js` still defaults `usdcDecimals` to 18 and is unused by the conversion helpers — don't treat it as authoritative, and don't reintroduce raw `ethers.parseEther`/`parseUnits` calls outside `utils/usdc.js` (this is exactly the bug class the README's "Honest status" section says was fixed).

### Auth — two independent layers, don't conflate them

- **`APP_API_KEY`** (`src/server.js: checkAuth`): a shared secret required via `x-api-key` or `Authorization: Bearer` on every route *except* an explicit exemption list (`/health`, `/api/stats`, `/api/auth/login`, `/api/me`, `/api/tag/*`, `/api/market/jobs`, `/market-intel`, `/api/jobs/mine`, `/api/agent-stats`). This is meant for Worker↔Render and other privileged callers, not end users. If `APP_API_KEY` is unset, the server logs a loud warning and runs unauthenticated — never rely on that in anything other than local dev.
- **`x-user-id`** (`getUserId()`): the Firebase UID identifying which user's wallet/vault/history to operate on. It's just trusted from the header (tied to a Google Auth session client-side, but spoofable server-side on testnet) — it is a separate concern from `APP_API_KEY` and both can be required on the same request.

### Data layer: Firestore is current, `utils/store.js` is legacy

`src/walletStore.js`, `src/chatStore.js`, `src/spendStore.js`, and `src/scheduler.js` are Firestore-backed (each initializes its own `firebase-admin` app defensively, since module require order isn't guaranteed) and replaced earlier local-JSON-file versions that lost data on every Render redeploy. `utils/store.js` (local `data/spendLog.json`, atomic write) is still used by `src/policyEngine.js` for its advisory today/consecutive-failure counters — meaning the *advisory* rate-limiting resets on redeploy even though the authoritative on-chain policy doesn't. That's expected/acceptable given the advisory check is not the security boundary, but don't "fix" it by silently switching `policyEngine.js` to Firestore without checking whether that's actually wanted.

### Scheduling: two parallel systems

- **Off-chain** (`src/scheduler.js`): Firestore-backed jobs with a `setInterval` ticker per job, driven through the `/schedules` routes. Supports `conditions` (`src/conditions.js`, e.g. `minBalance`, `executeOnce`) and `trigger` (`src/triggers.js` — Pyth price feeds, GitHub PR state, wttr.in weather, or custom JSON conditions). Trigger outcomes are logged but not proven on-chain.
- **On-chain** (`AgentVault.schedules` + `executeScheduled`): created via `/onchain-schedules`, executed by the agent key (server-side polling) or by the Cloudflare Worker's `scheduled()` cron. These are simpler (no trigger/condition support) but tamper-resistant since they live in the vault itself.

Don't assume these two are the same system — a schedule created via `/schedules` will not show up in `/onchain-schedules` and vice versa.

### Frontend

- `frontend/src/api.ts` is the single HTTP client; every call goes to `WORKER_URL` (despite the name, this is the Render backend URL by default) with `x-api-key`/`Authorization` from `VITE_APP_API_KEY` and `x-user-id` from the Firebase UID.
- `frontend/src/contexts/AuthContext.tsx` handles Google sign-in via Firebase client SDK, then POSTs to `/api/auth/login` on the backend to sync/create the user's wallet.
- `frontend/src/App.tsx` is a single-page view switcher (not a router) gated on: landing → login → tag claim (`ClaimTag`) → vault onboarding (`Onboarding`) → main app (`Terminal`, `Schedules`, `History`, `Profile`/account, `Policy`, `Jobs`, `Agent` views). View state persists to `localStorage`, not URL routes.

### Repo hygiene note

The repo root has ~80 `patch_*.py` scripts and several `scan_*.js`/`check_*.js`/`filter_*.js` utility scripts. These are one-off, already-applied find-and-replace or investigation scripts from earlier development sessions (e.g. `patch_landing_theme.py` does string substitutions in `frontend/src/views/Landing.tsx`), not a build/tooling system and not meant to be re-run. Don't treat them as documentation of current behavior — read the actual source files they touched instead.
