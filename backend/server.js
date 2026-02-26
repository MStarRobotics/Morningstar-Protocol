/**
 * Backend API Proxy Server
 *
 * Keeps API keys server-side so they are never bundled into the client.
 * The frontend calls these proxy endpoints instead of external APIs directly.
 *
 * Endpoints:
 *   POST /api/gemini/schema            Generate credential schema via Gemini
 *   POST /api/gemini/trust             Trust analysis via Gemini
 *   POST /api/ipfs/upload              Upload JSON to IPFS via Pinata
 *   POST /api/ipfs/pin                 Pin a CID on Pinata
 *   GET  /api/governance/institutions  List institution registry
 *   POST /api/governance/institutions  Add institution record
 *   PATCH /api/governance/institutions/:id Update institution RBAC fields
 *   POST /api/auth/session/start        Start user auth session
 *   POST /api/auth/session/bind-wallet  Bind wallet ownership via signature
 *   POST /api/auth/session/refresh      Refresh access token
 *   GET  /api/auth/session/me           Get active user claims
 *   POST /api/auth/student/email/start  Start student email verification
 *   POST /api/auth/student/email/verify Verify student email OTP
 *   POST /api/auth/role/request         Request role elevation
 *   POST /api/auth/role/approve         Approve or deny role request
 *   POST /api/did                      Register DID record
 *   PUT  /api/did/:did                 Update DID record
 *   DELETE /api/did/:did               Revoke DID record
 *   POST /api/blockchain/transaction   Queue transaction
 *   POST /api/blockchain/block         Mine block (simulation)
 *   POST /api/blockchain/private/store Store encrypted data
 *   POST /api/mfa/send-otp             Dispatch OTP (SMS or email)
 *   POST /api/email/notify             Send generic email
 *   GET  /api/email/health             Email transport health/mode
 *   GET  /api/health                   Health check
 */

import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { createTransport } from 'nodemailer';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = toInt(process.env.PORT, 3001, 1, 65535);
const HOST = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '512kb';
const EXTERNAL_API_TIMEOUT_MS = toInt(process.env.EXTERNAL_API_TIMEOUT_MS, 20_000, 1_000, 120_000);
const ENABLE_RESPONSE_COMPRESSION = parseBoolean(process.env.ENABLE_RESPONSE_COMPRESSION, true);
const RESPONSE_COMPRESSION_MIN_BYTES = toInt(
  process.env.RESPONSE_COMPRESSION_MIN_BYTES,
  1_024,
  256,
  100_000,
);
const SLOW_REQUEST_THRESHOLD_MS = toInt(process.env.SLOW_REQUEST_THRESHOLD_MS, 800, 50, 30_000);
const HEALTH_CACHE_MAX_AGE_SECONDS = toInt(process.env.HEALTH_CACHE_MAX_AGE_SECONDS, 5, 0, 60);
const isProduction = process.env.NODE_ENV === 'production';
const API_AUTH_MODE = normalizeApiAuthMode(process.env.API_AUTH_MODE, isProduction ? 'required' : 'off');
const EXPOSE_EMAIL_HEALTH_DETAILS = parseBoolean(process.env.EXPOSE_EMAIL_HEALTH_DETAILS, !isProduction);
const AUTH_TOKEN_SECRET = String(
  process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET || `dev-auth-${randomUUID()}`,
).trim();
const HAS_STATIC_AUTH_SECRET = Boolean(process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET);
const ACCESS_TOKEN_TTL_SECONDS = toInt(process.env.ACCESS_TOKEN_TTL_SECONDS, 900, 60, 86_400);
const REFRESH_TOKEN_TTL_SECONDS = toInt(process.env.REFRESH_TOKEN_TTL_SECONDS, 604_800, 300, 5_184_000);
const AUTH_SESSION_TTL_SECONDS = toInt(process.env.AUTH_SESSION_TTL_SECONDS, 86_400, 300, 5_184_000);
const STUDENT_OTP_TTL_SECONDS = toInt(process.env.STUDENT_OTP_TTL_SECONDS, 300, 60, 3_600);
const STUDENT_OTP_MAX_ATTEMPTS = toInt(process.env.STUDENT_OTP_MAX_ATTEMPTS, 5, 1, 20);
const ALLOW_MOCK_WALLET_BINDING = parseBoolean(process.env.ALLOW_MOCK_WALLET_BINDING, !isProduction);
const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const TURNSTILE_REQUIRED = parseBoolean(
  process.env.TURNSTILE_REQUIRED,
  isProduction && Boolean(TURNSTILE_SECRET_KEY),
);
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RISK_SCORE_STEPUP_THRESHOLD = toInt(process.env.RISK_SCORE_STEPUP_THRESHOLD, 70, 20, 100);
const UNIVERSITY_DOMAIN_DATASET_URL = String(
  process.env.UNIVERSITY_DOMAIN_DATASET_URL ||
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json',
).trim();
const DISPOSABLE_DOMAIN_BLOCKLIST_URL = String(process.env.DISPOSABLE_DOMAIN_BLOCKLIST_URL || '').trim();

const app = express();
app.disable('x-powered-by');
app.set('etag', 'strong');

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', toInt(process.env.TRUST_PROXY, 1, 1, 10));
}

const ALLOWED_ORIGINS = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
);
const ALLOWED_ORIGIN_LABEL = ALLOWED_ORIGINS.allowAll
  ? '*'
  : [...ALLOWED_ORIGINS.values].join(', ');

const DATA_DIR = join(__dirname, 'data');
const DID_FILE = join(DATA_DIR, 'dids.json');
const INSTITUTIONS_FILE = join(DATA_DIR, 'institutions.json');
const BLOCKCHAIN_FILE = join(DATA_DIR, 'blockchain.json');
const PRIVATE_CHAIN_FILE = join(DATA_DIR, 'private_chain.json');

const DID_DEFAULT = [];
const INSTITUTIONS_DEFAULT = [
  {
    id: 'inst-polygon-university',
    address: '0xUni...2',
    name: 'Polygon University',
    role: 'ISSUER_ROLE',
    kycStatus: 'verified',
    addedDate: '2023-01-15T00:00:00.000Z',
    updatedAt: '2023-01-15T00:00:00.000Z',
  },
  {
    id: 'inst-tech-academy',
    address: '0xAca...5',
    name: 'Tech Academy',
    role: 'ISSUER_ROLE',
    kycStatus: 'verified',
    addedDate: '2023-03-10T00:00:00.000Z',
    updatedAt: '2023-03-10T00:00:00.000Z',
  },
  {
    id: 'inst-new-age-institute',
    address: '0xNew...8',
    name: 'New Age Institute',
    role: 'NONE',
    kycStatus: 'pending',
    addedDate: '2024-05-20T00:00:00.000Z',
    updatedAt: '2024-05-20T00:00:00.000Z',
  },
];
const BLOCKCHAIN_DEFAULT = { chain: [], pending: [] };
const PRIVATE_CHAIN_DEFAULT = {};

const INSTITUTION_NAME_REGEX = /^[a-zA-Z0-9 .'\-]+$/;
const INSTITUTION_ALLOWED_ROLES = new Set(['ISSUER_ROLE', 'NONE']);
const INSTITUTION_ALLOWED_KYC_STATUS = new Set(['verified', 'pending', 'rejected']);

const storeCache = new Map();
const storeLocks = new Map();
const authSessions = new Map();
const refreshTokenIndex = new Map();
const studentOtpChallenges = new Map();
const roleAccessRequests = new Map();
const authRiskEvents = [];

let universityDomainsCache = {
  fetchedAt: 0,
  domains: new Set(),
  inFlight: null,
};

let disposableDomainsCache = {
  fetchedAt: 0,
  domains: new Set(),
  inFlight: null,
};

const EMAIL_TRANSPORT_MODE = normalizeEmailTransportMode(process.env.EMAIL_TRANSPORT_MODE);
const SMTP_PROVIDER = normalizeSmtpProvider(process.env.SMTP_PROVIDER);

let mailTransport = null;
let mailTransportInitialized = false;
let httpServer;

const storageReady = initializeStorage();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInt(value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseAllowedOrigins(raw) {
  if (!raw || raw.trim() === '*') {
    return { allowAll: true, values: new Set() };
  }

  const values = new Set(
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  if (values.size === 0) {
    values.add('http://localhost:3000');
  }

  return { allowAll: false, values };
}

function parseBoolean(value, fallback = false) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function normalizeEmailTransportMode(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  if (normalized === 'mock' || normalized === 'smtp' || normalized === 'auto') {
    return normalized;
  }
  return 'auto';
}

function normalizeSmtpProvider(value) {
  const normalized = String(value || 'sendgrid').trim().toLowerCase();
  return normalized || 'sendgrid';
}

function normalizeApiAuthMode(value, fallback = 'off') {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (normalized === 'off' || normalized === 'required') {
    return normalized;
  }
  return fallback;
}

function parseTokenSet(raw) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

const API_TOKENS = {
  issuer: parseTokenSet(process.env.API_ISSUER_TOKEN || process.env.API_WRITE_TOKEN),
  governance: parseTokenSet(process.env.API_GOVERNANCE_TOKEN),
  admin: parseTokenSet(process.env.API_ADMIN_TOKEN),
};

function getConfiguredApiTokenCount() {
  return API_TOKENS.issuer.size + API_TOKENS.governance.size + API_TOKENS.admin.size;
}

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') {
    return '';
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function resolveRoleFromToken(token) {
  if (!token) return null;
  if (API_TOKENS.admin.has(token)) return 'admin';
  if (API_TOKENS.governance.has(token)) return 'governance';
  if (API_TOKENS.issuer.has(token)) return 'issuer';
  return null;
}

function getRequestRole(req) {
  const token = extractBearerToken(req.headers.authorization);
  return resolveRoleFromToken(token);
}

function requireApiRoles(...roles) {
  return (req, res, next) => {
    if (API_AUTH_MODE === 'off') {
      return next();
    }

    if (getConfiguredApiTokenCount() === 0) {
      return sendError(res, 503, 'API authorization is enabled but no tokens are configured', {
        code: 'AUTH_NOT_CONFIGURED',
      });
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return sendError(res, 401, 'Missing bearer token', { code: 'AUTH_TOKEN_REQUIRED' });
    }

    const role = resolveRoleFromToken(token);
    if (!role) {
      return sendError(res, 401, 'Invalid bearer token', { code: 'AUTH_TOKEN_INVALID' });
    }

    if (roles.length > 0 && role !== 'admin' && !roles.includes(role)) {
      return sendError(res, 403, 'Token is not authorized for this endpoint', {
        code: 'AUTH_FORBIDDEN',
        role,
        requiredRoles: roles,
      });
    }

    req.authRole = role;
    return next();
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value, maxLength = 10_000) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function normalizeInstitutionName(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeInstitutionAddress(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeInstitutionRole(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeInstitutionKycStatus(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function validateInstitutionName(name) {
  if (!isNonEmptyString(name, 100)) {
    return 'Institution name is required and must be 100 characters or less';
  }

  if (name.length < 2) {
    return 'Institution name must be at least 2 characters';
  }

  if (!INSTITUTION_NAME_REGEX.test(name)) {
    return 'Institution name may only include letters, digits, spaces, apostrophes, periods, and hyphens';
  }

  if (!/[a-zA-Z0-9]/.test(name)) {
    return 'Institution name must contain at least one alphanumeric character';
  }

  return '';
}

const USER_ALLOWED_ROLES = new Set(['guest', 'student', 'issuer', 'verifier', 'governance']);
const PRIVILEGED_USER_ROLES = new Set(['issuer', 'governance']);
const DEFAULT_DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'throwawaymail.com',
  'trashmail.com',
  'maildrop.cc',
  'dispostable.com',
  'sharklasers.com',
  'grr.la',
  'fakeinbox.com',
  'mintemail.com',
  'getnada.com',
  'inboxbear.com',
  'mailnesia.com',
  'tempinbox.com',
  'moakt.com',
  'emailondeck.com',
]);

const STATIC_UNIVERSITY_DOMAINS = new Set(
  [...parseTokenSet(process.env.UNIVERSITY_ALLOWED_DOMAINS || process.env.UNIVERSITY_DOMAINS)]
    .map((entry) => entry.toLowerCase()),
);
const STATIC_DISPOSABLE_DOMAINS = new Set([
  ...DEFAULT_DISPOSABLE_DOMAINS,
  ...[...parseTokenSet(process.env.DISPOSABLE_EMAIL_DOMAINS)].map((entry) => entry.toLowerCase()),
]);

function toEpochSeconds(date = new Date()) {
  return Math.floor(date.getTime() / 1000);
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function base64UrlEncodeJson(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeBase64UrlJson(input) {
  try {
    const raw = Buffer.from(String(input || ''), 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeCompareText(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeWalletAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

function getClientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (xff.length > 0) return xff[0];
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function maskEmail(email) {
  const normalized = normalizeEmailAddress(email);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '***';
  const prefix = local.length > 1 ? `${local[0]}***` : '*';
  return `${prefix}@${domain}`;
}

function buildWalletChallengeMessage(session) {
  return [
    'Morningstar Credentials Wallet Verification',
    `Session: ${session.id}`,
    `Nonce: ${session.walletChallengeNonce}`,
    'Sign this message to prove wallet ownership. No transaction will be sent.',
  ].join('\n');
}

async function verifyWalletOwnershipSignature(address, message, signature) {
  try {
    const viem = await import('viem');
    if (typeof viem?.verifyMessage !== 'function') {
      return false;
    }

    return await viem.verifyMessage({
      address,
      message,
      signature,
    });
  } catch (error) {
    if (!isProduction) {
      console.warn('[auth] Wallet signature verification engine unavailable:', error?.message || error);
    }
    return false;
  }
}

function signTokenPayload(headerEncoded, payloadEncoded) {
  return createHmac('sha256', AUTH_TOKEN_SECRET)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');
}

function createSignedToken(payload, tokenType, ttlSeconds) {
  const now = toEpochSeconds();
  const body = {
    ...payload,
    iss: 'morningstar-credentials-api',
    typ: tokenType,
    iat: now,
    exp: now + ttlSeconds,
    jti: randomUUID(),
  };
  const headerEncoded = base64UrlEncodeJson({ alg: 'HS256', typ: 'JWT' });
  const payloadEncoded = base64UrlEncodeJson(body);
  const signature = signTokenPayload(headerEncoded, payloadEncoded);
  return {
    token: `${headerEncoded}.${payloadEncoded}.${signature}`,
    payload: body,
  };
}

function verifySignedToken(token, expectedType) {
  if (!isNonEmptyString(token, 8_192)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerEncoded, payloadEncoded, signature] = parts;
  const header = decodeBase64UrlJson(headerEncoded);
  const payload = decodeBase64UrlJson(payloadEncoded);
  if (!header || !payload) return null;
  if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

  const expectedSignature = signTokenPayload(headerEncoded, payloadEncoded);
  if (!safeCompareText(signature, expectedSignature)) return null;
  if (payload.typ !== expectedType) return null;
  if (typeof payload.exp !== 'number' || toEpochSeconds() >= payload.exp) return null;
  if (!isNonEmptyString(payload.sub, 256) || !isNonEmptyString(payload.jti, 256)) return null;
  return payload;
}

function buildSessionClaims(session) {
  const role = USER_ALLOWED_ROLES.has(session.role) ? session.role : 'guest';
  return {
    sessionId: session.id,
    role,
    walletAddress: session.walletAddress,
    walletBound: Boolean(session.walletBound),
    studentVerified: Boolean(session.studentVerified),
    verifiedEmail: session.verifiedEmail || null,
    assuranceLevel: session.assuranceLevel || 'low',
    riskLevel: session.riskLevel || 'low',
    riskScore: Number(session.riskScore || 0),
  };
}

function issueTokenPairForSession(session) {
  const claims = buildSessionClaims(session);
  const access = createSignedToken(
    {
      sub: session.id,
      role: claims.role,
      walletBound: claims.walletBound,
      studentVerified: claims.studentVerified,
      assuranceLevel: claims.assuranceLevel,
      riskLevel: claims.riskLevel,
    },
    'access',
    ACCESS_TOKEN_TTL_SECONDS,
  );
  const refresh = createSignedToken(
    { sub: session.id },
    'refresh',
    REFRESH_TOKEN_TTL_SECONDS,
  );

  refreshTokenIndex.set(refresh.payload.jti, {
    sessionId: session.id,
    expiresAt: refresh.payload.exp,
  });

  return {
    accessToken: access.token,
    accessTokenExpiresAt: new Date(access.payload.exp * 1000).toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: new Date(refresh.payload.exp * 1000).toISOString(),
    claims,
  };
}

function clearSessionRefreshTokens(sessionId) {
  for (const [jti, item] of refreshTokenIndex.entries()) {
    if (item.sessionId === sessionId) {
      refreshTokenIndex.delete(jti);
    }
  }
}

function pruneExpiredAuthState() {
  const now = toEpochSeconds();
  for (const [sessionId, session] of authSessions.entries()) {
    if (typeof session.expiresAtEpoch === 'number' && session.expiresAtEpoch <= now) {
      authSessions.delete(sessionId);
      clearSessionRefreshTokens(sessionId);
    }
  }

  for (const [jti, item] of refreshTokenIndex.entries()) {
    if (item.expiresAt <= now) {
      refreshTokenIndex.delete(jti);
    }
  }

  for (const [challengeKey, challenge] of studentOtpChallenges.entries()) {
    if (challenge.expiresAtEpoch <= now) {
      studentOtpChallenges.delete(challengeKey);
    }
  }

  for (const [requestId, request] of roleAccessRequests.entries()) {
    if (request.status !== 'pending') continue;
    if (request.expiresAtEpoch <= now) {
      roleAccessRequests.set(requestId, {
        ...request,
        status: 'expired',
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

function getSessionById(sessionId) {
  if (!isNonEmptyString(sessionId, 200)) return null;
  pruneExpiredAuthState();
  return authSessions.get(sessionId) || null;
}

function getSessionFromAccessToken(req) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { error: 'Missing bearer token', code: 'AUTH_TOKEN_REQUIRED' };
  }

  const payload = verifySignedToken(token, 'access');
  if (!payload) {
    return { error: 'Invalid or expired access token', code: 'AUTH_TOKEN_INVALID' };
  }

  const session = getSessionById(payload.sub);
  if (!session) {
    return { error: 'Session not found or expired', code: 'AUTH_SESSION_INVALID' };
  }

  return { session, payload };
}

function requireUserSession(req, res, next) {
  const parsed = getSessionFromAccessToken(req);
  if (parsed.error) {
    return sendError(res, 401, parsed.error, { code: parsed.code });
  }
  req.userSession = parsed.session;
  req.userTokenPayload = parsed.payload;
  return next();
}

function getDomainFromEmail(email) {
  const normalized = normalizeEmailAddress(email);
  const at = normalized.lastIndexOf('@');
  if (at === -1 || at === normalized.length - 1) return '';
  return normalized.slice(at + 1);
}

function matchesDomain(set, domain) {
  if (!domain) return false;
  if (set.has(domain)) return true;
  const segments = domain.split('.');
  for (let i = 1; i < segments.length - 1; i += 1) {
    const candidate = segments.slice(i).join('.');
    if (set.has(candidate)) return true;
  }
  return false;
}

async function loadDisposableDomains() {
  const now = Date.now();
  if (disposableDomainsCache.domains.size > 0 && now - disposableDomainsCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return disposableDomainsCache.domains;
  }

  if (disposableDomainsCache.inFlight) {
    return disposableDomainsCache.inFlight;
  }

  disposableDomainsCache.inFlight = (async () => {
    const domains = new Set(STATIC_DISPOSABLE_DOMAINS);
    if (DISPOSABLE_DOMAIN_BLOCKLIST_URL) {
      try {
        const response = await fetchWithTimeout(DISPOSABLE_DOMAIN_BLOCKLIST_URL, {}, 8_000);
        if (response.ok) {
          const text = await response.text();
          for (const rawLine of text.split('\n')) {
            const domain = rawLine.trim().toLowerCase();
            if (!domain || domain.startsWith('#')) continue;
            domains.add(domain);
          }
        }
      } catch (error) {
        console.warn('[auth] Disposable-domain blocklist fetch failed:', error?.message || error);
      }
    }
    disposableDomainsCache = {
      fetchedAt: Date.now(),
      domains,
      inFlight: null,
    };
    return domains;
  })();

  try {
    return await disposableDomainsCache.inFlight;
  } finally {
    if (disposableDomainsCache.inFlight) {
      disposableDomainsCache.inFlight = null;
    }
  }
}

async function loadUniversityDomains() {
  const now = Date.now();
  if (universityDomainsCache.domains.size > 0 && now - universityDomainsCache.fetchedAt < 24 * 60 * 60 * 1000) {
    return universityDomainsCache.domains;
  }

  if (universityDomainsCache.inFlight) {
    return universityDomainsCache.inFlight;
  }

  universityDomainsCache.inFlight = (async () => {
    const domains = new Set(STATIC_UNIVERSITY_DOMAINS);

    if (UNIVERSITY_DOMAIN_DATASET_URL) {
      try {
        const response = await fetchWithTimeout(UNIVERSITY_DOMAIN_DATASET_URL, {}, 10_000);
        if (response.ok) {
          const payload = await response.json();
          if (Array.isArray(payload)) {
            for (const university of payload) {
              const list = Array.isArray(university?.domains) ? university.domains : [];
              for (const rawDomain of list) {
                const domain = String(rawDomain || '').trim().toLowerCase();
                if (domain) domains.add(domain);
              }
            }
          }
        }
      } catch (error) {
        console.warn('[auth] University-domain dataset fetch failed:', error?.message || error);
      }
    }

    universityDomainsCache = {
      fetchedAt: Date.now(),
      domains,
      inFlight: null,
    };
    return domains;
  })();

  try {
    return await universityDomainsCache.inFlight;
  } finally {
    if (universityDomainsCache.inFlight) {
      universityDomainsCache.inFlight = null;
    }
  }
}

function riskLevelFromScore(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function recordRiskEvent(sessionId, action, score, signals) {
  authRiskEvents.push({
    id: randomUUID(),
    sessionId,
    action,
    score,
    riskLevel: riskLevelFromScore(score),
    signals,
    createdAt: new Date().toISOString(),
  });

  if (authRiskEvents.length > 1000) {
    authRiskEvents.shift();
  }
}

function updateSessionRisk(session, action, signals) {
  let score = 0;
  if (!session.walletBound) score += 20;
  if (signals.disposableDomain) score += 80;
  if (signals.unknownAcademicDomain) score += 40;
  if (signals.otpFailures >= 2) score += Math.min(30, signals.otpFailures * 10);
  if (signals.privilegedRoleRequest) score += 20;
  if (signals.captchaMissing) score += 20;
  if (signals.mockWalletBound) score += 30;

  const level = riskLevelFromScore(score);
  session.riskScore = Math.max(Number(session.riskScore || 0), score);
  session.riskLevel = riskLevelFromScore(Number(session.riskScore || 0));
  session.updatedAt = new Date().toISOString();
  recordRiskEvent(session.id, action, score, signals);
  return { score, level };
}

async function verifyTurnstileToken(token, remoteIp) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken && !TURNSTILE_REQUIRED) {
    return { ok: true, skipped: true };
  }

  if (!normalizedToken) {
    return { ok: false, error: 'CAPTCHA token is required', code: 'CAPTCHA_REQUIRED' };
  }

  if (!TURNSTILE_SECRET_KEY) {
    if (!isProduction) {
      return { ok: true, skipped: true };
    }
    return { ok: false, error: 'CAPTCHA validation is not configured', code: 'CAPTCHA_NOT_CONFIGURED' };
  }

  try {
    const body = new URLSearchParams({
      secret: TURNSTILE_SECRET_KEY,
      response: normalizedToken,
      remoteip: String(remoteIp || ''),
    });

    const response = await fetchWithTimeout(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }, 8_000);

    if (!response.ok) {
      return { ok: false, error: 'CAPTCHA verification failed', code: 'CAPTCHA_VERIFY_HTTP_ERROR' };
    }

    const payload = await response.json();
    if (!payload?.success) {
      return {
        ok: false,
        error: 'CAPTCHA verification failed',
        code: 'CAPTCHA_VERIFY_FAILED',
        errors: payload?.['error-codes'] || [],
      };
    }

    return { ok: true, skipped: false };
  } catch (error) {
    return {
      ok: false,
      error: 'CAPTCHA verification unavailable',
      code: 'CAPTCHA_VERIFY_UNAVAILABLE',
      details: String(error?.message || error),
    };
  }
}

async function evaluateStudentEmailDomain(email) {
  const normalizedEmail = normalizeEmailAddress(email);
  const domain = getDomainFromEmail(normalizedEmail);
  if (!domain) {
    return { ok: false, code: 'EMAIL_INVALID', error: 'Invalid email format' };
  }

  const disposableDomains = await loadDisposableDomains();
  if (matchesDomain(disposableDomains, domain)) {
    return {
      ok: false,
      code: 'DISPOSABLE_EMAIL_BLOCKED',
      error: 'Disposable email domains are not allowed',
      domain,
      disposable: true,
    };
  }

  if (domain.endsWith('.edu')) {
    return {
      ok: true,
      domain,
      recognizedAcademicDomain: true,
      disposable: false,
    };
  }

  const universityDomains = await loadUniversityDomains();
  if (matchesDomain(universityDomains, domain)) {
    return {
      ok: true,
      domain,
      recognizedAcademicDomain: true,
      disposable: false,
    };
  }

  return {
    ok: false,
    code: 'STUDENT_DOMAIN_REVIEW_REQUIRED',
    error: 'Institution domain is not in the trusted university dataset',
    domain,
    recognizedAcademicDomain: false,
    disposable: false,
  };
}

function generateOtpCode() {
  return String(randomInt(100_000, 1_000_000));
}

function getStudentOtpChallengeKey(sessionId, email) {
  return `${sessionId}:${normalizeEmailAddress(email)}`;
}

function createRoleAccessRequest(session, role, reason = 'manual_review') {
  const nowEpoch = toEpochSeconds();
  const request = {
    requestId: randomUUID(),
    sessionId: session.id,
    walletAddress: session.walletAddress,
    verifiedEmail: session.verifiedEmail || null,
    requestedRole: role,
    reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAtEpoch: nowEpoch + 7 * 24 * 60 * 60,
  };
  roleAccessRequests.set(request.requestId, request);
  session.updatedAt = new Date().toISOString();
  return request;
}

function clone(data) {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

function normalizeDidParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizeFileName(fileName) {
  const safeBase = basename(String(fileName || 'data.json'));
  return safeBase.replace(/[^\w.-]/g, '_') || 'data.json';
}

function getSerializedSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function appendVaryHeader(res, value) {
  const current = String(res.getHeader('Vary') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const next = new Set(current);
  next.add(value);
  res.setHeader('Vary', [...next].join(', '));
}

function compressPayload(payload, acceptEncoding) {
  if (!ENABLE_RESPONSE_COMPRESSION || !acceptEncoding) {
    return null;
  }

  if (/\bbr\b/i.test(acceptEncoding)) {
    return {
      encoding: 'br',
      buffer: brotliCompressSync(payload, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
        },
      }),
    };
  }

  if (/\bgzip\b/i.test(acceptEncoding)) {
    return {
      encoding: 'gzip',
      buffer: gzipSync(payload, { level: 6 }),
    };
  }

  return null;
}

function getRequestId(res) {
  return String(res.getHeader('X-Request-ID') || '');
}

function sendError(res, status, message, details) {
  const payload = {
    error: message,
    requestId: getRequestId(res),
  };

  if (details) {
    payload.details = details;
  }

  return res.status(status).json(payload);
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = EXTERNAL_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function extractGeminiText(payload) {
  if (!isPlainObject(payload)) return '';
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (candidates.length === 0) return '';
  const firstCandidate = candidates[0];
  if (!isPlainObject(firstCandidate.content)) return '';
  const parts = Array.isArray(firstCandidate.content.parts) ? firstCandidate.content.parts : [];
  const text = parts
    .map((part) => (isPlainObject(part) && typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
  return text;
}

function parseLooseJson(text) {
  if (!isNonEmptyString(text, 50_000)) {
    throw new Error('Gemini returned empty output');
  }

  const cleaned = text
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();

  return JSON.parse(cleaned);
}

function normalizeSchemaPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('Schema payload is not an object');
  }

  const schemaName = isNonEmptyString(payload.schemaName, 120)
    ? payload.schemaName.trim()
    : 'GeneratedCredentialSchema';
  const rawFields = Array.isArray(payload.fields) ? payload.fields : [];

  if (rawFields.length === 0) {
    throw new Error('Schema must contain at least one field');
  }

  const fields = rawFields
    .filter((entry) => isPlainObject(entry))
    .map((entry) => {
      const rawType = String(entry.type || '').toLowerCase();
      const type = ['string', 'number', 'date', 'boolean'].includes(rawType)
        ? rawType
        : 'string';

      return {
        name: isNonEmptyString(entry.name, 80) ? entry.name.trim() : 'field',
        type,
        required: Boolean(entry.required),
      };
    });

  if (fields.length === 0) {
    throw new Error('Schema has no valid fields');
  }

  return { schemaName, fields };
}

async function callGemini({ prompt, responseMimeType = 'text/plain' }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key missing');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);
  if (!text) {
    throw new Error('Gemini returned no text');
  }

  return text;
}

function getSmtpDefaults(provider) {
  if (provider === 'sendgrid') {
    return {
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      user: 'apikey',
    };
  }

  return {
    host: '',
    port: 587,
    secure: false,
    user: '',
  };
}

function getSmtpConfig() {
  const defaults = getSmtpDefaults(SMTP_PROVIDER);
  const host = String(process.env.SMTP_HOST || defaults.host || '').trim();
  const user = String(process.env.SMTP_USER || defaults.user || '').trim();
  const pass = String(process.env.SMTP_PASSWORD || '').trim();
  const port = toInt(process.env.SMTP_PORT, defaults.port, 1, 65535);
  const secure = parseBoolean(process.env.SMTP_SECURE, defaults.secure);
  const fromValue = String(process.env.SMTP_FROM || '').trim();
  const from = fromValue || (SMTP_PROVIDER === 'sendgrid' ? '' : user);

  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASSWORD');
  if (!from) missing.push('SMTP_FROM');
  if (SMTP_PROVIDER === 'sendgrid' && user && user !== 'apikey') {
    missing.push('SMTP_USER=apikey');
  }

  return {
    provider: SMTP_PROVIDER,
    host,
    port,
    secure,
    user,
    pass,
    from,
    missing,
    configured: missing.length === 0,
  };
}

function getEmailDeliveryStatus() {
  const smtp = getSmtpConfig();
  let mode = EMAIL_TRANSPORT_MODE;
  if (mode === 'auto') {
    mode = smtp.configured ? 'smtp' : 'mock';
  }

  return {
    requestedMode: EMAIL_TRANSPORT_MODE,
    mode,
    provider: SMTP_PROVIDER,
    smtp,
  };
}

function getEmailErrorDetails(code) {
  const status = getEmailDeliveryStatus();
  return {
    code,
    mode: status.mode,
    requestedMode: status.requestedMode,
    provider: status.provider,
    missing: status.smtp.missing,
  };
}

function classifyEmailSendError(error) {
  const errorCode = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode);
  const message = String(error?.message || '').toLowerCase();
  const authFailure = (
    errorCode === 'EAUTH' ||
    errorCode === 'EPROTOCOL' ||
    [530, 534, 535].includes(responseCode) ||
    message.includes('auth') ||
    message.includes('invalid login') ||
    message.includes('username and password')
  );

  return {
    code: authFailure ? 'EMAIL_PROVIDER_AUTH_FAILED' : 'EMAIL_SEND_FAILED',
    message: authFailure ? 'SMTP authentication failed' : 'Email delivery failed',
  };
}

function getEmailHealthPayload({ includeSensitive = false } = {}) {
  const status = getEmailDeliveryStatus();
  const internalWarnings = [];

  if (status.requestedMode === 'auto' && status.mode === 'mock') {
    internalWarnings.push(
      `EMAIL_TRANSPORT_MODE=auto is using mock delivery because SMTP is incomplete (${status.smtp.missing.join(', ')}).`,
    );
  }
  if (status.requestedMode === 'smtp' && !status.smtp.configured) {
    internalWarnings.push(`SMTP mode requested but missing: ${status.smtp.missing.join(', ')}.`);
  }
  if (status.provider === 'sendgrid' && status.mode === 'smtp' && status.smtp.user !== 'apikey') {
    internalWarnings.push('SendGrid usually requires SMTP_USER=apikey.');
  }

  const warnings = includeSensitive
    ? internalWarnings
    : (internalWarnings.length > 0 ? ['Email transport has configuration warnings.'] : []);

  const smtp = includeSensitive
    ? {
      configured: status.smtp.configured,
      host: status.smtp.host || null,
      port: status.smtp.port,
      secure: status.smtp.secure,
      from: status.smtp.from || null,
      missing: status.smtp.missing,
    }
    : {
      configured: status.smtp.configured,
      missingCount: status.smtp.missing.length,
    };

  return {
    status: status.requestedMode === 'smtp' && !status.smtp.configured ? 'error' : 'ok',
    mode: status.mode,
    requestedMode: status.requestedMode,
    provider: status.provider,
    smtp,
    warnings,
  };
}

function getMailTransport() {
  if (mailTransportInitialized) {
    return mailTransport;
  }

  mailTransportInitialized = true;
  const status = getEmailDeliveryStatus();
  if (status.mode !== 'smtp' || !status.smtp.configured) {
    mailTransport = null;
    return null;
  }

  mailTransport = createTransport({
    host: status.smtp.host,
    port: status.smtp.port,
    secure: status.smtp.secure,
    auth: { user: status.smtp.user, pass: status.smtp.pass },
  });

  return mailTransport;
}

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return false;

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: from,
      Body: body,
    }),
  });

  return response.ok;
}

async function sendEmailOtpCode(email, otpCode) {
  const message = `Your Morningstar Credentials verification code is: ${otpCode}. It expires in ${Math.floor(STUDENT_OTP_TTL_SECONDS / 60)} minute(s).`;
  const emailStatus = getEmailDeliveryStatus();
  if (emailStatus.mode === 'mock') {
    console.info(`[auth-email-mock] to=${email} otp=${otpCode}`);
    return {
      success: true,
      mode: 'mock',
      provider: emailStatus.provider,
      mock: true,
    };
  }

  if (!emailStatus.smtp.configured) {
    return {
      success: false,
      code: 'EMAIL_NOT_CONFIGURED',
      details: getEmailErrorDetails('EMAIL_NOT_CONFIGURED'),
    };
  }

  const transport = getMailTransport();
  if (!transport) {
    return {
      success: false,
      code: 'EMAIL_NOT_CONFIGURED',
      details: getEmailErrorDetails('EMAIL_NOT_CONFIGURED'),
    };
  }

  try {
    await withTimeout(
      transport.sendMail({
        from: emailStatus.smtp.from,
        to: email,
        subject: 'Morningstar Credentials Student Verification Code',
        text: message,
        html: `<p>${message}</p>`,
      }),
      EXTERNAL_API_TIMEOUT_MS,
      'Student email OTP request',
    );

    return {
      success: true,
      mode: 'smtp',
      provider: emailStatus.provider,
      mock: false,
    };
  } catch (emailError) {
    const classified = classifyEmailSendError(emailError);
    return {
      success: false,
      code: classified.code,
      details: getEmailErrorDetails(classified.code),
    };
  }
}

async function atomicWrite(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempPath, data, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function ensureStore(filePath, fallbackValue) {
  await fs.mkdir(dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    const initial = JSON.stringify(fallbackValue, null, 2);
    await atomicWrite(filePath, initial);
    storeCache.set(filePath, clone(fallbackValue));
    return;
  }

  if (storeCache.has(filePath)) {
    return;
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    storeCache.set(filePath, clone(parsed));
  } catch (error) {
    console.warn(`[store] Resetting corrupted store ${basename(filePath)}:`, error?.message || error);
    await atomicWrite(filePath, JSON.stringify(fallbackValue, null, 2));
    storeCache.set(filePath, clone(fallbackValue));
  }
}

async function initializeStorage() {
  await Promise.all([
    ensureStore(DID_FILE, DID_DEFAULT),
    ensureStore(INSTITUTIONS_FILE, INSTITUTIONS_DEFAULT),
    ensureStore(BLOCKCHAIN_FILE, BLOCKCHAIN_DEFAULT),
    ensureStore(PRIVATE_CHAIN_FILE, PRIVATE_CHAIN_DEFAULT),
  ]);
}

async function readStore(filePath, fallbackValue) {
  await ensureStore(filePath, fallbackValue);
  return clone(storeCache.get(filePath));
}

async function writeStore(filePath, data) {
  const serialized = JSON.stringify(data, null, 2);
  await atomicWrite(filePath, serialized);
  storeCache.set(filePath, clone(data));
}

async function withStoreLock(filePath, fn) {
  const previous = storeLocks.get(filePath) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(fn);

  const release = next.finally(() => {
    if (storeLocks.get(filePath) === release) {
      storeLocks.delete(filePath);
    }
  });

  storeLocks.set(filePath, release);
  return next;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use((req, res, next) => {
  const incomingId = typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id']
    : '';
  const requestId = incomingId || randomUUID();
  res.setHeader('X-Request-ID', requestId);

  const startTime = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    const logLine = `[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms id=${requestId}`;

    if (elapsedMs >= SLOW_REQUEST_THRESHOLD_MS) {
      console.warn(`[api][slow] ${logLine}`);
      return;
    }

    if (!isProduction || process.env.REQUEST_LOGS === 'true') {
      console.info(logLine);
    }
  });

  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use((req, res, next) => {
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!ENABLE_RESPONSE_COMPRESSION || req.method === 'HEAD' || !acceptEncoding) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.headersSent || res.getHeader('Content-Encoding')) {
      return originalJson(body);
    }

    let serialized;
    try {
      serialized = JSON.stringify(body);
    } catch {
      return originalJson(body);
    }

    const payload = Buffer.from(serialized);
    if (payload.byteLength < RESPONSE_COMPRESSION_MIN_BYTES) {
      return originalJson(body);
    }

    const compressed = compressPayload(payload, acceptEncoding);
    if (!compressed || compressed.buffer.byteLength >= payload.byteLength) {
      return originalJson(body);
    }

    appendVaryHeader(res, 'Accept-Encoding');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Encoding', compressed.encoding);
    res.removeHeader('Content-Length');
    return res.send(compressed.buffer);
  };

  next();
});

const corsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.allowAll || ALLOWED_ORIGINS.values.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS_ORIGIN_DENIED'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86_400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path === '/api/health' || req.path === '/health')) {
    res.setHeader(
      'Cache-Control',
      `public, max-age=${HEALTH_CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=30`,
    );
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

const limiterErrorHandler = (_req, res, _next, options) => {
  const message = typeof options.message === 'string'
    ? options.message
    : options.message?.error || 'Too many requests, please try again later.';
  sendError(res, options.statusCode || 429, message);
};

const globalLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW, 60_000, 1_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_REQUESTS, 120, 10, 20_000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
  skip: (req) => req.path === '/api/health' || req.path === '/api/email/health' || req.path === '/health',
});
app.use(globalLimiter);

const mfaLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MFA, 900_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_MFA_ATTEMPTS, 5, 1, 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const authSessionLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_AUTH_SESSIONS, 900_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_AUTH_SESSIONS, 20, 1, 500),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const authOtpLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_AUTH_OTP, 900_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_AUTH_OTP, 10, 1, 200),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const authRoleLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_AUTH_ROLE, 900_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_AUTH_ROLE, 20, 1, 200),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const externalApiLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_EXTERNAL, 60_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_EXTERNAL_REQUESTS, 30, 1, 5_000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const didWriteLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_DID_WRITES, 60_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_DID_WRITES, 25, 1, 5_000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const governanceWriteLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_GOVERNANCE_WRITES, 60_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_GOVERNANCE_WRITES, 25, 1, 5_000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

const blockchainWriteLimiter = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_BLOCKCHAIN_WRITES, 60_000, 10_000, 86_400_000),
  max: toInt(process.env.RATE_LIMIT_MAX_BLOCKCHAIN_WRITES, 40, 1, 5_000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: limiterErrorHandler,
});

app.use(async (_req, res, next) => {
  try {
    await storageReady;
    next();
  } catch (error) {
    console.error('[server] Storage initialization failed:', error);
    sendError(res, 500, 'Storage initialization failed');
  }
});

app.use((_req, _res, next) => {
  pruneExpiredAuthState();
  next();
});

// ---------------------------------------------------------------------------
// Health Endpoints
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api/email/health', (req, res) => {
  const requesterRole = getRequestRole(req);
  const health = getEmailHealthPayload({
    includeSensitive: EXPOSE_EMAIL_HEALTH_DETAILS || requesterRole === 'admin',
  });
  const statusCode = health.status === 'error' ? 503 : 200;
  res.status(statusCode).json(health);
});

app.get('/health', (_req, res) => {
  res.status(200).type('text/plain').send('OK');
});

// ---------------------------------------------------------------------------
// User Auth & Student Verification
// ---------------------------------------------------------------------------

app.post('/api/auth/session/start', authSessionLimiter, async (req, res) => {
  if (getSerializedSize(req.body) > 15_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const walletAddressRaw = req.body?.walletAddress;
  const walletAddress = normalizeWalletAddress(walletAddressRaw);
  if (walletAddress && !isValidWalletAddress(walletAddress)) {
    return sendError(res, 400, 'Invalid wallet address', { code: 'WALLET_INVALID' });
  }

  const captcha = await verifyTurnstileToken(req.body?.captchaToken, getClientIp(req));
  if (!captcha.ok) {
    return sendError(res, 403, captcha.error || 'CAPTCHA verification failed', {
      code: captcha.code || 'CAPTCHA_FAILED',
      errors: captcha.errors || [],
    });
  }

  const now = new Date();
  const session = {
    id: randomUUID(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAtEpoch: toEpochSeconds(now) + AUTH_SESSION_TTL_SECONDS,
    ipHash: sha256Hex(getClientIp(req)),
    userAgentHash: sha256Hex(req.headers['user-agent'] || ''),
    walletAddress: walletAddress || null,
    walletBound: false,
    walletBindingMode: null,
    walletChallengeNonce: randomUUID(),
    studentVerified: false,
    verifiedEmail: null,
    role: 'guest',
    assuranceLevel: 'low',
    riskLevel: 'low',
    riskScore: 0,
    otpFailures: 0,
  };

  authSessions.set(session.id, session);

  res.status(201).json({
    success: true,
    sessionId: session.id,
    challengeMessage: buildWalletChallengeMessage(session),
    expiresAt: new Date(session.expiresAtEpoch * 1000).toISOString(),
    captcha: {
      required: TURNSTILE_REQUIRED,
      skipped: Boolean(captcha.skipped),
    },
  });
});

app.post('/api/auth/session/bind-wallet', authSessionLimiter, async (req, res) => {
  if (getSerializedSize(req.body) > 20_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const sessionId = String(req.body?.sessionId || '').trim();
  const walletAddress = normalizeWalletAddress(req.body?.walletAddress);
  const signature = String(req.body?.signature || '').trim();

  if (!isNonEmptyString(sessionId, 200)) {
    return sendError(res, 400, 'Missing sessionId', { code: 'SESSION_ID_REQUIRED' });
  }
  if (!isValidWalletAddress(walletAddress)) {
    return sendError(res, 400, 'Invalid wallet address', { code: 'WALLET_INVALID' });
  }
  if (!isNonEmptyString(signature, 10_000)) {
    return sendError(res, 400, 'Missing signature', { code: 'WALLET_SIGNATURE_REQUIRED' });
  }

  const session = getSessionById(sessionId);
  if (!session) {
    return sendError(res, 404, 'Session not found or expired', { code: 'AUTH_SESSION_INVALID' });
  }

  if (session.walletAddress && session.walletAddress !== walletAddress) {
    return sendError(res, 409, 'Wallet address mismatch for this session', {
      code: 'WALLET_MISMATCH',
      expected: session.walletAddress,
    });
  }

  let verified = false;
  let walletBindingMode = 'signature';
  try {
    verified = await verifyWalletOwnershipSignature(
      walletAddress,
      buildWalletChallengeMessage(session),
      signature,
    );
  } catch {
    verified = false;
  }

  if (!verified && ALLOW_MOCK_WALLET_BINDING) {
    walletBindingMode = 'mock';
    verified = true;
  }

  if (!verified) {
    return sendError(res, 401, 'Wallet signature verification failed', {
      code: 'WALLET_SIGNATURE_INVALID',
    });
  }

  session.walletAddress = walletAddress;
  session.walletBound = true;
  session.walletBindingMode = walletBindingMode;
  session.walletChallengeNonce = randomUUID();
  session.updatedAt = new Date().toISOString();
  session.expiresAtEpoch = toEpochSeconds() + AUTH_SESSION_TTL_SECONDS;
  if (walletBindingMode === 'signature') {
    session.assuranceLevel = 'medium';
  }

  updateSessionRisk(session, 'wallet-bind', {
    disposableDomain: false,
    unknownAcademicDomain: false,
    otpFailures: session.otpFailures,
    privilegedRoleRequest: false,
    captchaMissing: false,
    mockWalletBound: walletBindingMode === 'mock',
  });

  const tokens = issueTokenPairForSession(session);
  res.json({
    success: true,
    walletBindingMode,
    session: tokens.claims,
    tokens,
  });
});

app.post('/api/auth/session/refresh', authSessionLimiter, async (req, res) => {
  const supplied = String(req.body?.refreshToken || extractBearerToken(req.headers.authorization) || '').trim();
  if (!supplied) {
    return sendError(res, 400, 'Missing refresh token', { code: 'REFRESH_TOKEN_REQUIRED' });
  }

  const payload = verifySignedToken(supplied, 'refresh');
  if (!payload) {
    return sendError(res, 401, 'Invalid or expired refresh token', { code: 'REFRESH_TOKEN_INVALID' });
  }

  const indexed = refreshTokenIndex.get(payload.jti);
  if (!indexed || indexed.sessionId !== payload.sub) {
    return sendError(res, 401, 'Refresh token is revoked', { code: 'REFRESH_TOKEN_REVOKED' });
  }

  const session = getSessionById(payload.sub);
  if (!session) {
    refreshTokenIndex.delete(payload.jti);
    return sendError(res, 401, 'Session not found or expired', { code: 'AUTH_SESSION_INVALID' });
  }

  refreshTokenIndex.delete(payload.jti);
  const tokens = issueTokenPairForSession(session);
  res.json({ success: true, session: tokens.claims, tokens });
});

app.post('/api/auth/session/logout', requireUserSession, (req, res) => {
  const session = req.userSession;
  if (!session) {
    return sendError(res, 401, 'Unauthorized', { code: 'AUTH_SESSION_INVALID' });
  }

  clearSessionRefreshTokens(session.id);
  authSessions.delete(session.id);
  res.json({ success: true });
});

app.get('/api/auth/session/me', requireUserSession, (req, res) => {
  const session = req.userSession;
  if (!session) {
    return sendError(res, 401, 'Unauthorized', { code: 'AUTH_SESSION_INVALID' });
  }

  const pendingRoleRequests = [...roleAccessRequests.values()]
    .filter((request) => request.sessionId === session.id && request.status === 'pending')
    .map((request) => ({
      requestId: request.requestId,
      requestedRole: request.requestedRole,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt,
    }));

  return res.json({
    success: true,
    session: buildSessionClaims(session),
    pendingRoleRequests,
  });
});

app.post('/api/auth/student/email/start', authOtpLimiter, requireUserSession, async (req, res) => {
  const session = req.userSession;
  if (!session?.walletBound) {
    return sendError(res, 403, 'Wallet must be bound before student verification', {
      code: 'WALLET_BINDING_REQUIRED',
    });
  }

  const rawEmail = String(req.body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return sendError(res, 400, 'Invalid email format', { code: 'EMAIL_INVALID' });
  }

  const captcha = await verifyTurnstileToken(req.body?.captchaToken, getClientIp(req));
  if (!captcha.ok) {
    updateSessionRisk(session, 'student-email-start', {
      disposableDomain: false,
      unknownAcademicDomain: false,
      otpFailures: session.otpFailures,
      privilegedRoleRequest: false,
      captchaMissing: true,
      mockWalletBound: session.walletBindingMode === 'mock',
    });

    return sendError(res, 403, captcha.error || 'CAPTCHA verification failed', {
      code: captcha.code || 'CAPTCHA_FAILED',
      errors: captcha.errors || [],
    });
  }

  const normalizedEmail = normalizeEmailAddress(rawEmail);
  const evaluated = await evaluateStudentEmailDomain(normalizedEmail);
  if (!evaluated.ok) {
    const risk = updateSessionRisk(session, 'student-email-domain-rejected', {
      disposableDomain: Boolean(evaluated.disposable),
      unknownAcademicDomain: evaluated.code === 'STUDENT_DOMAIN_REVIEW_REQUIRED',
      otpFailures: session.otpFailures,
      privilegedRoleRequest: false,
      captchaMissing: false,
      mockWalletBound: session.walletBindingMode === 'mock',
    });

    if (evaluated.code === 'STUDENT_DOMAIN_REVIEW_REQUIRED') {
      const request = createRoleAccessRequest(session, 'student', 'domain_review');
      return sendError(res, 422, evaluated.error, {
        code: evaluated.code,
        domain: evaluated.domain,
        manualReviewRequestId: request.requestId,
        riskLevel: risk.level,
      });
    }

    return sendError(res, 400, evaluated.error, {
      code: evaluated.code,
      domain: evaluated.domain,
      riskLevel: risk.level,
    });
  }

  const otp = generateOtpCode();
  const now = toEpochSeconds();
  const challengeKey = getStudentOtpChallengeKey(session.id, normalizedEmail);
  studentOtpChallenges.set(challengeKey, {
    sessionId: session.id,
    email: normalizedEmail,
    otpHash: sha256Hex(`${session.id}:${normalizedEmail}:${otp}`),
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAtEpoch: now + STUDENT_OTP_TTL_SECONDS,
  });

  const delivery = await sendEmailOtpCode(normalizedEmail, otp);
  if (!delivery.success) {
    return sendError(res, 502, 'OTP delivery failed', {
      code: delivery.code || 'OTP_DELIVERY_FAILED',
      details: delivery.details || null,
    });
  }

  const risk = updateSessionRisk(session, 'student-email-start', {
    disposableDomain: false,
    unknownAcademicDomain: false,
    otpFailures: session.otpFailures,
    privilegedRoleRequest: false,
    captchaMissing: false,
    mockWalletBound: session.walletBindingMode === 'mock',
  });

  const payload = {
    success: true,
    method: 'email',
    email: maskEmail(normalizedEmail),
    domain: evaluated.domain,
    expiresAt: new Date((now + STUDENT_OTP_TTL_SECONDS) * 1000).toISOString(),
    riskLevel: risk.level,
    deliveryMode: delivery.mode,
  };

  if (delivery.mock && !isProduction) {
    payload.devOtpPreview = otp;
  }

  return res.json(payload);
});

app.post('/api/auth/student/email/verify', authOtpLimiter, requireUserSession, async (req, res) => {
  const session = req.userSession;
  const normalizedEmail = normalizeEmailAddress(req.body?.email);
  const code = String(req.body?.code || '').trim();

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return sendError(res, 400, 'Invalid email format', { code: 'EMAIL_INVALID' });
  }
  if (!/^\d{6}$/.test(code)) {
    return sendError(res, 400, 'Invalid OTP format', { code: 'OTP_INVALID_FORMAT' });
  }

  const challengeKey = getStudentOtpChallengeKey(session.id, normalizedEmail);
  const challenge = studentOtpChallenges.get(challengeKey);
  if (!challenge) {
    return sendError(res, 400, 'OTP challenge not found', { code: 'OTP_CHALLENGE_NOT_FOUND' });
  }

  const now = toEpochSeconds();
  if (challenge.expiresAtEpoch <= now) {
    studentOtpChallenges.delete(challengeKey);
    session.otpFailures += 1;
    updateSessionRisk(session, 'student-email-verify-expired', {
      disposableDomain: false,
      unknownAcademicDomain: false,
      otpFailures: session.otpFailures,
      privilegedRoleRequest: false,
      captchaMissing: false,
      mockWalletBound: session.walletBindingMode === 'mock',
    });
    return sendError(res, 400, 'OTP expired', { code: 'OTP_EXPIRED' });
  }

  if (challenge.attempts >= STUDENT_OTP_MAX_ATTEMPTS) {
    studentOtpChallenges.delete(challengeKey);
    return sendError(res, 429, 'Too many OTP attempts', { code: 'OTP_MAX_ATTEMPTS' });
  }

  const expectedHash = sha256Hex(`${session.id}:${normalizedEmail}:${code}`);
  if (!safeCompareText(expectedHash, challenge.otpHash)) {
    challenge.attempts += 1;
    session.otpFailures += 1;
    studentOtpChallenges.set(challengeKey, challenge);
    const remainingAttempts = Math.max(0, STUDENT_OTP_MAX_ATTEMPTS - challenge.attempts);

    updateSessionRisk(session, 'student-email-verify-failed', {
      disposableDomain: false,
      unknownAcademicDomain: false,
      otpFailures: session.otpFailures,
      privilegedRoleRequest: false,
      captchaMissing: false,
      mockWalletBound: session.walletBindingMode === 'mock',
    });

    if (remainingAttempts === 0) {
      studentOtpChallenges.delete(challengeKey);
    }

    return sendError(res, 401, 'Invalid OTP code', {
      code: 'OTP_INVALID',
      remainingAttempts,
    });
  }

  studentOtpChallenges.delete(challengeKey);
  session.studentVerified = true;
  session.verifiedEmail = normalizedEmail;
  session.otpFailures = 0;
  session.assuranceLevel = session.walletBindingMode === 'signature' ? 'medium' : session.assuranceLevel;
  session.updatedAt = new Date().toISOString();

  const tokens = issueTokenPairForSession(session);
  return res.json({
    success: true,
    verifiedEmail: maskEmail(normalizedEmail),
    session: tokens.claims,
    tokens,
  });
});

app.post('/api/auth/role/request', authRoleLimiter, requireUserSession, (req, res) => {
  const session = req.userSession;
  const role = String(req.body?.role || '').trim().toLowerCase();
  if (!role || !USER_ALLOWED_ROLES.has(role) || role === 'guest') {
    return sendError(res, 400, 'Invalid role request', {
      code: 'ROLE_INVALID',
      allowedRoles: [...USER_ALLOWED_ROLES].filter((item) => item !== 'guest'),
    });
  }

  if (!session.walletBound) {
    return sendError(res, 403, 'Wallet must be bound before role requests', {
      code: 'WALLET_BINDING_REQUIRED',
    });
  }

  if ((role === 'student' || role === 'verifier') && !session.studentVerified) {
    updateSessionRisk(session, 'role-request-rejected', {
      disposableDomain: false,
      unknownAcademicDomain: false,
      otpFailures: session.otpFailures,
      privilegedRoleRequest: false,
      captchaMissing: false,
      mockWalletBound: session.walletBindingMode === 'mock',
    });

    return sendError(res, 403, 'Student verification is required before requesting this role', {
      code: 'STUDENT_VERIFICATION_REQUIRED',
    });
  }

  if (PRIVILEGED_USER_ROLES.has(role)) {
    const existing = [...roleAccessRequests.values()].find(
      (request) => request.sessionId === session.id && request.requestedRole === role && request.status === 'pending',
    );
    if (existing) {
      return res.status(202).json({
        success: true,
        status: 'pending',
        requestId: existing.requestId,
        role,
        reason: existing.reason,
      });
    }

    const request = createRoleAccessRequest(
      session,
      role,
      Number(session.riskScore || 0) >= RISK_SCORE_STEPUP_THRESHOLD ? 'step_up_required' : 'manual_review',
    );
    updateSessionRisk(session, 'role-request-pending', {
      disposableDomain: false,
      unknownAcademicDomain: false,
      otpFailures: session.otpFailures,
      privilegedRoleRequest: true,
      captchaMissing: false,
      mockWalletBound: session.walletBindingMode === 'mock',
    });

    return res.status(202).json({
      success: true,
      status: 'pending',
      requestId: request.requestId,
      role,
      reason: request.reason,
    });
  }

  session.role = role;
  session.updatedAt = new Date().toISOString();
  if (role === 'verifier' && session.assuranceLevel === 'low') {
    session.assuranceLevel = 'medium';
  }

  const tokens = issueTokenPairForSession(session);
  return res.json({
    success: true,
    status: 'approved',
    role,
    session: tokens.claims,
    tokens,
  });
});

app.get('/api/auth/role/requests', requireApiRoles('governance'), (_req, res) => {
  const requests = [...roleAccessRequests.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 200)
    .map((request) => ({
      requestId: request.requestId,
      sessionId: request.sessionId,
      requestedRole: request.requestedRole,
      reason: request.reason,
      status: request.status,
      walletAddress: request.walletAddress,
      verifiedEmail: request.verifiedEmail ? maskEmail(request.verifiedEmail) : null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      reviewedBy: request.reviewedBy || null,
      reviewNote: request.reviewNote || null,
    }));
  res.json({ success: true, requests });
});

app.post('/api/auth/role/approve', requireApiRoles('governance'), (req, res) => {
  const requestId = String(req.body?.requestId || '').trim();
  const approve = req.body?.approve !== false;
  const reviewNote = isNonEmptyString(req.body?.reviewNote, 500) ? String(req.body.reviewNote).trim() : '';
  if (!isNonEmptyString(requestId, 200)) {
    return sendError(res, 400, 'Missing requestId', { code: 'ROLE_REQUEST_ID_REQUIRED' });
  }

  const request = roleAccessRequests.get(requestId);
  if (!request) {
    return sendError(res, 404, 'Role request not found', { code: 'ROLE_REQUEST_NOT_FOUND' });
  }
  if (request.status !== 'pending') {
    return sendError(res, 409, 'Role request is already finalized', {
      code: 'ROLE_REQUEST_FINALIZED',
      status: request.status,
    });
  }

  request.status = approve ? 'approved' : 'denied';
  request.reviewedBy = req.authRole || 'governance';
  request.reviewNote = reviewNote || null;
  request.updatedAt = new Date().toISOString();
  roleAccessRequests.set(requestId, request);

  const session = getSessionById(request.sessionId);
  if (!session) {
    return res.json({
      success: true,
      status: request.status,
      requestId,
      sessionFound: false,
    });
  }

  if (approve) {
    session.role = request.requestedRole;
    session.assuranceLevel = 'high';
    session.updatedAt = new Date().toISOString();
    updateSessionRisk(session, 'role-request-approved', {
      disposableDomain: false,
      unknownAcademicDomain: false,
      otpFailures: session.otpFailures,
      privilegedRoleRequest: true,
      captchaMissing: false,
      mockWalletBound: session.walletBindingMode === 'mock',
    });
  }

  return res.json({
    success: true,
    status: request.status,
    requestId,
    sessionFound: true,
    role: approve ? session.role : null,
    session: buildSessionClaims(session),
  });
});

// ---------------------------------------------------------------------------
// Gemini Proxy
// ---------------------------------------------------------------------------

app.post('/api/gemini/schema', externalApiLimiter, async (req, res) => {
  if (getSerializedSize(req.body) > 50_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const description = req.body?.description;
  if (!isNonEmptyString(description, 2_000)) {
    return sendError(res, 400, 'Invalid description');
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendError(res, 503, 'Gemini API not configured');
  }

  const prompt = [
    'Generate a strict JSON object for an academic credential schema.',
    'The JSON object must match this shape exactly:',
    '{',
    '  "schemaName": "string",',
    '  "fields": [',
    '    { "name": "string", "type": "string|number|date|boolean", "required": true|false }',
    '  ]',
    '}',
    'Return JSON only. No markdown.',
    `Description: ${description.trim()}`,
  ].join('\n');

  try {
    const raw = await withTimeout(
      callGemini({ prompt, responseMimeType: 'application/json' }),
      EXTERNAL_API_TIMEOUT_MS,
      'Gemini schema generation',
    );

    const parsed = normalizeSchemaPayload(parseLooseJson(raw));
    res.json(parsed);
  } catch (error) {
    console.error('[proxy] Gemini schema error:', error?.message || error);
    sendError(res, 502, 'Gemini schema request failed');
  }
});

app.post('/api/gemini/trust', externalApiLimiter, async (req, res) => {
  if (getSerializedSize(req.body) > 50_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const credentialData = req.body?.credentialData;
  if (!credentialData) {
    return sendError(res, 400, 'Missing credentialData');
  }

  if (!process.env.GEMINI_API_KEY) {
    return sendError(res, 503, 'Gemini API not configured');
  }

  const serialized = JSON.stringify(credentialData);
  if (!isNonEmptyString(serialized, 25_000)) {
    return sendError(res, 400, 'credentialData payload is too large or invalid');
  }

  const prompt = [
    'You are generating a trust summary for a verifiable credential.',
    'Provide a concise professional summary in a maximum of 2 sentences.',
    'Avoid markdown and bullet points.',
    `Credential JSON: ${serialized}`,
  ].join('\n');

  try {
    const summary = await withTimeout(
      callGemini({ prompt, responseMimeType: 'text/plain' }),
      EXTERNAL_API_TIMEOUT_MS,
      'Gemini trust analysis',
    );

    res.json({ summary: summary.trim() });
  } catch (error) {
    console.error('[proxy] Gemini trust error:', error?.message || error);
    sendError(res, 502, 'Gemini trust request failed');
  }
});

// ---------------------------------------------------------------------------
// IPFS / Pinata Proxy
// ---------------------------------------------------------------------------

app.post('/api/ipfs/upload', externalApiLimiter, async (req, res) => {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return sendError(res, 503, 'Pinata not configured');
  }

  const data = req.body?.data;
  const metadata = req.body?.metadata;
  if (typeof data === 'undefined' || !isPlainObject(metadata)) {
    return sendError(res, 400, 'Missing data or metadata');
  }

  let jsonString = '';
  try {
    jsonString = JSON.stringify(data, null, 2);
  } catch {
    return sendError(res, 400, 'Data must be JSON serializable');
  }

  if (jsonString.length > 1_000_000) {
    return sendError(res, 413, 'Payload too large for upload');
  }

  const originalFileName = isNonEmptyString(metadata.originalFileName, 255)
    ? metadata.originalFileName
    : 'data.json';
  const safeFileName = sanitizeFileName(originalFileName);

  try {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob, safeFileName);
    formData.append('pinataMetadata', JSON.stringify({ name: safeFileName }));
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const response = await fetchWithTimeout(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      {
        method: 'POST',
        headers: {
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretKey,
        },
        body: formData,
      },
      EXTERNAL_API_TIMEOUT_MS,
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Pinata upload failed ${response.status}: ${message.slice(0, 200)}`);
    }

    const payload = await response.json();
    res.json({
      cid: payload.IpfsHash || payload.cid,
      size: payload.PinSize || 0,
      pinnedNodes: ['pinata'],
    });
  } catch (error) {
    console.error('[proxy] IPFS upload error:', error?.message || error);
    sendError(res, 502, 'IPFS upload failed');
  }
});

app.post('/api/ipfs/pin', externalApiLimiter, async (req, res) => {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return sendError(res, 503, 'Pinata not configured');
  }

  const cid = req.body?.cid;
  if (!isNonEmptyString(cid, 200)) {
    return sendError(res, 400, 'Invalid CID');
  }

  try {
    const response = await fetchWithTimeout(
      'https://api.pinata.cloud/pinning/pinByHash',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretKey,
        },
        body: JSON.stringify({ hashToPin: cid.trim() }),
      },
      EXTERNAL_API_TIMEOUT_MS,
    );

    res.json({ success: response.ok });
  } catch (error) {
    console.error('[proxy] IPFS pin error:', error?.message || error);
    sendError(res, 502, 'Pin request failed');
  }
});

// ---------------------------------------------------------------------------
// Governance Institution Registry (File-based persistence)
// ---------------------------------------------------------------------------

app.get('/api/governance/institutions', async (_req, res) => {
  try {
    const institutions = await readStore(INSTITUTIONS_FILE, INSTITUTIONS_DEFAULT);
    res.json({ institutions: Array.isArray(institutions) ? institutions : [] });
  } catch (error) {
    console.error('[governance] list institutions error:', error?.message || error);
    sendError(res, 500, 'Failed to list institutions');
  }
});

app.post(
  '/api/governance/institutions',
  governanceWriteLimiter,
  requireApiRoles('governance'),
  async (req, res) => {
    if (getSerializedSize(req.body) > 100_000) {
      return sendError(res, 413, 'Payload too large');
    }

    const name = normalizeInstitutionName(req.body?.name);
    const address = normalizeInstitutionAddress(req.body?.address);
    const role = normalizeInstitutionRole(req.body?.role);
    const kycStatus = normalizeInstitutionKycStatus(req.body?.kycStatus);

    const nameError = validateInstitutionName(name);
    if (nameError) {
      return sendError(res, 400, nameError, { field: 'name' });
    }

    if (!isNonEmptyString(address, 200)) {
      return sendError(res, 400, 'Institution address is required and must be 200 characters or less', {
        field: 'address',
      });
    }

    if (!INSTITUTION_ALLOWED_ROLES.has(role)) {
      return sendError(res, 400, 'Invalid institution role', {
        field: 'role',
        allowed: [...INSTITUTION_ALLOWED_ROLES],
      });
    }

    if (!INSTITUTION_ALLOWED_KYC_STATUS.has(kycStatus)) {
      return sendError(res, 400, 'Invalid institution KYC status', {
        field: 'kycStatus',
        allowed: [...INSTITUTION_ALLOWED_KYC_STATUS],
      });
    }

    try {
      const createdInstitution = await withStoreLock(INSTITUTIONS_FILE, async () => {
        const rawInstitutions = await readStore(INSTITUTIONS_FILE, INSTITUTIONS_DEFAULT);
        const institutions = Array.isArray(rawInstitutions) ? rawInstitutions : [];

        const duplicateAddress = institutions.some((entry) => (
          normalizeInstitutionAddress(entry?.address).toLowerCase() === address.toLowerCase()
        ));

        if (duplicateAddress) {
          return null;
        }

        const now = new Date().toISOString();
        const institution = {
          id: randomUUID(),
          address,
          name,
          role,
          kycStatus,
          addedDate: now,
          updatedAt: now,
        };

        institutions.push(institution);
        await writeStore(INSTITUTIONS_FILE, institutions);
        return institution;
      });

      if (!createdInstitution) {
        return sendError(res, 409, 'Institution address is already registered');
      }

      console.info(`[governance] institution added ${createdInstitution.id}`);
      res.status(201).json({ success: true, institution: createdInstitution });
    } catch (error) {
      console.error('[governance] create institution error:', error?.message || error);
      sendError(res, 500, 'Failed to add institution');
    }
  },
);

app.patch(
  '/api/governance/institutions/:id',
  governanceWriteLimiter,
  requireApiRoles('governance'),
  async (req, res) => {
    if (getSerializedSize(req.body) > 50_000) {
      return sendError(res, 413, 'Payload too large');
    }

    const institutionId = String(req.params.id || '').trim();
    if (!isNonEmptyString(institutionId, 128)) {
      return sendError(res, 400, 'Invalid institution ID');
    }

    if (!isPlainObject(req.body)) {
      return sendError(res, 400, 'Invalid update payload');
    }

    const allowedKeys = new Set(['role', 'kycStatus']);
    const payloadKeys = Object.keys(req.body);
    const disallowedKeys = payloadKeys.filter((key) => !allowedKeys.has(key));

    if (disallowedKeys.length > 0) {
      return sendError(res, 400, 'Only role and kycStatus are editable', {
        disallowedKeys,
      });
    }

    const hasRoleUpdate = Object.prototype.hasOwnProperty.call(req.body, 'role');
    const hasKycUpdate = Object.prototype.hasOwnProperty.call(req.body, 'kycStatus');

    if (!hasRoleUpdate && !hasKycUpdate) {
      return sendError(res, 400, 'Missing editable fields. Provide role and/or kycStatus.');
    }

    const normalizedRole = hasRoleUpdate
      ? normalizeInstitutionRole(req.body.role)
      : null;
    const normalizedKycStatus = hasKycUpdate
      ? normalizeInstitutionKycStatus(req.body.kycStatus)
      : null;

    if (hasRoleUpdate && !INSTITUTION_ALLOWED_ROLES.has(normalizedRole)) {
      return sendError(res, 400, 'Invalid institution role', {
        field: 'role',
        allowed: [...INSTITUTION_ALLOWED_ROLES],
      });
    }

    if (hasKycUpdate && !INSTITUTION_ALLOWED_KYC_STATUS.has(normalizedKycStatus)) {
      return sendError(res, 400, 'Invalid institution KYC status', {
        field: 'kycStatus',
        allowed: [...INSTITUTION_ALLOWED_KYC_STATUS],
      });
    }

    try {
      const updatedInstitution = await withStoreLock(INSTITUTIONS_FILE, async () => {
        const rawInstitutions = await readStore(INSTITUTIONS_FILE, INSTITUTIONS_DEFAULT);
        const institutions = Array.isArray(rawInstitutions) ? rawInstitutions : [];
        const index = institutions.findIndex((entry) => entry?.id === institutionId);

        if (index === -1) {
          return null;
        }

        const existing = institutions[index];
        const now = new Date().toISOString();
        const updated = {
          ...existing,
          role: hasRoleUpdate ? normalizedRole : existing.role,
          kycStatus: hasKycUpdate ? normalizedKycStatus : existing.kycStatus,
          updatedAt: now,
        };

        institutions[index] = updated;
        await writeStore(INSTITUTIONS_FILE, institutions);
        return updated;
      });

      if (!updatedInstitution) {
        return sendError(res, 404, 'Institution not found');
      }

      console.info(`[governance] institution updated ${updatedInstitution.id}`);
      res.json({ success: true, institution: updatedInstitution });
    } catch (error) {
      console.error('[governance] update institution error:', error?.message || error);
      sendError(res, 500, 'Failed to update institution');
    }
  },
);

// ---------------------------------------------------------------------------
// DID Registry (File-based persistence)
// ---------------------------------------------------------------------------

app.get('/api/did', async (_req, res) => {
  try {
    const dids = await readStore(DID_FILE, DID_DEFAULT);
    const result = dids.map((entry) => ({
      did: entry.id || entry.did,
      created: entry.created || entry.updated || new Date(0).toISOString(),
      role: entry.metadata?.role || 'unknown',
    }));
    res.json(result);
  } catch (error) {
    console.error('[did] list error:', error?.message || error);
    sendError(res, 500, 'Failed to list DIDs');
  }
});

app.get('/api/did/:did', async (req, res) => {
  const did = normalizeDidParam(req.params.did);
  if (!isNonEmptyString(did, 300)) {
    return sendError(res, 400, 'Invalid DID');
  }

  try {
    const dids = await readStore(DID_FILE, DID_DEFAULT);
    const record = dids.find((entry) => entry.id === did || entry.did === did);
    if (!record) {
      return sendError(res, 404, 'DID not found');
    }
    res.json(record);
  } catch (error) {
    console.error('[did] resolve error:', error?.message || error);
    sendError(res, 500, 'Failed to resolve DID');
  }
});

app.post('/api/did', didWriteLimiter, requireApiRoles('issuer', 'governance'), async (req, res) => {
  if (getSerializedSize(req.body) > 200_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const didDocument = req.body?.didDocument;
  const metadata = req.body?.metadata;
  if (!isPlainObject(didDocument) || !isNonEmptyString(didDocument.id, 300)) {
    return sendError(res, 400, 'Invalid DID document');
  }

  try {
    const created = await withStoreLock(DID_FILE, async () => {
      const dids = await readStore(DID_FILE, DID_DEFAULT);
      const alreadyExists = dids.some((entry) => entry.id === didDocument.id || entry.did === didDocument.id);
      if (alreadyExists) {
        return null;
      }

      const now = new Date().toISOString();
      const entry = {
        id: didDocument.id,
        document: didDocument,
        metadata: isPlainObject(metadata) ? metadata : {},
        created: now,
        updated: now,
      };
      dids.push(entry);
      await writeStore(DID_FILE, dids);
      return entry;
    });

    if (!created) {
      return sendError(res, 409, 'DID already exists');
    }

    console.info(`[did] registered ${didDocument.id}`);
    res.status(201).json({ success: true, did: didDocument.id });
  } catch (error) {
    console.error('[did] register error:', error?.message || error);
    sendError(res, 500, 'Failed to register DID');
  }
});

app.put('/api/did/:did', didWriteLimiter, requireApiRoles('issuer', 'governance'), async (req, res) => {
  if (getSerializedSize(req.body) > 200_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const did = normalizeDidParam(req.params.did);
  if (!isNonEmptyString(did, 300)) {
    return sendError(res, 400, 'Invalid DID');
  }

  const didDocument = req.body?.didDocument;
  const metadata = req.body?.metadata;
  if (
    (typeof didDocument !== 'undefined' && !isPlainObject(didDocument)) ||
    (typeof metadata !== 'undefined' && !isPlainObject(metadata))
  ) {
    return sendError(res, 400, 'Invalid update payload');
  }

  try {
    const updated = await withStoreLock(DID_FILE, async () => {
      const dids = await readStore(DID_FILE, DID_DEFAULT);
      const index = dids.findIndex((entry) => entry.id === did || entry.did === did);
      if (index === -1) return false;

      const existing = dids[index];
      dids[index] = {
        ...existing,
        document: isPlainObject(didDocument) ? { ...existing.document, ...didDocument } : existing.document,
        metadata: isPlainObject(metadata) ? { ...existing.metadata, ...metadata } : existing.metadata,
        updated: new Date().toISOString(),
      };

      await writeStore(DID_FILE, dids);
      return true;
    });

    if (!updated) {
      return sendError(res, 404, 'DID not found');
    }

    console.info(`[did] updated ${did}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[did] update error:', error?.message || error);
    sendError(res, 500, 'Failed to update DID');
  }
});

app.delete('/api/did/:did', didWriteLimiter, requireApiRoles('issuer', 'governance'), async (req, res) => {
  const did = normalizeDidParam(req.params.did);
  if (!isNonEmptyString(did, 300)) {
    return sendError(res, 400, 'Invalid DID');
  }

  try {
    const revoked = await withStoreLock(DID_FILE, async () => {
      const dids = await readStore(DID_FILE, DID_DEFAULT);
      const index = dids.findIndex((entry) => entry.id === did || entry.did === did);
      if (index === -1) return false;

      const existing = dids[index];
      dids[index] = {
        ...existing,
        document: { ...existing.document, deactivated: true },
        metadata: { ...existing.metadata, status: 'revoked' },
        updated: new Date().toISOString(),
      };
      await writeStore(DID_FILE, dids);
      return true;
    });

    if (!revoked) {
      return sendError(res, 404, 'DID not found');
    }

    console.info(`[did] revoked ${did}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[did] revoke error:', error?.message || error);
    sendError(res, 500, 'Failed to revoke DID');
  }
});

// ---------------------------------------------------------------------------
// Blockchain Persistence (File-based simulation)
// ---------------------------------------------------------------------------

app.post(
  '/api/blockchain/transaction',
  blockchainWriteLimiter,
  requireApiRoles('issuer', 'governance'),
  async (req, res) => {
  if (getSerializedSize(req.body) > 300_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const transaction = req.body?.transaction;
  if (!isPlainObject(transaction) || !isNonEmptyString(transaction.id, 200)) {
    return sendError(res, 400, 'Invalid transaction');
  }

  try {
    await withStoreLock(BLOCKCHAIN_FILE, async () => {
      const chainData = await readStore(BLOCKCHAIN_FILE, BLOCKCHAIN_DEFAULT);
      chainData.pending.push(transaction);
      await writeStore(BLOCKCHAIN_FILE, chainData);
    });

    res.json({ success: true, txId: transaction.id });
  } catch (error) {
    console.error('[blockchain] queue tx error:', error?.message || error);
    sendError(res, 500, 'Failed to queue transaction');
  }
  },
);

app.post('/api/blockchain/block', blockchainWriteLimiter, requireApiRoles('governance'), async (req, res) => {
  if (getSerializedSize(req.body) > 10_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const validator = isNonEmptyString(req.body?.validator, 200)
    ? req.body.validator.trim()
    : 'unknown-validator';

  try {
    const result = await withStoreLock(BLOCKCHAIN_FILE, async () => {
      const chainData = await readStore(BLOCKCHAIN_FILE, BLOCKCHAIN_DEFAULT);
      if (!Array.isArray(chainData.pending) || chainData.pending.length === 0) {
        return { success: false, message: 'No pending transactions' };
      }

      const previousBlock = chainData.chain[chainData.chain.length - 1];
      const block = {
        index: chainData.chain.length,
        timestamp: new Date().toISOString(),
        transactions: chainData.pending,
        validator,
        previousHash: previousBlock?.hash || '0',
      };

      block.hash = createHash('sha256').update(JSON.stringify(block)).digest('hex');
      chainData.chain.push(block);
      chainData.pending = [];
      await writeStore(BLOCKCHAIN_FILE, chainData);

      return { success: true, block };
    });

    res.json(result);
  } catch (error) {
    console.error('[blockchain] mine error:', error?.message || error);
    sendError(res, 500, 'Failed to mine block');
  }
});

app.post(
  '/api/blockchain/private/store',
  blockchainWriteLimiter,
  requireApiRoles('issuer', 'governance'),
  async (req, res) => {
  if (getSerializedSize(req.body) > 750_000) {
    return sendError(res, 413, 'Payload too large');
  }

  const credentialId = req.body?.credentialId;
  const encryptedData = req.body?.encryptedData;

  if (!isNonEmptyString(credentialId, 200) || !isPlainObject(encryptedData)) {
    return sendError(res, 400, 'Invalid private chain payload');
  }

  try {
    await withStoreLock(PRIVATE_CHAIN_FILE, async () => {
      const privateData = await readStore(PRIVATE_CHAIN_FILE, PRIVATE_CHAIN_DEFAULT);
      privateData[credentialId] = encryptedData;
      await writeStore(PRIVATE_CHAIN_FILE, privateData);
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[blockchain] private store error:', error?.message || error);
    sendError(res, 500, 'Failed to store private data');
  }
  },
);

// ---------------------------------------------------------------------------
// Email and MFA
// ---------------------------------------------------------------------------

app.post('/api/email/notify', mfaLimiter, requireApiRoles('issuer', 'governance'), async (req, res) => {
  const to = req.body?.to;
  const subject = req.body?.subject;
  const body = req.body?.body;

  if (!isNonEmptyString(to, 320) || !isNonEmptyString(subject, 180) || !isNonEmptyString(body, 10_000)) {
    return sendError(res, 400, 'Invalid email payload');
  }

  const emailStatus = getEmailDeliveryStatus();
  if (emailStatus.mode === 'mock') {
    console.info(`[email-mock] to=${to} subject="${subject}"`);
    return res.json({
      success: true,
      mode: 'mock',
      provider: emailStatus.provider,
      mock: true,
    });
  }

  if (!emailStatus.smtp.configured) {
    return sendError(res, 503, 'Email service not configured', getEmailErrorDetails('EMAIL_NOT_CONFIGURED'));
  }

  const transport = getMailTransport();
  if (!transport) {
    return sendError(res, 503, 'Email service not configured', getEmailErrorDetails('EMAIL_NOT_CONFIGURED'));
  }

  try {
    await transport.sendMail({
      from: emailStatus.smtp.from,
      to: to.trim(),
      subject: subject.trim(),
      text: body,
    });
    res.json({
      success: true,
      mode: 'smtp',
      provider: emailStatus.provider,
    });
  } catch (error) {
    console.error('[email] send error:', error?.message || error);
    const classified = classifyEmailSendError(error);
    sendError(res, 502, classified.message, getEmailErrorDetails(classified.code));
  }
});

app.post('/api/mfa/send-otp', mfaLimiter, requireApiRoles('issuer', 'governance'), async (req, res) => {
  const method = String(req.body?.method || '').toLowerCase();
  const contact = typeof req.body?.contact === 'string' ? req.body.contact.trim() : '';
  if (!method || !contact) {
    return sendError(res, 400, 'Missing method or contact');
  }
  if (method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return sendError(res, 400, 'Invalid email format');
  }
  if (method === 'sms' && !/^\+?[\d\s\-()]{10,20}$/.test(contact)) {
    return sendError(res, 400, 'Invalid phone number format');
  }

  // OTP must be generated server-side to prevent client-controlled code injection.
  const otp = generateOtpCode();
  const message = `Your Morningstar Credentials verification code is: ${otp}. It expires in 5 minutes.`;

  try {
    if (method === 'sms') {
      const sent = await withTimeout(sendSms(contact, message), EXTERNAL_API_TIMEOUT_MS, 'SMS request');
      if (!sent) {
        return sendError(res, 503, 'SMS service not configured');
      }
      const payload = {
        success: true,
        method: 'sms',
        contact: `***${contact.slice(-4)}`,
      };
      if (!isProduction) {
        payload.devOtpPreview = otp;
      }
      return res.json(payload);
    }

    if (method === 'email') {
      const delivery = await sendEmailOtpCode(contact, otp);
      if (!delivery.success) {
        return sendError(res, 502, 'OTP delivery failed', {
          code: delivery.code || 'OTP_DELIVERY_FAILED',
          details: delivery.details || null,
        });
      }

      const payload = {
        success: true,
        method: 'email',
        mode: delivery.mode,
        provider: delivery.provider,
        contact: maskEmail(contact),
      };
      if (!isProduction && delivery.mock) {
        payload.devOtpPreview = otp;
      }
      return res.json(payload);
    }

    return sendError(res, 400, `Unsupported method: ${method}`);
  } catch (error) {
    console.error('[mfa] OTP delivery error:', error?.message || error);
    return sendError(res, 502, 'OTP delivery failed');
  }
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use((error, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
    sendError(res, 400, 'Invalid JSON payload');
    return;
  }

  if (error?.message === 'CORS_ORIGIN_DENIED') {
    sendError(res, 403, 'Origin is not allowed by CORS policy');
    return;
  }

  console.error('[server] Unhandled error:', error);
  sendError(res, 500, 'Internal server error');
});

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------

async function startServer() {
  if (httpServer) {
    return httpServer;
  }

  await storageReady;

  httpServer = app.listen(PORT, HOST, () => {
    console.log(`[morningstar-api] Proxy server running on port ${PORT}`);
    console.log(`[morningstar-api] Listening on ${HOST}:${PORT}`);
    console.log(`[morningstar-api] Allowed origins: ${ALLOWED_ORIGIN_LABEL}`);
    console.log(`[morningstar-api] JSON body limit: ${JSON_BODY_LIMIT}`);
    if (isProduction && ALLOWED_ORIGINS.allowAll) {
      console.warn('[morningstar-api] ALLOWED_ORIGINS=* in production increases CSRF/data-exfiltration risk.');
    }

    const required = ['GEMINI_API_KEY', 'PINATA_API_KEY', 'PINATA_SECRET_KEY'];
    const optional = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_PHONE_NUMBER',
      'SMTP_PASSWORD',
      'SMTP_FROM',
      'AUTH_TOKEN_SECRET',
      'TURNSTILE_SECRET_KEY',
      'SENTRY_DSN',
    ];

    const missingRequired = required.filter((name) => !process.env[name]);
    const missingOptional = optional.filter((name) => !process.env[name]);

    if (missingRequired.length > 0) {
      console.warn(`[morningstar-api] Missing required env vars: ${missingRequired.join(', ')}`);
    }
    if (missingOptional.length > 0) {
      console.info(`[morningstar-api] Unconfigured optional services: ${missingOptional.join(', ')}`);
    }

    const authTokenCount = getConfiguredApiTokenCount();
    console.log(`[morningstar-api] API auth mode=${API_AUTH_MODE}`);
    if (API_AUTH_MODE === 'required' && authTokenCount === 0) {
      console.warn('[morningstar-api] API_AUTH_MODE=required but no API_*_TOKEN values are configured.');
    }
    console.log(
      `[morningstar-api] User auth enabled (accessTTL=${ACCESS_TOKEN_TTL_SECONDS}s refreshTTL=${REFRESH_TOKEN_TTL_SECONDS}s sessionTTL=${AUTH_SESSION_TTL_SECONDS}s)`,
    );
    if (!HAS_STATIC_AUTH_SECRET) {
      console.warn('[morningstar-api] AUTH_TOKEN_SECRET is not set; using ephemeral in-memory secret.');
    }
    if (TURNSTILE_REQUIRED && !TURNSTILE_SECRET_KEY) {
      console.warn('[morningstar-api] TURNSTILE_REQUIRED=true but TURNSTILE_SECRET_KEY is missing.');
    }
    if (isProduction && !EXPOSE_EMAIL_HEALTH_DETAILS) {
      console.info('[morningstar-api] /api/email/health sensitive SMTP details are redacted.');
    }

    const emailStatus = getEmailDeliveryStatus();
    console.log(
      `[morningstar-api] Email mode=${emailStatus.mode} (requested=${emailStatus.requestedMode}, provider=${emailStatus.provider})`,
    );
    if (emailStatus.requestedMode === 'smtp' && !emailStatus.smtp.configured) {
      console.warn(`[morningstar-api] SMTP mode requested but missing: ${emailStatus.smtp.missing.join(', ')}`);
    } else if (emailStatus.requestedMode === 'auto' && emailStatus.mode === 'mock') {
      console.info(
        `[morningstar-api] Email running in mock mode; missing SMTP values: ${emailStatus.smtp.missing.join(', ')}`,
      );
    }
    if (emailStatus.provider === 'sendgrid' && emailStatus.mode === 'smtp' && emailStatus.smtp.user !== 'apikey') {
      console.warn('[morningstar-api] SendGrid provider usually expects SMTP_USER=apikey.');
    }
  });

  httpServer.keepAliveTimeout = toInt(process.env.KEEP_ALIVE_TIMEOUT_MS, 65_000, 1_000, 120_000);
  httpServer.headersTimeout = toInt(process.env.HEADERS_TIMEOUT_MS, 66_000, 2_000, 180_000);
  httpServer.requestTimeout = toInt(process.env.REQUEST_TIMEOUT_MS, 30_000, 5_000, 300_000);
  httpServer.maxRequestsPerSocket = toInt(process.env.MAX_REQUESTS_PER_SOCKET, 1_000, 0, 100_000);

  const shutdown = (signal) => {
    console.info(`[morningstar-api] ${signal} received, shutting down gracefully...`);
    httpServer.close(() => {
      console.info('[morningstar-api] shutdown complete');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[morningstar-api] forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return httpServer;
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isDirectExecution) {
  startServer().catch((error) => {
    console.error('[morningstar-api] failed to start:', error);
    process.exit(1);
  });
}

export { app, startServer };
export default app;
