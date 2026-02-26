/**
 * Centralised environment configuration.
 * Reads from Vite's import.meta.env and provides typed, validated access.
 */

function str(key: string, fallback = ''): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = import.meta.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

function num(key: string, fallback: number): number {
  const v = import.meta.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function buildApiUrl(path: string, apiBase: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return apiBase ? `${apiBase}${normalizedPath}` : normalizedPath;
}

export const env = {
  isProd: import.meta.env.PROD,
  isDev: import.meta.env.DEV,
  mode: import.meta.env.MODE,

  // API Keys (dev-only; production uses backend proxy)
  geminiApiKey: str('VITE_GEMINI_API_KEY'),
  reownProjectId: str('VITE_REOWN_PROJECT_ID', 'b56e18d47c72ab683b10814fe9495694'), // Default to a placeholder if missing
  ipfsApiKey: str('VITE_IPFS_API_KEY'),
  ipfsPinningJwt: str('VITE_IPFS_PINNING_JWT'),
  ipfsWriteMode: str('VITE_IPFS_WRITE_MODE', 'none'),
  ipfsProxyUrl: str('VITE_IPFS_PROXY_URL'),

  // Backend API proxy (required in production)
  apiProxyUrl: normalizeBaseUrl(str('VITE_API_PROXY_URL')),
  governanceBearerToken: str('VITE_GOVERNANCE_BEARER_TOKEN'),

  // Blockchain
  blockchainNetwork: str('VITE_BLOCKCHAIN_NETWORK', 'polygon-amoy'),
  chainId: num('VITE_CHAIN_ID', 80002),
  rpcUrl: str('VITE_BLOCKCHAIN_RPC_URL', 'https://rpc-amoy.polygon.technology'),
  gasLimit: num('VITE_GAS_LIMIT', 300000),
  maxGasPrice: num('VITE_MAX_GAS_PRICE', 50),

  // Contracts
  credentialRegistryContract: str('VITE_CREDENTIAL_REGISTRY_CONTRACT'),
  didRegistryContract: str('VITE_DID_REGISTRY_CONTRACT'),
  governanceContract: str('VITE_GOVERNANCE_CONTRACT'),

  // Validators (public on-chain addresses)
  validatorAddress1: str('VITE_VALIDATOR_ADDRESS_1'),
  validatorAddress2: str('VITE_VALIDATOR_ADDRESS_2'),

  // IPFS
  ipfsGateway: str('VITE_IPFS_GATEWAY', 'https://ipfs.io/ipfs/'),
  ipfsApiUrl: str('VITE_IPFS_API_URL'),
  ipfsStatusListCid: str('VITE_IPFS_STATUS_LIST_CID'),

  // Security
  mfaEnabled: bool('VITE_MFA_ENABLED', true),
  mfaRequiredFactors: num('VITE_MFA_REQUIRED_FACTORS', 2),
  mfaSessionTimeout: num('VITE_MFA_SESSION_TIMEOUT', 3600000),
  allowClientSigning: bool('VITE_ALLOW_CLIENT_SIGNING', false),
  strictDidResolution: bool('VITE_STRICT_DID_RESOLUTION', true),
  turnstileSiteKey: str('VITE_TURNSTILE_SITE_KEY'),
  corsOrigin: str('VITE_CORS_ORIGIN', 'http://localhost:3000'),

  // GDPR
  cookieConsentRequired: bool('VITE_COOKIE_CONSENT_REQUIRED'),
  analyticsEnabled: bool('VITE_ANALYTICS_ENABLED'),
  dpoEmail: str('VITE_DPO_EMAIL'),
  privacyContact: str('VITE_PRIVACY_CONTACT'),

  // Feature Flags
  zkpEnabled: bool('VITE_ZKP_ENABLED'),
  zkpCircuitPath: str('VITE_ZKP_CIRCUIT_PATH', '/circuits/credential_verification'),
  dualChainEnabled: bool('VITE_DUAL_CHAIN_ENABLED'),
  privateChainRpc: str('VITE_PRIVATE_CHAIN_RPC'),
  batchIssuanceEnabled: bool('VITE_BATCH_ISSUANCE_ENABLED', true),
  credentialRevocationEnabled: bool('VITE_CREDENTIAL_REVOCATION_ENABLED', true),
  auditTrailEnabled: bool('VITE_AUDIT_TRAIL_ENABLED'),
  statusListLength: num('VITE_STATUS_LIST_LENGTH', 131072),
  vcEngine: str('VITE_VC_ENGINE', 'auto'),
  walletMockMode: str('VITE_WALLET_MOCK_MODE', 'auto') as 'auto' | 'always' | 'never',

  // Monitoring
  sentryDsn: str('VITE_SENTRY_DSN'),
  monitoringEnabled: bool('VITE_MONITORING_ENABLED'),
  errorReporting: bool('VITE_ERROR_REPORTING'),

  // Assets
  cdnUrl: str('VITE_CDN_URL'),
  staticAssetsUrl: str('VITE_STATIC_ASSETS_URL'),

  // Governance
  governanceRegistryUrl: str('VITE_GOVERNANCE_REGISTRY_URL'),
  schemaRegistryUrl: str('VITE_SCHEMA_REGISTRY_URL'),
} as const;

function resolveApiBaseUrl(): string {
  if (env.apiProxyUrl) {
    return env.apiProxyUrl;
  }

  if (env.isProd) {
    throw new Error('Missing VITE_API_PROXY_URL in production. Configure backend proxy URL.');
  }

  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname.toLowerCase();
    // Local dev defaults to backend API on port 3001 when no proxy URL is set.
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'http://localhost:3001';
    }

    if (window.location.origin) {
      return normalizeBaseUrl(window.location.origin);
    }
  }

  return 'http://localhost:3001';
}

export const api = {
  get baseUrl(): string {
    return resolveApiBaseUrl();
  },
  url: (path: string): string => buildApiUrl(path, resolveApiBaseUrl()),
} as const;
