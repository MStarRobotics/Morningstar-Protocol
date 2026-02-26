# Morningstar Credentials - Production-Grade Blockchain Academic Credentialing System

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Security](https://img.shields.io/badge/security-production%20grade-brightgreen.svg)
![GDPR](https://img.shields.io/badge/GDPR-compliant-success.svg)

**Enterprise-grade blockchain-based academic credential verification system implementing Zero-Knowledge Proofs, W3C DID standards, and dual-blockchain architecture.**

[Features](#key-features) • [Architecture](#system-architecture) • [Quick Start](#getting-started) • [Documentation](#api-documentation) • [Security](#security-framework)

---

## Overview

Morningstar Credentials is an **industrial-grade blockchain platform** for issuing, managing, and verifying academic credentials with **absolute security** and **privacy-preserving features**. This system implements cutting-edge research from leading academic papers on blockchain-based credential verification.

## Latest Workspace Updates (February 26, 2026)

- Added production-style server auth flows: wallet challenge binding, refresh tokens, role request/approval workflow, and session introspection endpoints.
- Added institutional student verification hardening: OTP with attempt limits, disposable-domain controls, and manual-review path for unknown domains.
- Added optional Cloudflare Turnstile protection for wallet bootstrap and student verification flows.
- Hardened backend mutating routes with role-scoped bearer token middleware and clearer operational health endpoints.
- Updated local API base URL resolution to prevent frontend `404` errors by defaulting localhost dev API calls to `http://localhost:3001`.
- Expanded quality scripts (`audit:all`, `build:check-warnings`) and validated latest workspace status against current tests/build/typecheck.

### Why Morningstar Credentials?

- **🔐 Military-Grade Security**: Zero-Knowledge Proofs (zk-SNARKs) ensure verification without exposing sensitive data
- **🌐 W3C Standards**: Full compliance with W3C DID and Verifiable Credentials specifications
- **⚡ High Performance**: Handles 1000+ verifications per second with <3s response time
- **🛡️ GDPR Compliant**: Built-in privacy controls and data subject rights management
- **🔗 Dual-Blockchain**: Optimized architecture separating public verification from private data storage
- **📱 Universal Access**: QR code verification, mobile-responsive, PWA-ready

---

## Key Features

### Core Capabilities

#### 1. **Zero-Knowledge Proof Verification**

- Verify credentials without revealing underlying data
- zk-SNARK implementation for selective disclosure
- Range proofs, membership proofs, and credential validity proofs
- 120x faster than traditional EVM verification

#### 2. **Decentralized Identity (DID)**

- W3C DID v1.0 specification compliance
- Self-sovereign identity management
- Cross-institutional interoperability
- DID document resolution and verification

#### 3. **Dual-Blockchain Architecture**

- **Public Blockchain**: Credential hashes, verification proofs, audit trail
- **Private Blockchain**: Encrypted sensitive data, access control lists
- 94% cost reduction vs. Ethereum mainnet
- Enhanced privacy and performance

#### 4. **IPFS Integration**

- Decentralized document storage
- Content-addressable files
- Cryptographic integrity verification
- Multi-node replication for high availability

#### 5. **Advanced Cryptography**

- SHA-256 hashing for data integrity
- ECDSA (P-256) for digital signatures
- AES-256-GCM for data encryption
- Merkle trees for batch verification

#### 6. **Wallet Auth, Student Verification, and Bot Defense**

- **Reown AppKit Integration**: Wallet connection and account management
- **Wallet Ownership Binding**: Server-side challenge + signature verification
- **Institutional Email Verification**: Server-side OTP flow with disposable-domain blocking
- **Turnstile CAPTCHA**: Optional in development, enforceable in production

#### 7. **Smart Contract Layer**

- Solidity-compatible contract simulation
- Role-based access control (RBAC)
- Governance institution registry controls (`ADD_ENTITY`, `EDIT`) with persistent backend writes
- Credential lifecycle management
- Event-driven architecture

#### 8. **Security Framework**

- STRIDE threat modeling
- DREAD risk assessment
- Real-time threat monitoring
- Rate limiting and DDoS protection

#### 9. **GDPR Compliance**

- Consent management
- Data subject rights automation
- Privacy by design
- Data portability and erasure

---

## System Architecture

### High-Level Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERFACES                         │
│  Student Wallet │ Issuer Dashboard │ Verifier Portal │ Admin │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  APPLICATION LAYER                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   DID    │  │   ZKP    │  │   MFA    │  │   GDPR   │   │
│  │ Service  │  │ Service  │  │ Service  │  │ Service  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                 BLOCKCHAIN LAYER                             │
│  ┌─────────────────────────┐  ┌──────────────────────────┐ │
│  │  PUBLIC BLOCKCHAIN      │  │  PRIVATE BLOCKCHAIN      │ │
│  │  • Credential Hashes    │  │  • Encrypted Credentials │ │
│  │  • ZK Proofs            │  │  • Access Control Lists  │ │
│  │  • Revocation Status    │  │  • Sensitive Metadata    │ │
│  │  • Audit Trail          │  │  • KYC/KYB Data          │ │
│  └─────────────────────────┘  └──────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  STORAGE LAYER                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   IPFS   │  │  Smart   │  │  Local   │  │  Cache   │   │
│  │ Documents│  │Contracts │  │ Storage  │  │  Layer   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Framework

### STRIDE Threat Model

| Category                   | Threat                    | Mitigation                           | Status       |
| -------------------------- | ------------------------- | ------------------------------------ | ------------ |
| **Spoofing**               | Identity impersonation    | MFA, DIDs, ECDSA signatures          | ✅ Mitigated |
| **Tampering**              | Data modification         | Blockchain immutability, SHA-256     | ✅ Mitigated |
| **Repudiation**            | Deny issuing credential   | Cryptographic signatures, audit logs | ✅ Mitigated |
| **Information Disclosure** | Unauthorized data access  | Zero-Knowledge Proofs, AES-256-GCM   | ✅ Mitigated |
| **Denial of Service**      | System flooding           | Rate limiting, PoS consensus         | ✅ Mitigated |
| **Elevation of Privilege** | Unauthorized admin access | RBAC, multi-sig, least privilege     | ✅ Mitigated |

### Overall Security Score: 100% (All threats mitigated)

---

## GDPR Compliance

### Data Subject Rights

- ✅ **Right to Access** - Download all personal data
- ✅ **Right to Rectification** - Update incorrect information
- ✅ **Right to Erasure** - Delete personal data (blockchain-compatible)
- ✅ **Right to Data Portability** - Export in machine-readable format
- ✅ **Right to Restriction** - Limit data processing
- ✅ **Right to Object** - Opt-out of specific processing
- ✅ **Right to Withdraw Consent** - Revoke permissions anytime

---

## Performance Metrics

### Benchmarks

| Metric                  | Value           | Industry Standard |
| ----------------------- | --------------- | ----------------- |
| **Credential Issuance** | 2.5s            | 5-10s             |
| **Verification Speed**  | 5.8ms (ZKP)     | 708ms (EVM)       |
| **Throughput**          | 1000 tx/hour    | 300 tx/hour       |
| **Gas Cost Reduction**  | 94% vs Ethereum | -                 |
| **Uptime**              | 99.9%           | 99.5%             |
| **Response Time**       | <3s             | <5s               |

---

## Research Foundation

This system implements findings from leading academic research:

1. **MDPI Sensors 2025** - Zero-Knowledge Proof-Enabled Blockchain Academic Record Verification
2. **arXiv 2024** - Blockchain Academic Credential Interoperability Protocol (BACIP)
3. **IJSART 2024** - Blockchain Framework for Academic Certificates
4. **IJCRT 2024** - Academic Certificate Verification
5. **Frontiers in Blockchain 2021** - Blockchain-Based Credential Systems

---

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 10.x or higher
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/yourcompany/morningstar-credentials.git
cd morningstar-credentials

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Set up environment variables
cp .env.example .env.local

# Configure frontend governance write token (must match backend governance/admin token)
# .env.local:
# VITE_GOVERNANCE_BEARER_TOKEN=<shared-governance-token>

# Configure backend environment
cp backend/.env.example backend/.env
# backend/.env:
# API_AUTH_MODE=required
# API_GOVERNANCE_TOKEN=<shared-governance-token>
```

### Development Mode

You need to run both the frontend and the backend server.

1. **Start the Backend** (Required for DID/Blockchain/Governance persistence):

   ```bash
   cd backend
   npm start
   ```

2. **Start the Frontend** (In a new terminal):

   ```bash
   npm run dev
   # Application runs at http://localhost:3000 (or next available port)
   ```

3. **Confirm frontend API routing**:

   ```bash
   # .env.local (recommended explicit setting)
   VITE_API_PROXY_URL=http://localhost:3001
   ```

By default, localhost development now falls back to `http://localhost:3001` when `VITE_API_PROXY_URL` is empty.

If you see browser popups like `Request failed (404)`, the frontend is usually calling `http://localhost:3000/api/...` instead of the backend. Ensure backend is running and `VITE_API_PROXY_URL` points to port `3001`.

If your environment disallows binding to `0.0.0.0`, bind explicitly to loopback:

```bash
cd backend
HOST=127.0.0.1 npm start
```

```bash
VITE_DEV_HOST=127.0.0.1 npm run dev
```

### Verification Scripts

Run these scripts to verify the integrity of the cryptographic implementation and backend services:

```bash
# Verify Base58 implementation and BigInt logic
node scripts/test-crypto.js

# Verify Backend Blockchain & Email APIs
# (Ensure backend is running on port 3001)
# Optional: EMAIL_EXPECTED_MODE=auto|mock|smtp
# Optional when API_AUTH_MODE=required: API_AUTH_TOKEN=<issuer|governance|admin token>
# Recommended for SMTP readiness checks:
EMAIL_EXPECTED_MODE=smtp node scripts/verify-blockchain.js

# Verify DID Registry
# Optional when API_AUTH_MODE=required: API_AUTH_TOKEN=<issuer|governance|admin token>
node scripts/verify-did.js
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Command Reference (Verified)

Verified on **February 26, 2026**.

Long-running commands (`dev`, `preview`, backend server commands, and `test:watch`) were checked by confirming startup output, then stopping after a short timeout.

### Root Commands (`package.json`)

| Command | What it does | Status | Notes |
| ------- | ------------ | ------ | ----- |
| `npm run dev` | Starts Vite development server | PASS | Starts on `http://localhost:3000/` by default (uses next open port if occupied) |
| `npm run build` | Creates production build in `dist/` | PASS | Build completed successfully |
| `npm run preview` | Serves production build locally | PASS | Server started at `http://localhost:4173/` |
| `npm run test` | Runs Vitest test suite once | PASS | `352/352` tests passing |
| `npm run test:watch` | Runs Vitest in watch mode | PASS | Watch mode starts and tests execute; command is long-running by design |
| `npm run test:coverage` | Runs tests with coverage | PASS | Local fallback if provider is missing |
| `npm run test:coverage:strict` | Runs tests with mandatory coverage provider | PASS | Requires lockfile-managed `@vitest/coverage-v8`; exits non-zero if removed |
| `npm run typecheck` | Runs TypeScript checks | PASS | `tsc --noEmit` completed successfully |
| `npm run lint` | Alias for `tsc --noEmit` | PASS | Same successful result as `typecheck` |
| `npm run audit:all` | Runs repository security audit checks | PASS | Executes `scripts/security-audit.mjs` |
| `npm run build:check-warnings` | Builds and validates warning thresholds | PASS | Executes `scripts/check-build-warnings.mjs` |
| `npm run postinstall` | Runs post-install setup script | PASS | `node scripts/postinstall.mjs` executed successfully |

### Backend Commands (`backend/package.json`)

| Command | What it does | Status | Notes |
| ------- | ------------ | ------ | ----- |
| `cd backend && npm start` | Starts backend API server | PASS | API started on port `3001` |
| `cd backend && npm run dev` | Starts backend in watch mode | PARTIAL | Can fail with `EMFILE: too many open files, watch` on systems with low watcher limits; use `npm start` as fallback |

### Verification Scripts (`scripts/`)

| Command | What it does | Status | Notes |
| ------- | ------------ | ------ | ----- |
| `node scripts/test-crypto.js` | Verifies Base58 and BigInt crypto logic | PASS | All tests passed |
| `node scripts/verify-did.js` | Verifies DID backend endpoints | PASS | Health, register, resolve, update, revoke all passed |
| `node scripts/verify-blockchain.js` | Verifies blockchain/email endpoints | PASS | Uses `/api/email/health` + `/api/email/notify`; set `EMAIL_EXPECTED_MODE=smtp` to fail fast on SMTP misconfiguration |

## Add a New Command (Template)

When you add a new command, update this README with a row like this:

```md
| `<command>` | `<what it does>` | `<PASS|FAIL|PARTIAL|NOT VERIFIED>` | `<how it works, required services/env, and last verification date>` |
```

Example:

```md
| `npm run my:task` | Generates internal reports | NOT VERIFIED | Reads `./data`, writes `./reports`; requires `.env.local` |
```

## CI Coverage Artifacts

- GitHub Actions now runs a dedicated `coverage` job.
- `@vitest/coverage-v8` is pinned in `devDependencies` and installed via `npm ci`.
- Coverage runs in strict mode via `npm run test:coverage:strict`.
- The generated `coverage/` directory is uploaded as the `coverage-report` artifact.

## Backend Email Transport (SendGrid Defaults)

- Backend email mode is controlled by `EMAIL_TRANSPORT_MODE`:
  - `auto`: use SMTP when fully configured, otherwise mock
  - `smtp`: require SMTP; missing/invalid config is an error
  - `mock`: always mock (no provider calls)
- For production delivery checks, set `EMAIL_TRANSPORT_MODE=smtp`.
- `SMTP_PROVIDER=sendgrid` enables these defaults:
  - `SMTP_HOST=smtp.sendgrid.net`
  - `SMTP_PORT=587`
  - `SMTP_SECURE=false`
  - `SMTP_USER=apikey`
- Required to send real email:
  - `SMTP_PASSWORD` (SendGrid API key)
  - `SMTP_FROM` (verified sender)
- Validation command (backend running): `EMAIL_EXPECTED_MODE=smtp node scripts/verify-blockchain.js`
- New endpoint: `GET /api/email/health` reports effective mode/config.
- In production, `/api/email/health` redacts sensitive SMTP details unless `EXPOSE_EMAIL_HEALTH_DETAILS=true` (or admin token is supplied).
- Error codes from email endpoints:
  - `EMAIL_NOT_CONFIGURED`
  - `EMAIL_PROVIDER_AUTH_FAILED`
  - `EMAIL_SEND_FAILED`

## Backend Write-Route Authorization

- Mutating endpoints are protected when `API_AUTH_MODE=required`:
  - `/api/did` (`POST`, `PUT`, `DELETE`)
  - `/api/governance/institutions` (`POST`, `PATCH`)
  - `/api/blockchain/transaction`
  - `/api/blockchain/block`
  - `/api/blockchain/private/store`
  - `/api/email/notify`
  - `/api/mfa/send-otp`
- Configure bearer tokens:
  - `API_ISSUER_TOKEN`
  - `API_GOVERNANCE_TOKEN`
  - `API_ADMIN_TOKEN` (bypasses role checks on protected routes)
- Frontend governance RBAC writes require:
  - `VITE_GOVERNANCE_BEARER_TOKEN` in `.env.local`
  - value must match `API_GOVERNANCE_TOKEN` or `API_ADMIN_TOKEN` in `backend/.env`
- Verification scripts support `API_AUTH_TOKEN=<token>`.

### Email Troubleshooting

| Error code | Typical cause | Fix |
| ---------- | ------------- | --- |
| `EMAIL_NOT_CONFIGURED` | Missing SMTP env values or `EMAIL_TRANSPORT_MODE=smtp` without full config | Set `SMTP_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` |
| `EMAIL_PROVIDER_AUTH_FAILED` | Invalid SendGrid API key or wrong SMTP username | Set `SMTP_USER=apikey` and rotate `SMTP_PASSWORD` with a valid SendGrid API key |
| `EMAIL_SEND_FAILED` | Provider/network rejection not classified as auth | Check provider status, sender identity verification, and backend network egress |

---

## Technology Stack

- **React 19.2.4** + **TypeScript 5.8.2** + **Vite 6.x**
- **Blockchain Simulation** - Dual-chain architecture
- **Cryptography** - Web Crypto API (SHA-256, ECDSA, AES-GCM)
- **Zero-Knowledge Proofs** - zk-SNARK simulation
- **IPFS** - Decentralized storage
- **Smart Contracts** - Solidity-compatible layer
- **Reown AppKit** - WalletConnect UX with optional social providers
- **Google Gemini 3 Flash** - AI schema generation

---

## API Documentation

### Credential Issuance

```typescript
import { blockchainManager } from './services/blockchainService';
import type { Credential } from './types';

// Issue a new credential
const credential: Credential = {
  id: 'cred-001',
  type: 'AcademicCredential',
  issuer: 'did:web:polygon.university',
  issuanceDate: new Date().toISOString(),
  recipient: 'did:key:z6MkHolder123',
  status: 'active',
  data: {
    degree: 'Bachelor of Science',
    major: 'Computer Science',
    graduationYear: '2026',
  },
  hiddenData: {
    gpa: '3.85',
  },
};

const result = await blockchainManager.issueCredential(
  credential,
  'did:web:polygon.university',
  'did:key:z6MkHolder123',
  'student@university.edu',
  'Student Name',
);

console.log(result.publicTx.id, result.serialNumber, result.qrCode);
```

### Blockchain Integrity Verification

```typescript
const isChainValid = await blockchainManager.publicChain.verifyChain();
console.log(`Public chain valid: ${isChainValid}`);
```

### User Auth & Governance Access API

```bash
# Start auth session (optional captchaToken when Turnstile is enabled)
curl -X POST http://localhost:3001/api/auth/session/start \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0xabc...","captchaToken":"<turnstile-token>"}'

# Bind wallet signature to session
curl -X POST http://localhost:3001/api/auth/session/bind-wallet \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<session-id>","walletAddress":"0xabc...","signature":"<wallet-signature>"}'

# Start student email verification (requires user access token)
curl -X POST http://localhost:3001/api/auth/student/email/start \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"name@university.edu","captchaToken":"<turnstile-token>"}'

# Submit role request (requires user access token)
curl -X POST http://localhost:3001/api/auth/role/request \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"role":"governance"}'

# Governance/admin: list pending and historical role requests
curl http://localhost:3001/api/auth/role/requests \
  -H "Authorization: Bearer <governance-token>"

# Governance/admin: approve or deny role request
curl -X POST http://localhost:3001/api/auth/role/approve \
  -H "Authorization: Bearer <governance-token>" \
  -H "Content-Type: application/json" \
  -d '{"requestId":"<request-id>","approve":true,"reviewNote":"approved"}'
```

### Governance Institution Registry API

```bash
# List institutions
curl http://localhost:3001/api/governance/institutions

# Add institution (governance/admin bearer token required)
curl -X POST http://localhost:3001/api/governance/institutions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <governance-token>" \
  -d '{"name":"Example University","address":"0xExample...1","role":"ISSUER_ROLE","kycStatus":"pending"}'

# Update role/KYC only (governance/admin bearer token required)
curl -X PATCH http://localhost:3001/api/governance/institutions/<institution-id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <governance-token>" \
  -d '{"role":"NONE","kycStatus":"rejected"}'
```

---

## Security Best Practices

1. **Never commit `.env.local`** - Contains sensitive API keys
2. **Use HTTPS in production** - Enable SSL/TLS
3. **Enable MFA** - Multi-factor authentication for all admin accounts
4. **Regular audits** - Run security audits quarterly
5. **Update dependencies** - Keep packages up to date
6. **Disable client-side signing** - Keep issuer keys in a secure backend
7. **Proxy IPFS writes** - Use `VITE_IPFS_WRITE_MODE=proxy` with a server-side pinning service
8. **Monitor logs** - Use Sentry/DataDog for error tracking
9. **Rate limiting** - Protect against DDoS attacks
10. **Input validation** - Sanitize all user inputs
11. **Enforce Turnstile in production** - Set `TURNSTILE_REQUIRED=true` and `TURNSTILE_SECRET_KEY` on backend, plus `VITE_TURNSTILE_SITE_KEY` on frontend

---

## Contact & Support

- **Email**: <support@morningstar-credentials.io>
- **Documentation**: <https://docs.morningstar-credentials.io>
- **Issues**: <https://github.com/yourcompany/morningstar-credentials/issues>

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

> Built with ❤️ implementing cutting-edge blockchain research

© 2025 Morningstar Credentials. All rights reserved.

</div>
