# Morningstar Credentials

Morningstar Credentials is a full-stack academic credentialing platform that combines W3C Verifiable Credentials, DID lifecycle management, governance workflows, and blockchain-backed issuance/verification flows.

## Current Workspace Baseline (February 26, 2026)

Validated in this workspace:

- `npm run typecheck`: pass
- `npm test`: pass (`352/352`)
- `npm run test:coverage:strict`: pass (`352/352`, coverage provider enforced)
- `npm run build:check-warnings`: pass
- `npm run audit:all` (network-enabled): pass (`0` moderate+ vulnerabilities in frontend and backend)

CI workflow jobs in `.github/workflows/ci.yml`:

- TypeScript Check
- Unit Tests
- Test Coverage
- Security Audit
- Production Build
- Deploy to GitHub Pages (main branch only)
- Docker Build (main branch only)

## Architecture

- Frontend: React + Vite (`src/`)
- Backend API: Express (`backend/server.js`)
- Persistence: JSON files in `backend/data/`
- Auth model: user session tokens + role checks (`guest`, `student`, `verifier`, `issuer`, `governance`)
- External providers (optional by endpoint): Gemini, Pinata, SMTP, Turnstile

### Auth model (current)

Protected write endpoints now require user access tokens and role authorization.

Flow:

1. `POST /api/auth/session/start`
2. `POST /api/auth/session/bind-wallet`
3. `POST /api/auth/session/refresh` (when needed)
4. `POST /api/auth/role/request`
5. Governance approval via `POST /api/auth/role/approve` or bootstrap allowlist via `GOVERNANCE_BOOTSTRAP_WALLETS`

Legacy static API bearer token model is no longer the active write-route authorization pattern.

## One-Line Setup

### Local dev (frontend + backend)

```bash
npm run setup && npm run dev:all
```

What this does:

- Creates `.env.local` from `.env.example` if missing
- Creates `backend/.env` from `backend/.env.example` if missing
- Adds safe local defaults (including `VITE_API_PROXY_URL` and `ALLOWED_ORIGINS`)
- Installs root and backend dependencies
- Starts backend (`:3001`) and frontend (`:3000` by default)

### Docker dev/prod-style

```bash
npm run setup:docker && npm run docker:up
```

Stop containers:

```bash
npm run docker:down
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (only for Docker workflow)

## Environment Configuration

### Frontend (`.env.local`)

Source of truth: `.env.example`.

Minimum recommended:

- `VITE_API_PROXY_URL=http://localhost:3001`
- `VITE_APP_URL=http://localhost:3000`
- `VITE_REOWN_PROJECT_ID=<walletconnect/reown project id>`

Production frontend should avoid direct API keys and use backend proxy endpoints.

### Backend (`backend/.env`)

Source of truth: `backend/.env.example`.

Minimum recommended for local:

- `AUTH_TOKEN_SECRET=<strong-random-secret>`
- `EMAIL_TRANSPORT_MODE=mock`
- `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`

For governance bootstrap in local/admin setup:

- `GOVERNANCE_BOOTSTRAP_WALLETS=0x...`

For production external API features:

- `GEMINI_API_KEY`
- `PINATA_API_KEY`
- `PINATA_SECRET_KEY`
- SMTP values when `EMAIL_TRANSPORT_MODE=smtp`

## Common Commands

### Root

```bash
npm run dev                  # frontend only
npm run dev:all              # backend + frontend
npm run build
npm run preview
npm run typecheck
npm test
npm run test:coverage
npm run test:coverage:strict
npm run build:check-warnings
npm run audit:all
```

### Backend

```bash
cd backend
npm start
npm run dev
```

## API Overview

### Health and diagnostics

- `GET /api/health`
- `GET /health`
- `GET /api/email/health`

### Auth and roles

- `POST /api/auth/session/start`
- `POST /api/auth/session/bind-wallet`
- `POST /api/auth/session/refresh`
- `POST /api/auth/session/logout`
- `GET /api/auth/session/me`
- `POST /api/auth/student/email/start`
- `POST /api/auth/student/email/verify`
- `POST /api/auth/role/request`
- `GET /api/auth/role/requests` (governance)
- `POST /api/auth/role/approve` (governance)

### Governance, DID, blockchain, email

- `GET/POST/PATCH /api/governance/institutions*` (`POST/PATCH` require governance role)
- `GET /api/did`
- `GET /api/did/:did`
- `POST/PUT/DELETE /api/did*` (issuer or governance)
- `POST /api/blockchain/transaction` (issuer or governance)
- `POST /api/blockchain/block` (governance)
- `POST /api/blockchain/private/store` (issuer or governance)
- `POST /api/email/notify` (issuer or governance)
- `POST /api/mfa/send-otp` (issuer or governance)

### External proxy endpoints

- `POST /api/gemini/schema`
- `POST /api/gemini/trust`
- `POST /api/ipfs/upload`
- `POST /api/ipfs/pin`

## Verification Scripts

```bash
node scripts/verify-base58.js
API_AUTH_TOKEN=<user-access-token> node scripts/verify-blockchain.js
API_AUTH_TOKEN=<user-access-token> node scripts/verify-did.js
```

## Security Notes

- Dependency audit is enforced at `moderate+` severity in CI.
- `package-lock.json` pins patched dependency resolutions for known advisories (`bn.js`, `rollup`).
- CORS, rate limiting, role guards, OTP, and optional Turnstile are enforced server-side.
- In local offline environments, `npm run audit:all` may report connectivity-tolerated skips; CI treats connectivity failures as blocking.

## Known Limitations

- Backend persistence is file-based (`backend/data/*.json`), so multi-instance production needs shared persistent storage.
- `test:coverage:strict` currently enforces coverage provider availability, not minimum percentage thresholds.
- Large client chunks still exist for wallet/veramo/reown bundles; functional but optimization headroom remains.

## Project Structure

```text
.
|- src/                    # frontend app and services
|- backend/                # express API proxy/server
|- scripts/                # setup, audit, validation utilities
|- tests/                  # vitest suites
|- docker-compose.yml      # frontend + backend containers
`- .github/workflows/      # CI/CD
```

## License

See repository license metadata and `package.json` for dependency licensing context.
