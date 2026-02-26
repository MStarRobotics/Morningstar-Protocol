# Deployment Summary

## Scope

This workspace update focused on four deployment-blocking areas:

- Security audit failures (`bn.js`, `rollup` advisories)
- Write-route authorization migration to session-role auth
- Developer onboarding/setup simplification
- Documentation accuracy and environment normalization

## Completed Changes

### 1. Security dependency remediation

- Added root `overrides` in `package.json`:
  - `bn.js: 5.2.3`
  - `rollup: 4.59.0`
- Regenerated `package-lock.json` with patched resolutions.
- `scripts/security-audit.mjs` now audits at `moderate+` and distinguishes vulnerability failures from connectivity-only failures.

### 2. Backend authorization model update

- Backend write endpoints now enforce user session token + role checks via `requireUserRoles(...)`.
- Added governance bootstrap allowlist support via `GOVERNANCE_BOOTSTRAP_WALLETS`.
- Protected routes include governance, DID writes, blockchain writes, and email/OTP write paths.

### 3. Frontend API auth alignment

- Frontend write calls now use `authService.fetchWithSessionAuth(...)`.
- Removed legacy frontend governance bearer token flow.
- Updated service integrations:
  - `src/services/governanceApi.ts`
  - `src/services/didService.ts`
  - `src/services/blockchainService.ts`
  - `src/services/emailService.ts`

### 4. Setup and operations improvements

- Added one-command setup/start scripts:
  - `scripts/setup-dev.mjs`
  - `scripts/dev-all.mjs`
- Added npm scripts:
  - `setup`, `setup:docker`, `dev:all`, `docker:up`, `docker:down`
- Fixed Docker backend CORS env naming (`ALLOWED_ORIGINS`).

### 5. Reliability fix from quality run

- Fixed a flaky coverage-time timeout in `tests/services/blockchainService.test.ts` by setting an explicit timeout on the multi-issuance stats test.

## Validation Snapshot (February 26, 2026)

Local verification in this workspace:

- `npm run typecheck`: pass
- `npm test`: pass (`352/352`)
- `npm run test:coverage:strict`: pass (`352/352`)
- `npm run build:check-warnings`: pass
- `npm run audit:all` with network: pass (`0` vulnerabilities at `moderate+`)

CI workflow (`.github/workflows/ci.yml`) includes 7 checks:

- TypeScript Check
- Unit Tests
- Test Coverage
- Security Audit
- Production Build
- Deploy to GitHub Pages (main)
- Docker Build (main)

## Deployment Runbook

### Local

```bash
npm run setup && npm run dev:all
```

### Docker

```bash
npm run setup:docker && npm run docker:up
```

### Production build verification

```bash
npm run build:check-warnings
npm run audit:all
```

## Required Production Configuration

Frontend (`.env.local` or platform env vars):

- `VITE_API_PROXY_URL`
- `VITE_APP_URL`
- `VITE_REOWN_PROJECT_ID`

Backend (`backend/.env` or secrets manager):

- `AUTH_TOKEN_SECRET`
- `ALLOWED_ORIGINS`
- `EMAIL_TRANSPORT_MODE`
- `GOVERNANCE_BOOTSTRAP_WALLETS` (if bootstrap governance is desired)
- External API credentials if Gemini/IPFS/SMTP features are enabled

## Remaining Operational Risks

- Backend persistence is JSON-file based; shared DB/storage is required for horizontally scaled production.
- Frontend bundle has large wallet/VC chunks; this is performance debt, not a deployment blocker.
- `test:coverage:strict` enforces coverage provider installation, not coverage percentage thresholds.

## Deployment Decision

Status: ready for controlled deployment (single-instance or managed persistent volume) with current CI gates and updated auth/security configuration.
