import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mfaService } from '../../src/services/mfaService';

describe('MFA Service', () => {
  let testUserId: string;

  beforeEach(() => {
    // Use a unique userId per test to avoid singleton state leaking
    testUserId = `user-${crypto.randomUUID()}`;
    mfaService.stopCleanup();
  });

  afterEach(() => {
    mfaService.disableMFA(testUserId);
    mfaService.stopCleanup();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // setupMFA
  // ---------------------------------------------------------------------------

  describe('setupMFA', () => {
    it('should generate a 32-character base32 secret', async () => {
      const result = await mfaService.setupMFA(testUserId);
      expect(result.secret).toHaveLength(32);
      expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('should generate a QR code data URI', async () => {
      const result = await mfaService.setupMFA(testUserId);
      expect(result.qrCode).toContain('data:image/svg+xml');
      expect(result.qrCode).toContain(result.secret.substring(0, 10));
    });

    it('should generate exactly 10 backup codes', async () => {
      const result = await mfaService.setupMFA(testUserId);
      expect(result.backupCodes).toHaveLength(10);
    });

    it('should generate unique backup codes', async () => {
      const result = await mfaService.setupMFA(testUserId);
      const uniqueCodes = new Set(result.backupCodes);
      expect(uniqueCodes.size).toBe(10);
    });

    it('should generate alphanumeric backup codes', async () => {
      const result = await mfaService.setupMFA(testUserId);
      for (const code of result.backupCodes) {
        expect(code).toMatch(/^[0-9A-Z]+$/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // createSession
  // ---------------------------------------------------------------------------

  describe('createSession', () => {
    it('should create a session with a valid sessionId', () => {
      const session = mfaService.createSession(testUserId);
      expect(session.sessionId).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(session.sessionId.length).toBeGreaterThan(0);
    });

    it('should set the userId on the session', () => {
      const session = mfaService.createSession(testUserId);
      expect(session.userId).toBe(testUserId);
    });

    it('should set createdAt and expiresAt as ISO timestamps', () => {
      const session = mfaService.createSession(testUserId);
      expect(new Date(session.createdAt).toISOString()).toBe(session.createdAt);
      expect(new Date(session.expiresAt).toISOString()).toBe(session.expiresAt);
    });

    it('should set expiresAt after createdAt', () => {
      const session = mfaService.createSession(testUserId);
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(
        new Date(session.createdAt).getTime()
      );
    });

    it('should initialize verifiedFactors as empty', () => {
      const session = mfaService.createSession(testUserId);
      expect(session.verifiedFactors).toEqual([]);
    });

    it('should initialize isComplete as false', () => {
      const session = mfaService.createSession(testUserId);
      expect(session.isComplete).toBe(false);
    });

    it('should be retrievable via getSession', () => {
      const session = mfaService.createSession(testUserId);
      const retrieved = mfaService.getSession(session.sessionId);
      expect(retrieved).toEqual(session);
    });

    it('should honour custom duration', () => {
      const duration = 5000; // 5 seconds
      const session = mfaService.createSession(testUserId, duration);
      const diff =
        new Date(session.expiresAt).getTime() -
        new Date(session.createdAt).getTime();
      expect(diff).toBe(duration);
    });
  });

  // ---------------------------------------------------------------------------
  // verifyFactor – backup codes
  // ---------------------------------------------------------------------------

  describe('verifyFactor (backup code)', () => {
    it('should accept a valid backup code', async () => {
      const { backupCodes } = await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId);

      const result = await mfaService.verifyFactor(
        session.sessionId,
        'backup',
        backupCodes[0]
      );

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session!.verifiedFactors).toContain('backup');
    });

    it('should reject a backup code after it has been used', async () => {
      const { backupCodes } = await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId);

      // First use – should succeed
      const first = await mfaService.verifyFactor(
        session.sessionId,
        'backup',
        backupCodes[0]
      );
      expect(first.success).toBe(true);

      // Second use of same code – should fail
      const second = await mfaService.verifyFactor(
        session.sessionId,
        'backup',
        backupCodes[0]
      );
      expect(second.success).toBe(false);
      expect(second.error).toBe('Invalid code');
    });

    it('should accept different backup codes independently', async () => {
      const { backupCodes } = await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId);

      const first = await mfaService.verifyFactor(
        session.sessionId,
        'backup',
        backupCodes[0]
      );
      expect(first.success).toBe(true);

      const second = await mfaService.verifyFactor(
        session.sessionId,
        'backup',
        backupCodes[1]
      );
      expect(second.success).toBe(true);
    });

    it('should reject an invalid backup code', async () => {
      await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId);

      const result = await mfaService.verifyFactor(
        session.sessionId,
        'backup',
        'INVALIDCODE'
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid code');
    });
  });

  // ---------------------------------------------------------------------------
  // verifyFactor – invalid session
  // ---------------------------------------------------------------------------

  describe('verifyFactor (invalid session)', () => {
    it('should return error for non-existent session', async () => {
      const result = await mfaService.verifyFactor(
        'non-existent-session-id',
        'backup',
        'SOMECODE'
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid session');
    });
  });

  // ---------------------------------------------------------------------------
  // verifyFactor – expired session
  // ---------------------------------------------------------------------------

  describe('verifyFactor (expired session)', () => {
    it('should return error for expired session', async () => {
      vi.useFakeTimers();

      const { backupCodes } = await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId, 1000); // 1 second

      // Advance time past the session expiry
      vi.advanceTimersByTime(2000);

      const result = await mfaService.verifyFactor(
        session.sessionId,
        'backup',
        backupCodes[0]
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired');
    });

    it('should remove the session after it expires on verification', async () => {
      vi.useFakeTimers();

      await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId, 1000);

      vi.advanceTimersByTime(2000);

      await mfaService.verifyFactor(session.sessionId, 'backup', 'ANYCODE');
      expect(mfaService.getSession(session.sessionId)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // verifyFactor – unknown factor type
  // ---------------------------------------------------------------------------

  describe('verifyFactor (unknown factor)', () => {
    it('should return error for unknown factor type', async () => {
      const session = mfaService.createSession(testUserId);

      const result = await mfaService.verifyFactor(
        session.sessionId,
        'fingerprint',
        'data'
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown factor type');
    });
  });

  // ---------------------------------------------------------------------------
  // clearExpiredSessions
  // ---------------------------------------------------------------------------

  describe('clearExpiredSessions', () => {
    it('should remove expired sessions and return the count', () => {
      vi.useFakeTimers();

      // Create sessions that will expire quickly
      mfaService.createSession(testUserId, 500);
      mfaService.createSession(testUserId, 500);
      // Create a session that won't expire
      const keepSession = mfaService.createSession(testUserId, 60_000);

      // Advance past short-lived sessions
      vi.advanceTimersByTime(1000);

      const cleared = mfaService.clearExpiredSessions();
      expect(cleared).toBe(2);

      // Long-lived session should still be accessible
      expect(mfaService.getSession(keepSession.sessionId)).not.toBeNull();
    });

    it('should return 0 when no sessions are expired', () => {
      mfaService.createSession(testUserId, 60_000);
      const cleared = mfaService.clearExpiredSessions();
      expect(cleared).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // revokeUserSessions
  // ---------------------------------------------------------------------------

  describe('revokeUserSessions', () => {
    it('should remove all sessions for the given user', () => {
      const s1 = mfaService.createSession(testUserId);
      const s2 = mfaService.createSession(testUserId);

      const revoked = mfaService.revokeUserSessions(testUserId);
      expect(revoked).toBe(2);

      expect(mfaService.getSession(s1.sessionId)).toBeNull();
      expect(mfaService.getSession(s2.sessionId)).toBeNull();
    });

    it('should not affect sessions of other users', () => {
      const otherUser = `other-${crypto.randomUUID()}`;
      const otherSession = mfaService.createSession(otherUser);

      mfaService.createSession(testUserId);
      mfaService.revokeUserSessions(testUserId);

      expect(mfaService.getSession(otherSession.sessionId)).not.toBeNull();

      // Cleanup other user
      mfaService.disableMFA(otherUser);
    });

    it('should return 0 when user has no sessions', () => {
      const revoked = mfaService.revokeUserSessions('non-existent-user');
      expect(revoked).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getMFAStatus
  // ---------------------------------------------------------------------------

  describe('getMFAStatus', () => {
    it('should report disabled when MFA is not set up', () => {
      const status = mfaService.getMFAStatus(testUserId);
      expect(status.enabled).toBe(false);
      expect(status.methods).toEqual([]);
      expect(status.backupCodesRemaining).toBe(0);
    });

    it('should report enabled with methods after setup', async () => {
      await mfaService.setupMFA(testUserId);
      const status = mfaService.getMFAStatus(testUserId);

      expect(status.enabled).toBe(true);
      expect(status.methods).toContain('totp');
      expect(status.methods).toContain('backup');
      expect(status.backupCodesRemaining).toBe(10);
    });

    it('should decrement backup codes remaining after use', async () => {
      const { backupCodes } = await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId);

      await mfaService.verifyFactor(session.sessionId, 'backup', backupCodes[0]);

      const status = mfaService.getMFAStatus(testUserId);
      expect(status.backupCodesRemaining).toBe(9);
    });
  });

  // ---------------------------------------------------------------------------
  // disableMFA
  // ---------------------------------------------------------------------------

  describe('disableMFA', () => {
    it('should clear secrets and return true', async () => {
      await mfaService.setupMFA(testUserId);

      const result = mfaService.disableMFA(testUserId);
      expect(result).toBe(true);

      const status = mfaService.getMFAStatus(testUserId);
      expect(status.enabled).toBe(false);
      expect(status.methods).toEqual([]);
      expect(status.backupCodesRemaining).toBe(0);
    });

    it('should revoke all sessions for the user', async () => {
      await mfaService.setupMFA(testUserId);
      const session = mfaService.createSession(testUserId);

      mfaService.disableMFA(testUserId);
      expect(mfaService.getSession(session.sessionId)).toBeNull();
    });

    it('should return true even if MFA was not set up', () => {
      const result = mfaService.disableMFA(testUserId);
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // startCleanup / stopCleanup
  // ---------------------------------------------------------------------------

  describe('startCleanup / stopCleanup', () => {
    it('should periodically clear expired sessions', () => {
      vi.useFakeTimers();

      mfaService.createSession(testUserId, 500);
      mfaService.startCleanup(1000);

      // Advance past session expiry + cleanup interval
      vi.advanceTimersByTime(1500);

      // The expired session should have been cleaned up
      expect(mfaService.clearExpiredSessions()).toBe(0);

      mfaService.stopCleanup();
    });

    it('should stop cleaning up after stopCleanup is called', () => {
      vi.useFakeTimers();

      mfaService.startCleanup(1000);
      mfaService.stopCleanup();

      // Create an expired session after stopping
      mfaService.createSession(testUserId, 100);
      vi.advanceTimersByTime(2000);

      // The session should still exist since cleanup was stopped
      const cleared = mfaService.clearExpiredSessions();
      expect(cleared).toBe(1);
    });

    it('should allow calling stopCleanup without starting', () => {
      // Should not throw
      expect(() => mfaService.stopCleanup()).not.toThrow();
    });

    it('should replace previous cleanup interval when started again', () => {
      vi.useFakeTimers();

      mfaService.startCleanup(500);
      mfaService.startCleanup(2000);

      mfaService.createSession(testUserId, 100);
      vi.advanceTimersByTime(600);

      // With the new 2000ms interval, cleanup has not fired yet at 600ms
      const cleared = mfaService.clearExpiredSessions();
      expect(cleared).toBe(1);

      mfaService.stopCleanup();
    });
  });

  // ---------------------------------------------------------------------------
  // getSession
  // ---------------------------------------------------------------------------

  describe('getSession', () => {
    it('should return null for non-existent session', () => {
      expect(mfaService.getSession('does-not-exist')).toBeNull();
    });

    it('should return the session object for a valid sessionId', () => {
      const session = mfaService.createSession(testUserId);
      const retrieved = mfaService.getSession(session.sessionId);
      expect(retrieved).toEqual(session);
    });
  });
});
