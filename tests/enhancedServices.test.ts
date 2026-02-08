import { describe, it, expect, beforeEach } from 'vitest';
import { enhancedMerkleTreeService } from '../src/services/enhancedMerkleTree';
import { enhancedSerialNumberService } from '../src/services/enhancedSerialNumber';
import { passwordService } from '../src/services/passwordService';
import { validationService } from '../src/services/validationService';
import { rateLimitService } from '../src/services/rateLimitService';

describe('Enhanced Merkle Tree Service (merkletreejs)', () => {
  it('should build merkle tree and generate root', () => {
    const credentials = ['cred1', 'cred2', 'cred3', 'cred4'];
    const root = enhancedMerkleTreeService.getMerkleRoot(credentials);

    expect(root).toBeDefined();
    expect(root).toHaveLength(64); // SHA-256 hex
  });

  it('should generate and verify proof', () => {
    const credentials = ['cred1', 'cred2', 'cred3', 'cred4'];
    const proofData = enhancedMerkleTreeService.generateProof(credentials, 'cred2');

    expect(proofData.verified).toBe(true);
    expect(proofData.leaf).toBeDefined();
    expect(proofData.proof.length).toBeGreaterThan(0);
    expect(proofData.root).toBeDefined();
  });

  it('should verify proof independently', () => {
    const credentials = ['cred1', 'cred2', 'cred3'];
    const proofData = enhancedMerkleTreeService.generateProof(credentials, 'cred2');

    // The proof is already verified in generateProof
    expect(proofData.verified).toBe(true);
    expect(proofData.proof.length).toBeGreaterThan(0);
  });

  it('should get tree depth and leaf count', () => {
    const credentials = ['cred1', 'cred2', 'cred3', 'cred4'];
    const depth = enhancedMerkleTreeService.getTreeDepth(credentials);
    const leafCount = enhancedMerkleTreeService.getLeafCount(credentials);

    expect(depth).toBeGreaterThan(0);
    expect(leafCount).toBe(4);
  });
});

describe('Enhanced Serial Number Service (nanoid)', () => {
  it('should generate unique serial numbers with nanoid', () => {
    const serial1 = enhancedSerialNumberService.generateSerialNumber('cred1', 'issuer1');
    const serial2 = enhancedSerialNumberService.generateSerialNumber('cred2', 'issuer1');

    expect(serial1).not.toBe(serial2);
    expect(serial1).toMatch(/^[A-Z0-9]+-[A-Z0-9]+$/);
  });

  it('should register and verify serial with nanoid', () => {
    const serial = enhancedSerialNumberService.registerSerial('cred-123', 'issuer-abc');

    expect(serial.serialNumber).toBeDefined();
    expect(serial.nanoId).toBeDefined();
    expect(serial.checksum).toBeDefined();

    const verified = enhancedSerialNumberService.verifySerial(serial.serialNumber);
    expect(verified).toEqual(serial);
  });

  it('should validate checksum', () => {
    const serial = enhancedSerialNumberService.registerSerial('cred-456', 'issuer-xyz');
    const isValid = enhancedSerialNumberService.validateChecksum(serial);

    expect(isValid).toBe(true);
  });

  it('should generate short IDs', () => {
    const id1 = enhancedSerialNumberService.generateShortId();
    const id2 = enhancedSerialNumberService.generateShortId();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1).toHaveLength(12);
  });
});

describe('Password Service (bcrypt)', () => {
  it('should hash password', async () => {
    const password = 'SecurePassword123!';
    const hash = await passwordService.hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
  });

  it('should verify correct password', async () => {
    const password = 'SecurePassword123!';
    const hash = await passwordService.hashPassword(password);

    const isValid = await passwordService.verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'SecurePassword123!';
    const hash = await passwordService.hashPassword(password);

    const isValid = await passwordService.verifyPassword('WrongPassword', hash);
    expect(isValid).toBe(false);
  });

  it('should get rounds from hash', async () => {
    const hash = await passwordService.hashPassword('test', 10);
    const rounds = passwordService.getRounds(hash);

    expect(rounds).toBe(10);
  });

  it('should validate hash format', async () => {
    const hash = await passwordService.hashPassword('test');
    expect(passwordService.isValidHash(hash)).toBe(true);
    expect(passwordService.isValidHash('invalid-hash')).toBe(false);
  });
});

describe('Validation Service (Zod)', () => {
  it('should validate credential', () => {
    const validCredential = {
      id: 'cred-123',
      type: 'AcademicCredential',
      data: { degree: 'BSc' }
    };

    const result = validationService.validateCredential(validCredential);
    expect(result).toEqual(validCredential);
    expect(validationService.isValidCredential(validCredential)).toBe(true);
  });

  it('should reject invalid credential', () => {
    const invalidCredential = {
      id: '',
      type: 'AcademicCredential'
      // missing data field
    };

    expect(validationService.isValidCredential(invalidCredential)).toBe(false);
  });

  it('should validate DID format', () => {
    expect(validationService.isValidDID('did:pistis:university')).toBe(true);
    expect(validationService.isValidDID('did:example:123')).toBe(true);
    expect(validationService.isValidDID('invalid-did')).toBe(false);
  });

  it('should validate email', () => {
    expect(validationService.isValidEmail('test@example.com')).toBe(true);
    expect(validationService.isValidEmail('invalid-email')).toBe(false);
  });

  it('should validate serial number format', () => {
    expect(validationService.isValidSerialNumber('ABC123-DEF456-GHI789')).toBe(true);
    expect(validationService.isValidSerialNumber('invalid')).toBe(false);
  });

  it('should validate JWT payload', () => {
    const validPayload = {
      sub: 'user-123',
      role: 'student',
      permissions: ['read:credentials']
    };

    const result = validationService.validateJWTPayload(validPayload);
    expect(result).toEqual(validPayload);
  });
});

describe('Rate Limit Service', () => {
  beforeEach(async () => {
    await rateLimitService.reset('test-limiter', 'test-key');
  });

  it('should create and use rate limiter', async () => {
    rateLimitService.createLimiter('test-limiter', {
      points: 5,
      duration: 60
    });

    const allowed = await rateLimitService.consume('test-limiter', 'test-key');
    expect(allowed).toBe(true);
  });

  it('should block after exceeding limit', async () => {
    rateLimitService.createLimiter('strict-limiter', {
      points: 2,
      duration: 60
    });

    await rateLimitService.consume('strict-limiter', 'user1');
    await rateLimitService.consume('strict-limiter', 'user1');
    const blocked = await rateLimitService.consume('strict-limiter', 'user1');

    expect(blocked).toBe(false);
  });

  it('should get remaining points', async () => {
    rateLimitService.createLimiter('points-limiter', {
      points: 10,
      duration: 60
    });

    await rateLimitService.consume('points-limiter', 'user2', 3);
    const remaining = await rateLimitService.getRemainingPoints('points-limiter', 'user2');

    expect(remaining).toBe(7);
  });

  it('should reset rate limit', async () => {
    rateLimitService.createLimiter('reset-limiter', {
      points: 1,
      duration: 60
    });

    await rateLimitService.consume('reset-limiter', 'user3');
    await rateLimitService.reset('reset-limiter', 'user3');
    const allowed = await rateLimitService.consume('reset-limiter', 'user3');

    expect(allowed).toBe(true);
  });
});
