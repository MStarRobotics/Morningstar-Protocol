import { describe, it, expect } from 'vitest';
import { verifyCredentialPayload, type VerifiableCredential } from '../../src/services/verificationPipeline';

describe('Verification Pipeline', () => {
  const validCredential: VerifiableCredential = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'AcademicCredential'],
    issuer: 'did:polygon:issuer123',
    issuanceDate: '2024-01-01T00:00:00Z',
    credentialSubject: {
      id: 'did:polygon:student1',
      name: 'John Doe',
      degree: 'Bachelor of Science',
    },
  };

  it('should pass structural checks for valid credential', async () => {
    const result = await verifyCredentialPayload(validCredential);
    const contextCheck = result.checks.find(c => c.name === 'context');
    expect(contextCheck?.status).toBe('pass');
    const typeCheck = result.checks.find(c => c.name === 'type');
    expect(typeCheck?.status).toBe('pass');
    const subjectCheck = result.checks.find(c => c.name === 'subject');
    expect(subjectCheck?.status).toBe('pass');
  });

  it('should fail on missing context', async () => {
    const badCred = { ...validCredential, '@context': [] };
    const result = await verifyCredentialPayload(badCred);
    const contextCheck = result.checks.find(c => c.name === 'context');
    expect(contextCheck?.status).toBe('fail');
  });

  it('should fail on missing type', async () => {
    const badCred = { ...validCredential, type: [] };
    const result = await verifyCredentialPayload(badCred);
    const typeCheck = result.checks.find(c => c.name === 'type');
    expect(typeCheck?.status).toBe('fail');
  });

  it('should fail on missing issuer', async () => {
    const badCred = { ...validCredential, issuer: '' };
    const result = await verifyCredentialPayload(badCred);
    const issuerCheck = result.checks.find(c => c.name === 'issuer');
    expect(issuerCheck?.status).toBe('fail');
  });

  it('should fail on missing subject', async () => {
    const badCred = { ...validCredential, credentialSubject: null as any };
    const result = await verifyCredentialPayload(badCred);
    const subjectCheck = result.checks.find(c => c.name === 'subject');
    expect(subjectCheck?.status).toBe('fail');
  });

  it('should warn when proof is missing', async () => {
    const result = await verifyCredentialPayload(validCredential);
    const proofCheck = result.checks.find(c => c.name === 'proof');
    expect(proofCheck?.status).toBe('warn');
  });
});
