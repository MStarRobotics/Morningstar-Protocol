# Research Implementation Details

## Scope

This document maps research-inspired capabilities to concrete implementation points in this codebase.

## Implementation Matrix

| Research Theme | Implementation in Workspace | Key Files |
| --- | --- | --- |
| Verifiable Credentials and cryptographic proofs | VC processing, signing utilities, selective disclosure scaffolding, ZKP-oriented data structures | `src/services/vc/*`, `src/services/bacipProtocol.ts`, `src/services/zkProof.ts` |
| DID lifecycle and identity binding | DID registry services, backend DID CRUD API, wallet-bound user sessions | `src/services/didService.ts`, `src/services/didRegistry.ts`, `backend/server.js` |
| Blockchain-backed integrity | Public transaction queue + block mining simulation, private encrypted store | `src/services/blockchainService.ts`, `backend/server.js` |
| Governance and institutional controls | Institution registry, role requests/approvals, governance write guards | `src/services/governanceApi.ts`, `backend/server.js` |
| Multi-factor and trust controls | OTP flows, risk scoring, optional Turnstile challenge | `src/services/mfaService.ts`, `backend/server.js` |
| Operational integrity | Rate limiting, validation, security framework tests, build and audit gates | `src/services/securityFramework.ts`, `scripts/security-audit.mjs`, `.github/workflows/ci.yml` |

## Feature-Level Notes

### W3C VC / credential workflows

- Credential lifecycle logic is present in frontend service layer (`w3cCredentialService`, `vcFacade`, `verificationPipeline`).
- Data integrity mechanisms include hash generation, Merkle helpers, and serial identifiers.
- QR generation and verification URL construction are implemented for issuance flows.

### DID workflows

- Backend supports DID list, resolve, register, update, and revoke endpoints.
- DID writes are role-protected (`issuer` or `governance`).
- Frontend DID service supports backend-backed operations with controlled local fallback behavior.

### Governance and role model

- Governance access can be assigned through:
  - Bootstrap allowlist (`GOVERNANCE_BOOTSTRAP_WALLETS`)
  - Role request/approval API
- Governance-only routes protect institution onboarding and privileged approvals.

### Security and trust workflow

- Session-based auth model issues short-lived access tokens + refresh tokens.
- Student email verification flow influences risk scoring and role request eligibility.
- Rate limiters are scoped by route categories (auth, governance, DID, blockchain, external APIs, MFA).

## Validation Coverage

Verified by local run (February 26, 2026):

- `352` tests passing
- Typecheck pass
- Production build pass
- Security audit pass at `moderate+` threshold with network access

## Known Gaps vs. Mature Production Target

- Persistence is JSON-file based rather than managed transactional storage.
- Coverage strict mode currently validates tooling availability, not numeric quality thresholds.
- Wallet/VC bundles remain large and should be further optimized for startup performance.

## Summary

Research-aligned capabilities are implemented across credential, DID, governance, and security flows. The architecture is suitable for controlled deployment and further hardening toward multi-instance production maturity.
