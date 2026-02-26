import type { Role } from '../types';
import { api } from './env';
import { logger } from './logger';

type ManagedRole = Exclude<Role, 'guest'>;

export interface AuthSessionClaims {
  sessionId: string;
  role: Role;
  walletAddress: string | null;
  walletBound: boolean;
  studentVerified: boolean;
  verifiedEmail: string | null;
  assuranceLevel: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number;
}

export interface TokenBundle {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface SessionStartResponse {
  success: boolean;
  sessionId: string;
  challengeMessage: string;
  expiresAt: string;
}

export interface RoleRequestResponse {
  success: boolean;
  status: 'approved' | 'pending';
  role: ManagedRole;
  requestId?: string;
  reason?: string;
  session?: AuthSessionClaims;
  tokens?: TokenBundle;
}

interface StudentEmailStartResponse {
  success: boolean;
  method: 'email';
  email: string;
  domain: string;
  expiresAt: string;
  riskLevel: 'low' | 'medium' | 'high';
  deliveryMode: 'mock' | 'smtp';
  devOtpPreview?: string;
}

interface SessionMeResponse {
  success: boolean;
  session: AuthSessionClaims;
  pendingRoleRequests: Array<{
    requestId: string;
    requestedRole: ManagedRole;
    reason: string;
    status: 'pending';
    createdAt: string;
  }>;
}

class AuthServiceError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status: number, code = 'AUTH_ERROR', details: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const SESSION_ID_KEY = 'auth_session_id';
const WALLET_KEY = 'auth_wallet_address';

function safeStorageGet(key: string): string {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function safeStorageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function normalizeWalletAddress(value: string): string {
  return String(value || '').trim().toLowerCase();
}

async function parseApiError(response: Response): Promise<AuthServiceError> {
  let payload: Record<string, unknown> | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const message = String(payload?.error || `Request failed (${response.status})`);
  const code = String((payload?.details as { code?: string } | undefined)?.code || 'AUTH_ERROR');
  return new AuthServiceError(message, response.status, code, payload?.details ?? null);
}

class AuthService {
  private refreshInFlight: Promise<boolean> | null = null;

  getAccessToken(): string {
    return safeStorageGet(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string {
    return safeStorageGet(REFRESH_TOKEN_KEY);
  }

  getBoundWalletAddress(): string {
    return safeStorageGet(WALLET_KEY);
  }

  clearSession(): void {
    safeStorageRemove(ACCESS_TOKEN_KEY);
    safeStorageRemove(REFRESH_TOKEN_KEY);
    safeStorageRemove(SESSION_ID_KEY);
    safeStorageRemove(WALLET_KEY);
  }

  private persistTokens(tokens: TokenBundle): void {
    safeStorageSet(ACCESS_TOKEN_KEY, tokens.accessToken);
    safeStorageSet(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  private persistSessionIdentity(session: AuthSessionClaims): void {
    safeStorageSet(SESSION_ID_KEY, session.sessionId);
    if (session.walletAddress) {
      safeStorageSet(WALLET_KEY, normalizeWalletAddress(session.walletAddress));
    }
  }

  private async fetchWithAuthRetry(input: string, init: RequestInit = {}): Promise<Response> {
    const token = this.getAccessToken();
    const response = await fetch(api.url(input), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (response.status !== 401) {
      return response;
    }

    const refreshed = await this.refreshTokens();
    if (!refreshed) {
      return response;
    }

    const retryToken = this.getAccessToken();
    return fetch(api.url(input), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        ...(retryToken ? { Authorization: `Bearer ${retryToken}` } : {}),
      },
    });
  }

  async startSession(walletAddress: string, captchaToken?: string): Promise<SessionStartResponse> {
    const response = await fetch(api.url('/api/auth/session/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: normalizeWalletAddress(walletAddress),
        ...(captchaToken ? { captchaToken } : {}),
      }),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  }

  async bindWallet(
    sessionId: string,
    walletAddress: string,
    signature: string,
  ): Promise<{ session: AuthSessionClaims; tokens: TokenBundle; walletBindingMode: string }> {
    const response = await fetch(api.url('/api/auth/session/bind-wallet'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        walletAddress: normalizeWalletAddress(walletAddress),
        signature,
      }),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const payload = await response.json();
    this.persistTokens(payload.tokens);
    this.persistSessionIdentity(payload.session);
    return payload;
  }

  async bootstrapWalletSession(
    walletAddress: string,
    signMessage: (message: string) => Promise<string>,
    captchaToken?: string,
  ): Promise<AuthSessionClaims> {
    const normalizedWallet = normalizeWalletAddress(walletAddress);
    const existingWallet = this.getBoundWalletAddress();
    if (existingWallet && existingWallet === normalizedWallet) {
      const existing = await this.getSessionMe();
      if (existing?.walletBound) {
        return existing;
      }
    }

    const started = await this.startSession(normalizedWallet, captchaToken);
    const signature = await signMessage(started.challengeMessage);
    const bound = await this.bindWallet(started.sessionId, normalizedWallet, signature);
    return bound.session;
  }

  async refreshTokens(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        this.clearSession();
        return false;
      }

      try {
        const response = await fetch(api.url('/api/auth/session/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          this.clearSession();
          return false;
        }

        const payload = await response.json();
        this.persistTokens(payload.tokens);
        this.persistSessionIdentity(payload.session);
        return true;
      } catch (error) {
        logger.warn('[Auth] Refresh token request failed', error);
        this.clearSession();
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async getSessionMe(): Promise<AuthSessionClaims | null> {
    if (!this.getAccessToken()) {
      return null;
    }

    const response = await this.fetchWithAuthRetry('/api/auth/session/me', { method: 'GET' });
    if (response.status === 401) {
      this.clearSession();
      return null;
    }

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const payload = (await response.json()) as SessionMeResponse;
    this.persistSessionIdentity(payload.session);
    return payload.session;
  }

  async startStudentEmailVerification(
    email: string,
    captchaToken?: string,
  ): Promise<StudentEmailStartResponse> {
    const response = await this.fetchWithAuthRetry('/api/auth/student/email/start', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        ...(captchaToken ? { captchaToken } : {}),
      }),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return response.json();
  }

  async verifyStudentEmail(
    email: string,
    code: string,
  ): Promise<{ session: AuthSessionClaims; tokens: TokenBundle }> {
    const response = await this.fetchWithAuthRetry('/api/auth/student/email/verify', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        code: code.trim(),
      }),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const payload = await response.json();
    this.persistTokens(payload.tokens);
    this.persistSessionIdentity(payload.session);
    return payload;
  }

  async requestRole(role: ManagedRole): Promise<RoleRequestResponse> {
    const response = await this.fetchWithAuthRetry('/api/auth/role/request', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const payload = (await response.json()) as RoleRequestResponse;
    if (payload.tokens) {
      this.persistTokens(payload.tokens);
    }
    if (payload.session) {
      this.persistSessionIdentity(payload.session);
    }
    return payload;
  }
}

export const authService = new AuthService();
export { AuthServiceError };
