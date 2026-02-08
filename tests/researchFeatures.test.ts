import { describe, it, expect, beforeEach } from 'vitest';
import { qrCodeService } from '../src/services/qrCodeService';
import { serialNumberService } from '../src/services/serialNumberService';
import { emailService } from '../src/services/emailService';
import { merkleTreeService } from '../src/services/merkleTreeService';
import { jwtAuthService } from '../src/services/jwtAuthService';
import { performanceMonitor } from '../src/services/performanceMonitor';

describe('QR Code Service', () => {
  it('should generate QR code data URL', async () => {
    const data = {
      credentialId: 'cred-123',
      issuer: 'did:pistis:university',
      subject: 'did:pistis:student',
      issuanceDate: new Date().toISOString(),
      verificationUrl: 'https://verify.example.com/cred-123'
    };

    const qrCode = await qrCodeService.generateQRCode(data);
    expect(qrCode).toContain('data:image/png;base64');
  });

  it('should parse QR code data', () => {
    const original = {
      credentialId: 'cred-123',
      issuer: 'did:pistis:university',
      subject: 'did:pistis:student',
      issuanceDate: '2024-01-01',
      verificationUrl: 'https://verify.example.com/cred-123'
    };

    const parsed = qrCodeService.parseQRCodeData(JSON.stringify(original));
    expect(parsed).toEqual(original);
  });
});

describe('Serial Number Service', () => {
  it('should generate unique serial numbers', () => {
    const serial1 = serialNumberService.generateSerialNumber('cred-1', 'issuer-1');
    const serial2 = serialNumberService.generateSerialNumber('cred-2', 'issuer-1');

    expect(serial1).not.toBe(serial2);
    expect(serial1).toMatch(/^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/);
  });

  it('should register and verify serial', () => {
    const serial = serialNumberService.registerSerial('cred-123', 'issuer-abc');

    expect(serial.serialNumber).toBeDefined();
    expect(serial.credentialId).toBe('cred-123');

    const verified = serialNumberService.verifySerial(serial.serialNumber);
    expect(verified).toEqual(serial);
  });

  it('should validate checksum', () => {
    const serial = serialNumberService.registerSerial('cred-456', 'issuer-xyz');
    const isValid = serialNumberService.validateChecksum(serial);

    expect(isValid).toBe(true);
  });
});

describe('Email Service', () => {
  beforeEach(() => {
    emailService.clearQueue();
  });

  it('should send credential issued email', async () => {
    await emailService.sendCredentialIssuedEmail(
      'student@example.com',
      'John Doe',
      'cred-123',
      'SERIAL-123',
      'data:image/png;base64,abc'
    );

    const queue = emailService.getEmailQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].to).toBe('student@example.com');
    expect(queue[0].subject).toContain('Credential');
  });

  it('should send verification request email', async () => {
    await emailService.sendVerificationRequestEmail(
      'employer@example.com',
      'HR Manager',
      'John Doe',
      'cred-123'
    );

    const queue = emailService.getEmailQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].subject).toContain('Verification');
  });
});

describe('Merkle Tree Service', () => {
  it('should build merkle tree', () => {
    const credentials = ['cred1', 'cred2', 'cred3', 'cred4'];
    const tree = merkleTreeService.buildTree(credentials);

    expect(tree.hash).toBeDefined();
    expect(tree.hash).toHaveLength(64); // SHA-256 hex
  });

  it('should generate and verify proof', () => {
    const credentials = ['cred1', 'cred2', 'cred3', 'cred4'];
    const proof = merkleTreeService.generateProof(credentials, 'cred2');

    expect(proof.leaf).toBeDefined();
    expect(proof.proof.length).toBeGreaterThan(0);

    const isValid = merkleTreeService.verifyProof(proof);
    expect(isValid).toBe(true);
  });

  it('should get merkle root', () => {
    const credentials = ['cred1', 'cred2'];
    const root = merkleTreeService.getMerkleRoot(credentials);

    expect(root).toBeDefined();
    expect(root).toHaveLength(64);
  });
});

describe('JWT Auth Service', () => {
  it('should generate and verify token', () => {
    const payload = {
      sub: 'user-123',
      role: 'student' as const,
      permissions: ['read:credentials', 'share:credentials']
    };

    const token = jwtAuthService.generateToken(payload);
    expect(token).toBeDefined();

    const verified = jwtAuthService.verifyToken(token);
    expect(verified.sub).toBe('user-123');
    expect(verified.role).toBe('student');
  });

  it('should check permissions', () => {
    const token = jwtAuthService.generateToken({
      sub: 'user-123',
      role: 'issuer',
      permissions: ['issue:credentials', 'revoke:credentials']
    });

    expect(jwtAuthService.hasPermission(token, 'issue:credentials')).toBe(true);
    expect(jwtAuthService.hasPermission(token, 'delete:all')).toBe(false);
  });

  it('should check roles', () => {
    const token = jwtAuthService.generateToken({
      sub: 'admin-1',
      role: 'admin',
      permissions: ['*']
    });

    expect(jwtAuthService.hasRole(token, 'admin')).toBe(true);
    expect(jwtAuthService.hasRole(token, 'student')).toBe(false);
  });

  it('should refresh token', () => {
    const token = jwtAuthService.generateToken({
      sub: 'user-123',
      role: 'student',
      permissions: ['read:credentials']
    });

    // Wait a tiny bit to ensure different timestamp
    const refreshed = jwtAuthService.refreshToken(token);
    expect(refreshed).toBeDefined();

    const verified = jwtAuthService.verifyToken(refreshed);
    expect(verified.sub).toBe('user-123');
  });
});

describe('Performance Monitor', () => {
  beforeEach(() => {
    performanceMonitor.clearMetrics();
  });

  it('should record metrics', () => {
    performanceMonitor.recordMetric('test_operation', 100, true, 5000);

    const metrics = performanceMonitor.getRecentMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].operation).toBe('test_operation');
    expect(metrics[0].duration).toBe(100);
  });

  it('should measure operation', async () => {
    const result = await performanceMonitor.measureOperation(
      'async_test',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      }
    );

    expect(result).toBe('success');

    const metrics = performanceMonitor.getRecentMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].operation).toBe('async_test');
  });

  it('should get system metrics', () => {
    performanceMonitor.recordMetric('credential_issuance', 2500, true);
    performanceMonitor.recordMetric('credential_verification', 5, true);

    const stats = performanceMonitor.getSystemMetrics();

    expect(stats.totalCredentialsIssued).toBe(1);
    expect(stats.totalVerifications).toBe(1);
    expect(stats.successRate).toBe(100);
  });

  it('should export metrics', () => {
    performanceMonitor.recordMetric('test', 100, true);

    const exported = performanceMonitor.exportMetrics();
    const parsed = JSON.parse(exported);

    expect(parsed.systemMetrics).toBeDefined();
    expect(parsed.throughputStats).toBeDefined();
  });
});
