# Open-Source Integrations

## Purpose

This document records the primary third-party packages actively used in the current workspace and how they are integrated.

## Core Runtime Libraries

| Package | Role in Project | Integration Points |
| --- | --- | --- |
| `react`, `react-dom` | Frontend UI runtime | `src/` |
| `vite` | Build/dev tooling | `vite.config.ts`, npm scripts |
| `viem`, `wagmi`, `@reown/*` | Wallet and chain interactions | wallet UI/services |
| `@digitalcredentials/*`, `jsonld`, `jsonld-signatures` | VC processing and linked data support | `src/services/vc/*`, VC services |
| `@veramo/*`, `did-resolver`, `did-jwt` | DID/identity tooling | DID and VC service layers |
| `express`, `helmet`, `cors`, `express-rate-limit` | Backend API and security middleware | `backend/server.js` |
| `nodemailer` | SMTP email transport | `backend/server.js`, `src/services/realEmailService.ts` |
| `qrcode` | QR code generation | `src/services/qrCodeService.ts` |
| `merkletreejs` | Merkle proof utilities | blockchain/credential services |
| `zod` | Input/schema validation support | validation paths |
| `bcryptjs` | Password hashing utilities (tests/services) | `src/services/passwordService.ts` |

## Security-Driven Dependency Controls

### Lockfile/override hardening

Current root overrides:

- `bn.js: 5.2.3`
- `rollup: 4.59.0`

Reason:

- Address dependency advisories that previously caused Security Audit CI failures.

### Audit policy

- `scripts/security-audit.mjs` enforces `npm audit --audit-level=moderate` for both root and backend package scopes.
- In local non-CI mode, connectivity-only failures are tolerated and explicitly reported.
- In CI, connectivity failures or vulnerability findings fail the job.

## Build and Bundle Controls

- Vite config uses manual chunking for heavy wallet/VC ecosystems.
- Build warning check (`scripts/check-build-warnings.mjs`) ignores known non-actionable warnings and fails on new actionable warnings.

## Integration Quality Notes

- Several advanced libraries are optional at runtime; missing credentials affect only related endpoints/features.
- The project includes compatibility aliases/stubs in `vite.config.ts` to avoid broken upstream package entries and vulnerable transitive chains.

## Operational Guidance

1. Keep dependency changes lockfile-backed and run `npm run audit:all` before merge.
2. Validate both root and backend dependency trees after upgrades.
3. Review frontend bundle outputs after wallet/VC dependency updates.
