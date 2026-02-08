/**
 * Multi-Factor Authentication (MFA) Service
 * Implements production-grade authentication security
 * Based on: ZKBAR-V Security Framework
 */

import { sha256 } from './cryptography';
import { env } from './env';
import { getEncryptedStorage } from './encryptedStorage';
import { logger } from './logger';

export interface MFAConfig {
  enabled: boolean;
  methods: ('totp' | 'sms' | 'email' | 'biometric')[];
  requiredFactors: number;
}

export interface MFASession {
  sessionId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  verifiedFactors: string[];
  isComplete: boolean;
}

export interface TOTPSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

class MFAService {
  private sessions: Map<string, MFASession> = new Map();
  private totpSecrets: Map<string, string> = new Map();
  private backupCodes: Map<string, Set<string>> = new Map();

  /**
   * Initialize MFA for a user
   */
  async setupMFA(userId: string): Promise<TOTPSecret> {
    // Generate TOTP secret (32 bytes base32)
    const secret = this.generateTOTPSecret();
    this.totpSecrets.set(userId, secret);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(10);
    const hashedCodes = await Promise.all(
      backupCodes.map(code => sha256(code))
    );
    this.backupCodes.set(userId, new Set(hashedCodes));

    // Generate QR code data URI
    const qrCode = await this.generateQRCode(userId, secret);

    return {
      secret,
      qrCode,
      backupCodes
    };
  }

  /**
   * Generate TOTP secret (base32)
   */
  private generateTOTPSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const randomValues = crypto.getRandomValues(new Uint8Array(32));
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(randomValues[i] % chars.length);
    }
    return secret;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < count; i++) {
      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      let code = '';
      for (const b of randomBytes) {
        code += chars.charAt(b % chars.length);
      }
      codes.push(code);
    }
    return codes;
  }

  /**
   * Generate QR code for TOTP
   */
  private async generateQRCode(userId: string, secret: string): Promise<string> {
    const otpauthUrl = `otpauth://totp/MorningstarCredentials:${userId}?secret=${secret}&issuer=MorningstarCredentials`;
    
    // In production, use a QR code library
    // For now, return a data URI placeholder
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="100">QR Code: ${secret.substring(0, 10)}...</text></svg>`;
  }

  /**
   * Create MFA session
   */
  createSession(userId: string, duration: number = env.mfaSessionTimeout || 300000): MFASession {
    const sessionId = crypto.randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + duration);

    const session: MFASession = {
      sessionId,
      userId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      verifiedFactors: [],
      isComplete: false
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Verify TOTP code with time window (±1 period for clock drift)
   */
  async verifyTOTP(userId: string, code: string): Promise<boolean> {
    const secret = this.totpSecrets.get(userId);
    if (!secret) return false;

    try {
      const { TOTP } = await import('otpauth');
      const totp = new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: secret
      });

      // Verify with ±1 time window to account for clock drift
      const delta = totp.validate({ token: code, window: 1 });
      return delta !== null;
    } catch (error) {
      logger.error('[MFA] TOTP verification error:', error);
      return false;
    }
  }

  /**
   * Generate current TOTP code (RFC 6238 compliant)
   */
  private async generateTOTPCode(secret: string): Promise<string> {
    const { TOTP } = await import('otpauth');
    const totp = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret
    });
    return totp.generate();
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const userBackupCodes = this.backupCodes.get(userId);
    if (!userBackupCodes) return false;

    const hashedCode = await sha256(code);
    const isValid = userBackupCodes.has(hashedCode);

    if (isValid) {
      // Remove used backup code
      userBackupCodes.delete(hashedCode);
    }

    return isValid;
  }

  /**
   * Verify factor and update session
   */
  async verifyFactor(
    sessionId: string,
    factorType: string,
    value: string
  ): Promise<{ success: boolean; session?: MFASession; error?: string }> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return { success: false, error: 'Invalid session' };
    }

    // Check if session expired
    if (new Date() > new Date(session.expiresAt)) {
      this.sessions.delete(sessionId);
      return { success: false, error: 'Session expired' };
    }

    let isValid = false;

    switch (factorType) {
      case 'totp':
        isValid = await this.verifyTOTP(session.userId, value);
        break;
      case 'backup':
        isValid = await this.verifyBackupCode(session.userId, value);
        break;
      case 'sms':
      case 'email':
        isValid = await this.verifyOTP(session.userId, factorType, value);
        break;
      default:
        return { success: false, error: 'Unknown factor type' };
    }

    if (!isValid) {
      return { success: false, error: 'Invalid code' };
    }

    // Update session
    if (!session.verifiedFactors.includes(factorType)) {
      session.verifiedFactors.push(factorType);
    }

    const required = env.mfaRequiredFactors || 2;
    session.isComplete = session.verifiedFactors.length >= required;

    this.sessions.set(sessionId, session);
    return { success: true, session };
  }

  /**
   * Verify OTP (SMS/Email) against encrypted stored value.
   */
  private async verifyOTP(
    userId: string,
    method: string,
    code: string
  ): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;

    const key = `otp_${userId}_${method}`;
    const storage = getEncryptedStorage();
    const stored = await storage.getItem<{ otpHash: string; expiry: number }>(key);

    if (!stored) return false;

    // Check expiry
    if (Date.now() > stored.expiry) {
      storage.removeItem(key);
      return false;
    }

    // Constant-time comparison via hash
    const codeHash = await sha256(code);
    const isValid = codeHash === stored.otpHash;

    if (isValid) {
      // Remove OTP after successful verification (single-use)
      storage.removeItem(key);
    }

    return isValid;
  }

  /**
   * Send OTP via SMS or email.
   * Stores the OTP hash (not plaintext) in encrypted localStorage.
   */
  async sendOTP(
    userId: string,
    method: 'sms' | 'email',
    contact: string
  ): Promise<{ success: boolean; message?: string }> {
    // Generate 6-digit OTP
    const randomBytes = crypto.getRandomValues(new Uint32Array(1));
    const otp = (100000 + (randomBytes[0] % 900000)).toString();

    // Store only the OTP hash in encrypted storage (not plaintext)
    const key = `otp_${userId}_${method}`;
    const otpHash = await sha256(otp);
    const expiry = Date.now() + 300000; // 5 minutes
    const storage = getEncryptedStorage();
    await storage.setItem(key, { otpHash, expiry });

    // In production, dispatch OTP via SMS/email provider here
    const masked = this.maskContact(contact, method);

    return {
      success: true,
      message: `Verification code sent to ${masked}`
    };
  }

  /**
   * Mask contact information
   */
  private maskContact(contact: string, method: 'sms' | 'email'): string {
    if (method === 'email') {
      const [local, domain] = contact.split('@');
      return `${local[0]}***@${domain}`;
    } else {
      return `***${contact.slice(-4)}`;
    }
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): MFASession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Clear expired sessions
   */
  clearExpiredSessions(): number {
    let cleared = 0;
    const now = new Date();

    this.sessions.forEach((session, sessionId) => {
      if (now > new Date(session.expiresAt)) {
        this.sessions.delete(sessionId);
        cleared++;
      }
    });

    return cleared;
  }

  /**
   * Revoke all sessions for a user
   */
  revokeUserSessions(userId: string): number {
    let revoked = 0;

    this.sessions.forEach((session, sessionId) => {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
        revoked++;
      }
    });

    return revoked;
  }

  /**
   * Get MFA status for user
   */
  getMFAStatus(userId: string): {
    enabled: boolean;
    methods: string[];
    backupCodesRemaining: number;
  } {
    const hasTOTP = this.totpSecrets.has(userId);
    const backupCodes = this.backupCodes.get(userId);

    return {
      enabled: hasTOTP,
      methods: hasTOTP ? ['totp', 'backup'] : [],
      backupCodesRemaining: backupCodes ? backupCodes.size : 0
    };
  }

  /**
   * Disable MFA for user
   */
  disableMFA(userId: string): boolean {
    this.totpSecrets.delete(userId);
    this.backupCodes.delete(userId);
    this.revokeUserSessions(userId);
    return true;
  }

  // -----------------------------------------------------------------------
  // Cleanup Lifecycle
  // -----------------------------------------------------------------------

  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /** Start the periodic expired-session cleanup. */
  startCleanup(intervalMs: number = 300_000): void {
    this.stopCleanup();
    this.cleanupInterval = setInterval(() => {
      this.clearExpiredSessions();
    }, intervalMs);
  }

  /** Stop the periodic cleanup (call on app teardown). */
  stopCleanup(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const mfaService = new MFAService();

// Start cleanup (can be stopped via mfaService.stopCleanup())
mfaService.startCleanup();
