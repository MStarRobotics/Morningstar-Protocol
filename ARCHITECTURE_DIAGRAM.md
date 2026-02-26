# Architecture Diagram

## System Overview

Morningstar Credentials is a split frontend/backend architecture:

- Frontend (React/Vite) handles UX, wallet interactions, and session token usage.
- Backend (Express) brokers external APIs, enforces role-based writes, and persists local state.
- Optional third-party services provide AI schema/trust analysis, IPFS pinning, CAPTCHA, and SMTP delivery.

## Component Diagram

```mermaid
flowchart LR
  U[User Browser / Wallet] --> F[Frontend App\nReact + Vite]
  F -->|HTTPS JSON| B[Backend API\nExpress]

  B --> D1[(backend/data/dids.json)]
  B --> D2[(backend/data/institutions.json)]
  B --> D3[(backend/data/blockchain.json)]
  B --> D4[(backend/data/private_chain.json)]

  B --> G[Gemini API]
  B --> P[Pinata/IPFS]
  B --> T[Cloudflare Turnstile]
  B --> S[SMTP Provider]
```

## Auth and Role Flow

```mermaid
sequenceDiagram
  participant User
  participant Frontend
  participant Backend

  User->>Frontend: Connect wallet
  Frontend->>Backend: POST /api/auth/session/start
  Backend-->>Frontend: sessionId + challengeMessage
  Frontend->>User: request signature
  User-->>Frontend: signature
  Frontend->>Backend: POST /api/auth/session/bind-wallet
  Backend-->>Frontend: accessToken + refreshToken + role claims

  Frontend->>Backend: POST /api/auth/role/request (Bearer access token)
  Backend-->>Frontend: approved or pending

  Note over Backend: Governance routes require governance role.
  Note over Backend: DID/blockchain/email writes require issuer/governance role.
```

## Credential Issuance Path

```mermaid
flowchart TD
  A[Credential request in UI] --> B[Frontend validation + assembly]
  B --> C[POST /api/did or /api/blockchain/transaction]
  C --> D[Backend role check and rate limit]
  D --> E[Persist DID/transaction in backend data files]
  E --> F[Optional /api/blockchain/block mine step]
  F --> G[Optional /api/blockchain/private/store encrypted payload]
  G --> H[Optional /api/email/notify]
```

## Backend Route Groups

- Health: `/health`, `/api/health`, `/api/email/health`
- Auth/session: `/api/auth/session/*`, `/api/auth/student/email/*`, `/api/auth/role/*`
- Governance: `/api/governance/institutions` (`POST/PATCH` protected)
- DID: `/api/did` (`POST/PUT/DELETE` protected)
- Blockchain: `/api/blockchain/*` (write routes protected)
- External proxies: `/api/gemini/*`, `/api/ipfs/*`
- Notification/MFA: `/api/email/notify`, `/api/mfa/send-otp` (protected)

## Deployment Topology

```mermaid
flowchart LR
  GH[GitHub Actions CI] --> ART1[dist artifact]
  GH --> ART2[coverage artifact]
  GH --> DP[GitHub Pages deployment on main]
  GH --> DB[Docker image build on main]

  subgraph Runtime
    N[Nginx frontend container :8080]
    E[Express backend container :3001]
  end

  N -->|API calls| E
```

## Key Implementation Notes

- Write-route auth is user session token based, not static frontend bearer token configuration.
- Backend persistence is file-based and appropriate for single-instance or persistent-volume deployments.
- External providers are optional at runtime; endpoints fail gracefully when credentials are missing.
