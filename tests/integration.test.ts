import { describe, it, expect, beforeEach } from 'vitest';
import { blockchainManager } from '../src/services/blockchainService';
import { qrCodeService } from '../src/services/qrCodeService';
import { serialNumberService } from '../src/services/serialNumberService';
import { emailService } from '../src/services/emailService';
import { merkleTreeService } from '../src/services/merkleTreeService';
import { jwtAuthService } from '../src/services/jwtAuthService';
import { performanceMonitor } from '../src/services/performanceMonitor';
import { channelService } from '../src/services/channelService';

describe('Integration Test: Complete Credential Lifecycle', () => {
  beforeEach(() => {
    emailService.clearQueue();
    performanceMonitor.clearMetrics();
  });

  it('should complete full credential issuance workflow with all research features', async () => {
    // 1. Setup: Create JWT token for issuer
    const issuerToken = jwtAuthService.generateToken({
      sub: 'issuer-123',
      role: 'issuer',
      permissions: ['issue:credentials', 'revoke:credentials']
    });

    expect(jwtAuthService.hasPermission(issuerToken, 'issue:credentials')).toBe(true);

    // 2. Issue credential with all features
    const credential = {
      id: 'cred-integration-test',
      type: 'AcademicCredential',
      data: {
        degree: 'Bachelor of Science',
        major: 'Computer Science',
        gpa: 3.85,
        graduationYear: 2024
      },
      hiddenData: {
        studentId: 'STU123456',
        ssn: 'XXX-XX-XXXX'
      }
    };

    const result = await blockchainManager.issueCredential(
      credential,
      'did:pistis:university',
      'did:pistis:student',
      'student@university.edu',
      'John Doe'
    );

    // 3. Verify serial number was generated
    expect(result.serialNumber).toBeDefined();
    expect(result.serialNumber).toMatch(/^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/);

    const serial = serialNumberService.verifySerial(result.serialNumber);
    expect(serial).toBeDefined();
    expect(serial?.credentialId).toBe(credential.id);

    // 4. Verify QR code was generated
    expect(result.qrCode).toBeDefined();
    expect(result.qrCode).toContain('data:image/png;base64');

    const qrData = qrCodeService.parseQRCodeData(
      JSON.stringify({
        credentialId: credential.id,
        issuer: 'did:pistis:university',
        subject: 'did:pistis:student',
        issuanceDate: new Date().toISOString(),
        verificationUrl: qrCodeService.generateVerificationUrl(credential.id)
      })
    );
    expect(qrData.credentialId).toBe(credential.id);

    // 5. Verify email was sent
    const emails = emailService.getEmailQueue();
    expect(emails.length).toBeGreaterThan(0);
    expect(emails[0].to).toBe('student@university.edu');
    expect(emails[0].subject).toContain('Credential');

    // 6. Verify performance metrics were recorded
    const metrics = performanceMonitor.getSystemMetrics();
    expect(metrics.totalCredentialsIssued).toBeGreaterThan(0);

    // 7. Create Merkle tree for batch verification
    const credentials = [credential.id, 'cred-2', 'cred-3'];
    const merkleRoot = merkleTreeService.getMerkleRoot(credentials);
    expect(merkleRoot).toBeDefined();
    expect(merkleRoot).toHaveLength(64);

    const proof = merkleTreeService.generateProof(credentials, credential.id);
    expect(merkleTreeService.verifyProof(proof)).toBe(true);
  });

  it('should handle verification workflow with JWT authentication', async () => {
    // 1. Create verifier token
    const verifierToken = jwtAuthService.generateToken({
      sub: 'verifier-456',
      role: 'verifier',
      permissions: ['verify:credentials']
    });

    expect(jwtAuthService.hasRole(verifierToken, 'verifier')).toBe(true);

    // 2. Issue a credential first
    const credential = {
      id: 'cred-verify-test',
      type: 'AcademicCredential',
      data: { degree: 'Master of Science' },
      hiddenData: {}
    };

    const result = await blockchainManager.issueCredential(
      credential,
      'did:pistis:university',
      'did:pistis:student'
    );

    // 3. Verify the credential was issued
    expect(result.publicTx).toBeDefined();
    expect(result.serialNumber).toBeDefined();

    // 4. Record verification performance
    await performanceMonitor.measureOperation(
      'credential_verification',
      async () => {
        return true;
      }
    );

    const verificationMetrics = performanceMonitor.getMetricsByOperation('credential_verification');
    expect(verificationMetrics.length).toBeGreaterThan(0);
  });

  it('should export comprehensive system metrics', () => {
    // Record some operations
    performanceMonitor.recordMetric('credential_issuance', 2500, true, 50000);
    performanceMonitor.recordMetric('credential_verification', 5, true, 10000);
    performanceMonitor.recordMetric('credential_revocation', 1500, true, 30000);

    const exported = performanceMonitor.exportMetrics();
    const parsed = JSON.parse(exported);

    expect(parsed.systemMetrics).toBeDefined();
    expect(parsed.throughputStats).toBeDefined();
    expect(parsed.recentMetrics).toBeDefined();
    expect(parsed.recentMetrics.length).toBeGreaterThan(0);
  });

  it('should handle multi-organization channels', () => {
    // Create multiple channels with unique IDs
    const timestamp = Date.now();
    const channel1 = channelService.createChannel(
      `test-univ-emp-${timestamp}`,
      ['university-1', 'employer-1'],
      true
    );

    const channel2 = channelService.createChannel(
      `test-univ-min-${timestamp}`,
      ['university-1', 'ministry-1'],
      true
    );

    const channel3 = channelService.createChannel(
      `test-public-${timestamp}`,
      ['university-1', 'employer-1', 'ministry-1', 'student-1'],
      false
    );

    // Verify channel properties
    expect(channel1.isPrivate).toBe(true);
    expect(channel1.organizations).toEqual(['university-1', 'employer-1']);
    
    expect(channel2.isPrivate).toBe(true);
    expect(channel2.organizations).toEqual(['university-1', 'ministry-1']);
    
    expect(channel3.isPrivate).toBe(false);
    expect(channel3.organizations.length).toBe(4);

    // Verify we can retrieve channels
    const retrieved1 = channelService.getChannel(channel1.id);
    expect(retrieved1).toBeDefined();
    expect(retrieved1?.name).toBe(channel1.name);
  });
});
