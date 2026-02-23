/**
 * Tests for BACIP Protocol
 */

import { describe, it, expect } from 'vitest';
import { BACIPProtocol, CredentialType, VerifiableCredential } from '../../src/services/bacipProtocol';

describe('BACIP Protocol', () => {
  describe('Verifiable Credential Creation', () => {
    it('should create W3C compliant verifiable credential', async () => {
      const issuerDID = 'did:pistis:university123';
      const subjectDID = 'did:pistis:student456';
      const credentialData = {
        issuerName: 'MIT',
        degree: 'Bachelor of Science',
        major: 'Computer Science',
        gpa: 3.85
      };

      const vc = await BACIPProtocol.createVerifiableCredential(
        issuerDID,
        subjectDID,
        credentialData,
        CredentialType.ACADEMIC_DEGREE
      );

      expect(vc['@context']).toContain('https://www.w3.org/2018/credentials/v1');
      expect(vc.type).toContain('VerifiableCredential');
      expect(vc.type).toContain('AcademicDegree');
      expect(vc.issuer.id).toBe(issuerDID);
      expect(vc.credentialSubject.id).toBe(subjectDID);
      expect(vc.proof.type).toBe('Ed25519Signature2020');
    });

    it('should include all credential data in subject', async () => {
      const credentialData = {
        issuerName: 'Stanford',
        degree: 'Master of Science',
        major: 'AI',
        gpa: 3.95,
        honors: 'Summa Cum Laude'
      };

      const vc = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        credentialData,
        CredentialType.DIPLOMA
      );

      expect(vc.credentialSubject.degree).toBe('Master of Science');
      expect(vc.credentialSubject.major).toBe('AI');
      expect(vc.credentialSubject.gpa).toBe(3.95);
      expect(vc.credentialSubject.honors).toBe('Summa Cum Laude');
    });
  });

  describe('Verifiable Presentation', () => {
    it('should create verifiable presentation with credentials', async () => {
      const vc1 = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        { degree: 'BS', issuerName: 'MIT' },
        CredentialType.ACADEMIC_DEGREE
      );

      const vp = await BACIPProtocol.createVerifiablePresentation(
        'did:pistis:stu1',
        [vc1],
        'challenge-123'
      );

      expect(vp.type).toContain('VerifiablePresentation');
      expect(vp.verifiableCredential).toHaveLength(1);
      expect(vp.proof.challenge).toBe('challenge-123');
      expect(vp.proof.proofPurpose).toBe('authentication');
    });

    it('should support multiple credentials in presentation', async () => {
      const vc1 = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        { degree: 'BS', issuerName: 'MIT' },
        CredentialType.ACADEMIC_DEGREE
      );

      const vc2 = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni2',
        'did:pistis:stu1',
        { certificate: 'AWS Certified', issuerName: 'Amazon' },
        CredentialType.CERTIFICATE
      );

      const vp = await BACIPProtocol.createVerifiablePresentation(
        'did:pistis:stu1',
        [vc1, vc2],
        'challenge-456'
      );

      expect(vp.verifiableCredential).toHaveLength(2);
    });
  });

  describe('Credential Verification', () => {
    it('should verify valid credential', async () => {
      const vc = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        { degree: 'BS', issuerName: 'MIT' },
        CredentialType.ACADEMIC_DEGREE
      );

      const isValid = await BACIPProtocol.verifyCredential(vc);
      expect(isValid).toBe(true);
    });

    it('should reject credential with missing context', async () => {
      const invalidVC = {
        id: 'urn:uuid:123',
        type: ['VerifiableCredential'],
        issuer: { id: 'did:pistis:uni1', name: 'MIT' },
        issuanceDate: new Date().toISOString(),
        credentialSubject: { id: 'did:pistis:stu1' },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date().toISOString(),
          proofPurpose: 'assertionMethod',
          verificationMethod: 'did:pistis:uni1#keys-1',
          jws: 'invalid'
        }
      } as VerifiableCredential;

      const isValid = await BACIPProtocol.verifyCredential(invalidVC);
      expect(isValid).toBe(false);
    });
  });

  describe('Selective Disclosure', () => {
    it('should create credential with only selected fields', async () => {
      const fullVC = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        {
          issuerName: 'MIT',
          degree: 'BS',
          major: 'CS',
          gpa: 3.85,
          ssn: '123-45-6789',
          dob: '1995-01-01'
        },
        CredentialType.ACADEMIC_DEGREE
      );

      const disclosed = await BACIPProtocol.createSelectiveDisclosure(
        fullVC,
        ['degree', 'major']
      );

      expect(disclosed.credentialSubject.degree).toBe('BS');
      expect(disclosed.credentialSubject.major).toBe('CS');
      expect(disclosed.credentialSubject.gpa).toBeUndefined();
      expect(disclosed.credentialSubject.ssn).toBeUndefined();
      expect(disclosed.credentialSubject.dob).toBeUndefined();
    });

    it('should always include subject ID in disclosure', async () => {
      const fullVC = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        { issuerName: 'MIT', degree: 'BS', gpa: 3.85 },
        CredentialType.ACADEMIC_DEGREE
      );

      const disclosed = await BACIPProtocol.createSelectiveDisclosure(
        fullVC,
        ['degree']
      );

      expect(disclosed.credentialSubject.id).toBe('did:pistis:stu1');
    });
  });

  describe('Credential Encryption', () => {
    it('should encrypt credential for private storage', async () => {
      const vc = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        { degree: 'BS', issuerName: 'MIT' },
        CredentialType.ACADEMIC_DEGREE
      );

      const { encrypted, keyHex } = await BACIPProtocol.encryptCredential(
        vc,
        'publicKey123'
      );

      expect(encrypted).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(keyHex).toBeDefined();
      expect(encrypted.ciphertext).not.toContain('BS');
    });
  });

  describe('Credential Hash Generation', () => {
    it('should generate consistent hash for same credential', async () => {
      const vc = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        { degree: 'BS', issuerName: 'MIT' },
        CredentialType.ACADEMIC_DEGREE
      );

      const hash1 = await BACIPProtocol.generateCredentialHash(vc);
      const hash2 = await BACIPProtocol.generateCredentialHash(vc);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different hashes for different credentials', async () => {
      const vc1 = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu1',
        { degree: 'BS', issuerName: 'MIT' },
        CredentialType.ACADEMIC_DEGREE
      );

      const vc2 = await BACIPProtocol.createVerifiableCredential(
        'did:pistis:uni1',
        'did:pistis:stu2',
        { degree: 'MS', issuerName: 'MIT' },
        CredentialType.ACADEMIC_DEGREE
      );

      const hash1 = await BACIPProtocol.generateCredentialHash(vc1);
      const hash2 = await BACIPProtocol.generateCredentialHash(vc2);

      expect(hash1).not.toBe(hash2);
    });
  });
});
