/**
 * W3C Verifiable Credentials Service
 *
 * Production-grade integration with @digitalcredentials/vc following
 * the W3C VC Data Model v2.0 and the triangle of trust (Issuer, Holder, Verifier).
 *
 * References:
 *  - W3C VC Data Model: https://www.w3.org/TR/vc-data-model-2.0/
 *  - SCIRP 2025 – Blockchain Academic Credential Verification
 *  - ArXiv BACIP Protocol – Dual Blockchain with ZKP
 */

import * as vc from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { getErrorMessage } from './errorUtils';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface W3CCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string | { id: string; name?: string };
  issuanceDate: string;
  /** W3C VC Data Model v2.0 field (replaces issuanceDate) */
  validFrom?: string;
  expirationDate?: string;
  /** W3C VC Data Model v2.0 field (replaces expirationDate) */
  validUntil?: string;
  credentialSubject: Record<string, unknown>;
  credentialSchema?: {
    id: string;
    type: string;
  };
  credentialStatus?: {
    id: string;
    type: string;
    statusPurpose: string;
    statusListIndex: string;
    statusListCredential: string;
  };
  proof?: Record<string, unknown>;
}

export interface W3CPresentation {
  '@context': string[];
  type: string[];
  holder: string;
  verifiableCredential: W3CCredential[];
  proof?: Record<string, unknown>;
}

export interface IssuanceResult {
  credential: W3CCredential;
  signed: boolean;
  error?: string;
}

export interface VerificationReport {
  verified: boolean;
  checks: Array<{
    check: string;
    passed: boolean;
    detail: string;
  }>;
  credential?: W3CCredential;
  error?: string;
}

// ------------------------------------------------------------------
// Key-pair management (Ed25519)
// ------------------------------------------------------------------

let _issuerKeyPair: Ed25519VerificationKey2020 | null = null;
let _issuerSuite: Ed25519Signature2020 | null = null;

/**
 * Lazily initialise (or reinitialise) the issuer key-pair.
 * In production this would be loaded from a secure key store / HSM.
 */
export async function getIssuerKeyPair(): Promise<Ed25519VerificationKey2020> {
  if (_issuerKeyPair) return _issuerKeyPair;

  _issuerKeyPair = await Ed25519VerificationKey2020.generate({
    id: 'did:polygon:issuer#key-1',
    controller: 'did:polygon:issuer',
  });

  return _issuerKeyPair;
}

async function getIssuerSuite(): Promise<Ed25519Signature2020> {
  if (_issuerSuite) return _issuerSuite;
  const keyPair = await getIssuerKeyPair();
  _issuerSuite = new Ed25519Signature2020({ key: keyPair });
  return _issuerSuite;
}

// ------------------------------------------------------------------
// Minimal document loader for offline / demo usage
// ------------------------------------------------------------------

const CONTEXTS: Record<string, unknown> = {
  'https://www.w3.org/2018/credentials/v1': {
    '@context': {
      '@version': 1.1,
      '@protected': true,
      id: '@id',
      type: '@type',
      VerifiableCredential: {
        '@id': 'https://www.w3.org/2018/credentials#VerifiableCredential',
        '@context': { '@version': 1.1, '@protected': true },
      },
      VerifiablePresentation: {
        '@id': 'https://www.w3.org/2018/credentials#VerifiablePresentation',
        '@context': { '@version': 1.1, '@protected': true },
      },
      verifiableCredential: {
        '@id': 'https://www.w3.org/2018/credentials#verifiableCredential',
        '@type': '@id',
        '@container': '@graph',
      },
      credentialSubject: {
        '@id': 'https://www.w3.org/2018/credentials#credentialSubject',
        '@type': '@id',
      },
      issuer: { '@id': 'https://www.w3.org/2018/credentials#issuer', '@type': '@id' },
      issuanceDate: {
        '@id': 'https://www.w3.org/2018/credentials#issuanceDate',
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
      },
      expirationDate: {
        '@id': 'https://www.w3.org/2018/credentials#expirationDate',
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
      },
      credentialStatus: {
        '@id': 'https://www.w3.org/2018/credentials#credentialStatus',
        '@type': '@id',
      },
      credentialSchema: {
        '@id': 'https://www.w3.org/2018/credentials#credentialSchema',
        '@type': '@id',
      },
      proof: {
        '@id': 'https://w3id.org/security#proof',
        '@type': '@id',
        '@container': '@graph',
      },
      holder: { '@id': 'https://www.w3.org/2018/credentials#holder', '@type': '@id' },
      name: 'http://schema.org/name',
      description: 'http://schema.org/description',
      image: { '@id': 'http://schema.org/image', '@type': '@id' },
    },
  },
  'https://w3id.org/security/suites/ed25519-2020/v1': {
    '@context': {
      id: '@id',
      type: '@type',
      '@protected': true,
      proof: {
        '@id': 'https://w3id.org/security#proof',
        '@type': '@id',
        '@container': '@graph',
      },
      Ed25519VerificationKey2020: {
        '@id': 'https://w3id.org/security#Ed25519VerificationKey2020',
      },
      Ed25519Signature2020: {
        '@id': 'https://w3id.org/security#Ed25519Signature2020',
      },
      publicKeyMultibase: {
        '@id': 'https://w3id.org/security#publicKeyMultibase',
      },
      proofValue: {
        '@id': 'https://w3id.org/security#proofValue',
      },
      created: {
        '@id': 'http://purl.org/dc/terms/created',
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
      },
      verificationMethod: {
        '@id': 'https://w3id.org/security#verificationMethod',
        '@type': '@id',
      },
      proofPurpose: {
        '@id': 'https://w3id.org/security#proofPurpose',
        '@type': '@vocab',
      },
      assertionMethod: {
        '@id': 'https://w3id.org/security#assertionMethod',
        '@type': '@id',
        '@container': '@set',
      },
    },
  },
};

function customDocumentLoader(url: string) {
  const ctx = CONTEXTS[url];
  if (ctx) {
    return {
      contextUrl: null,
      document: ctx,
      documentUrl: url,
    };
  }
  // For DID resolution in demo, return a minimal DID document
  if (url.startsWith('did:')) {
    return {
      contextUrl: null,
      document: {
        '@context': 'https://www.w3.org/ns/did/v1',
        id: url,
        assertionMethod: [`${url}#key-1`],
        authentication: [`${url}#key-1`],
      },
      documentUrl: url,
    };
  }
  throw new Error(`Unable to load context: ${url}`);
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Issue a W3C Verifiable Credential (signed with Ed25519Signature2020).
 */
export async function issueCredential(params: {
  issuerDid: string;
  issuerName?: string;
  subjectDid: string;
  credentialType: string;
  claims: Record<string, unknown>;
  schemaId?: string;
  expirationDate?: string;
}): Promise<IssuanceResult> {
  try {
    const suite = await getIssuerSuite();

    const credential: W3CCredential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://www.w3.org/ns/credentials/v2',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: `urn:uuid:${uuidv4()}`,
      type: ['VerifiableCredential', params.credentialType],
      issuer: params.issuerName
        ? { id: params.issuerDid, name: params.issuerName }
        : params.issuerDid,
      validFrom: new Date().toISOString(),
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: params.subjectDid,
        ...params.claims,
      },
    };

    if (params.expirationDate) {
      credential.validUntil = params.expirationDate;
      credential.expirationDate = params.expirationDate;
    }

    if (params.schemaId) {
      credential.credentialSchema = {
        id: params.schemaId,
        type: 'JsonSchema',
      };
    }

    const signedCredential = await vc.issue({
      credential: { ...credential },
      suite,
      documentLoader: customDocumentLoader,
    });

    return { credential: signedCredential as W3CCredential, signed: true };
  } catch (error) {
    const msg = getErrorMessage(error);
    logger.error('VC issuance error:', msg);
    return {
      credential: {} as W3CCredential,
      signed: false,
      error: msg,
    };
  }
}

/**
 * Verify a W3C Verifiable Credential.
 */
export async function verifyCredential(
  credential: W3CCredential
): Promise<VerificationReport> {
  const checks: VerificationReport['checks'] = [];

  try {
    // Structure checks
    const hasContext = Array.isArray(credential['@context']) && credential['@context'].length > 0;
    checks.push({
      check: '@context',
      passed: hasContext,
      detail: hasContext ? 'Valid JSON-LD context' : 'Missing @context',
    });

    const hasType =
      Array.isArray(credential.type) && credential.type.includes('VerifiableCredential');
    checks.push({
      check: 'type',
      passed: hasType,
      detail: hasType ? `Types: ${credential.type.join(', ')}` : 'Missing VerifiableCredential type',
    });

    const issuerStr =
      typeof credential.issuer === 'string' ? credential.issuer : credential.issuer?.id;
    const hasIssuer = !!issuerStr;
    checks.push({
      check: 'issuer',
      passed: hasIssuer,
      detail: hasIssuer ? `Issuer: ${issuerStr}` : 'Missing issuer',
    });

    const hasSubject =
      credential.credentialSubject && typeof credential.credentialSubject === 'object';
    checks.push({
      check: 'credentialSubject',
      passed: !!hasSubject,
      detail: hasSubject ? 'Subject present' : 'Missing credentialSubject',
    });

    // Expiration check
    if (credential.expirationDate) {
      const expired = new Date(credential.expirationDate) < new Date();
      checks.push({
        check: 'expiration',
        passed: !expired,
        detail: expired ? 'Credential has expired' : `Expires: ${credential.expirationDate}`,
      });
    }

    // Proof verification via @digitalcredentials/vc
    if (credential.proof) {
      try {
        const suite = new Ed25519Signature2020();
        const result = await vc.verifyCredential({
          credential: { ...credential },
          suite,
          documentLoader: customDocumentLoader,
        });
        checks.push({
          check: 'proof',
          passed: result.verified === true,
          detail: result.verified ? 'Cryptographic proof verified' : 'Proof verification failed',
        });
      } catch {
        checks.push({
          check: 'proof',
          passed: false,
          detail: 'Proof verification threw an error',
        });
      }
    } else {
      checks.push({
        check: 'proof',
        passed: false,
        detail: 'No proof present on credential',
      });
    }

    const verified = checks.every((c) => c.passed);
    return { verified, checks, credential };
  } catch (error) {
    const msg = getErrorMessage(error);
    return { verified: false, checks, error: msg };
  }
}

/**
 * Create a W3C Verifiable Presentation.
 */
export async function createPresentation(params: {
  holderDid: string;
  credentials: W3CCredential[];
  challenge?: string;
}): Promise<W3CPresentation> {
  const suite = await getIssuerSuite();

  const presentation = vc.createPresentation({
    verifiableCredential: params.credentials,
    holder: params.holderDid,
  });

  const signed = await vc.signPresentation({
    presentation,
    suite,
    challenge: params.challenge ?? uuidv4(),
    documentLoader: customDocumentLoader,
  });

  return signed as W3CPresentation;
}

/**
 * Verify a W3C Verifiable Presentation.
 */
export async function verifyPresentation(
  presentation: W3CPresentation,
  challenge?: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const suite = new Ed25519Signature2020();
    const result = await vc.verify({
      presentation: { ...presentation },
      suite,
      challenge: challenge ?? '',
      documentLoader: customDocumentLoader,
    });
    return { verified: result.verified === true };
  } catch (error) {
    return {
      verified: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Build a credential payload from the application's internal format.
 * Maps mock credential data to W3C VC structure.
 */
export function toW3CCredential(internal: {
  id: string;
  type: string;
  issuer: string;
  issuanceDate: string;
  recipient: string;
  data: Record<string, string>;
  status: string;
}): W3CCredential {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: `urn:credential:${internal.id}`,
    type: ['VerifiableCredential', internal.type.replace(/\s+/g, '')],
    issuer: internal.issuer,
    issuanceDate: new Date(internal.issuanceDate).toISOString(),
    credentialSubject: {
      id: internal.recipient,
      ...internal.data,
    },
  };
}
