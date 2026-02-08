/**
 * Credential Manager - Create, Sign, and Issue W3C Verifiable Credentials
 *
 * Orchestrates the full credential issuance lifecycle:
 * 1. Build W3C VC Data Model v2.0 compliant credential
 * 2. Validate against schema (credentialSchemaRegistry)
 * 3. Sign with Ed25519 or ECDSA P-256
 * 4. Anchor hash on blockchain (blockchainManager)
 * 5. Store on IPFS (ipfsService)
 * 6. Register in smart contract (credentialRegistry)
 * 7. Allocate status list index (statusListService)
 */

import type {
  W3CVerifiableCredential,
  IssueCredentialParams,
  IssuanceResult,
  CredentialFormat,
  VCKeyPair,
  Proof,
  VC_CONTEXT_V1,
  VC_CONTEXT_V2,
} from './types';
import { createProof, generateKeyPairForProof } from './cryptoSuites';
import { documentLoader } from './documentLoader';
import { getDigitalCredentialsVC } from './packageBridge';
import { sha256 } from '../cryptography';
import { credentialSchemaRegistry } from '../credentialSchema';
import { blockchainManager } from '../blockchainService';
import { statusListService } from '../statusList';
import { credentialRegistry } from '../smartContracts';
import { ipfsService } from '../ipfsService';
import { governanceRegistry } from '../governanceRegistry';
import { validateCredentialPayload, sanitizeDID } from '../validation';
import { gdprService } from '../gdprCompliance';
import type { Credential } from '../../types';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Key Storage (in-memory for demo; production would use KMS)
// ---------------------------------------------------------------------------

const issuerKeyStore = new Map<string, VCKeyPair>();

// ---------------------------------------------------------------------------
// Credential Creation
// ---------------------------------------------------------------------------

/**
 * Issue a W3C Verifiable Credential with full lifecycle integration.
 */
export async function issueCredential(params: IssueCredentialParams): Promise<IssuanceResult> {
  const {
    issuerDID,
    subjectDID,
    credentialType,
    credentialSubject,
    schemaId,
    format = 'jsonld',
    proofType = 'Ed25519Signature2020',
    evidence,
    termsOfUse,
    validUntil,
  } = params;

  // 1. Validate inputs
  const issuerValidation = sanitizeDID(issuerDID);
  const subjectValidation = sanitizeDID(subjectDID);
  if (!issuerValidation) throw new Error('Invalid issuer DID');
  if (!subjectValidation) throw new Error('Invalid subject DID');

  // 2. Check GDPR consent
  if (!gdprService.hasValidConsent(subjectDID, 'credential_issuance')) {
    // Auto-record consent for demo (in production, this would require explicit user consent)
    await gdprService.recordConsent(subjectDID, [
      { purpose: 'credential_issuance', granted: true, mandatory: true },
      { purpose: 'credential_verification', granted: true, mandatory: true },
    ]);
  }

  // 3. Validate subject against schema (if provided)
  if (schemaId) {
    const schemaValidation = credentialSchemaRegistry.validateSubject(schemaId, credentialSubject);
    if (!schemaValidation.valid) {
      throw new Error(`Schema validation failed: ${schemaValidation.issues.join(', ')}`);
    }
  }

  // 4. Allocate status list index
  const credentialId = `urn:uuid:${generateUUID()}`;
  const statusListIndex = statusListService.allocateIndex(credentialId);
  const statusListCredential = statusListService.exportCredential(
    issuerDID,
    `${issuerDID}/status-list/1`,
    'revocation'
  );

  // 5. Build W3C VC Data Model v2.0 credential
  const now = new Date().toISOString();
  const credential: W3CVerifiableCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: credentialId,
    type: ['VerifiableCredential', credentialType],
    issuer: governanceRegistry.getIssuer(issuerDID)
      ? { id: issuerDID, name: governanceRegistry.getIssuer(issuerDID)!.name }
      : issuerDID,
    validFrom: now,
    issuanceDate: now,
    ...(validUntil && { validUntil, expirationDate: validUntil }),
    credentialSubject: {
      id: subjectDID,
      ...credentialSubject,
    },
    credentialStatus: {
      id: `${issuerDID}/status-list/1#${statusListIndex}`,
      type: 'StatusList2021Entry',
      statusPurpose: 'revocation',
      statusListIndex: String(statusListIndex),
      statusListCredential: statusListCredential.id,
    },
    ...(schemaId && {
      credentialSchema: {
        id: schemaId,
        type: 'JsonSchema',
      },
    }),
    ...(evidence && { evidence }),
    ...(termsOfUse && { termsOfUse }),
  };

  // 6. Structural validation
  const structuralValidation = validateCredentialPayload(credential);
  if (!structuralValidation.valid) {
    throw new Error(`Structural validation failed: ${structuralValidation.error}`);
  }

  // 7. Sign the credential
  const signedCredential = await signCredential(credential, issuerDID, proofType);

  // 8. Anchor on blockchain
  let transactionHash: string | undefined;
  try {
    const legacyCredential = toInternalCredential(signedCredential);
    const result = await blockchainManager.issueCredential(
      legacyCredential,
      issuerDID,
      subjectDID
    );
    transactionHash = result.publicTx.id;
  } catch (error) {
    logger.warn('[CredentialManager] Blockchain anchoring failed:', error);
  }

  // 9. Store on IPFS
  let ipfsCid: string | undefined;
  try {
    const ipfsResult = await ipfsService.uploadJSON(signedCredential, {
      originalFileName: `${credentialId}.json`,
      fileType: 'application/ld+json',
      credentialId,
      uploaderDID: issuerDID,
      accessControl: 'private',
      encryptionMethod: 'AES-256-GCM',
    });
    ipfsCid = ipfsResult.cid;
  } catch (error) {
    logger.warn('[CredentialManager] IPFS storage failed:', error);
  }

  // 10. Register in smart contract
  try {
    const credentialHash = await sha256(JSON.stringify(signedCredential));
    await credentialRegistry.issueCredential(
      credentialId,
      credentialHash,
      issuerDID,
      subjectDID,
      { type: credentialType, format },
      '0xGovernance001' // Admin caller for demo
    );
  } catch (error) {
    logger.warn('[CredentialManager] Smart contract registration failed:', error);
  }

  return {
    credential: signedCredential,
    format,
    transactionHash,
    ipfsCid,
    statusListIndex,
  };
}

/**
 * Sign a W3C Verifiable Credential using the specified proof type.
 * Attempts to use @digitalcredentials/vc if available, falls back to native.
 */
export async function signCredential(
  credential: W3CVerifiableCredential,
  issuerDID: string,
  proofType: string = 'Ed25519Signature2020'
): Promise<W3CVerifiableCredential> {
  // Get or generate issuer key pair
  let keyPair = issuerKeyStore.get(issuerDID);
  if (!keyPair) {
    keyPair = await generateKeyPairForProof(issuerDID, proofType as any);
    issuerKeyStore.set(issuerDID, keyPair);
  }

  // Try @digitalcredentials/vc first
  const dcVc = getDigitalCredentialsVC();
  if (dcVc && dcVc.issue) {
    try {
      const signed = await dcVc.issue({
        credential: { ...credential },
        documentLoader,
      });
      return signed as W3CVerifiableCredential;
    } catch (error) {
      logger.warn('[CredentialManager] @digitalcredentials/vc signing failed, using native:', error);
    }
  }

  // Native signing fallback
  const credentialData = JSON.stringify(credential);
  const proof = await createProof(
    credentialData,
    keyPair,
    'assertionMethod'
  );

  return {
    ...credential,
    proof,
  };
}

// ---------------------------------------------------------------------------
// Credential Format Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a W3C VC to the internal Credential format used by existing services.
 */
export function toInternalCredential(w3c: W3CVerifiableCredential): Credential {
  const issuerStr = typeof w3c.issuer === 'string' ? w3c.issuer : w3c.issuer.id;
  const subject = Array.isArray(w3c.credentialSubject) ? w3c.credentialSubject[0] : w3c.credentialSubject;
  const credType = w3c.type.find(t => t !== 'VerifiableCredential') || w3c.type[0];

  // Separate visible and hidden data
  const data: Record<string, string> = {};
  const hiddenData: Record<string, string> = {};

  for (const [key, value] of Object.entries(subject)) {
    if (key === 'id') continue;
    if (typeof value === 'string') {
      data[key] = value;
    } else if (value !== null && value !== undefined) {
      data[key] = String(value);
    }
  }

  return {
    id: w3c.id || `vc-${Date.now()}`,
    type: credType,
    issuer: issuerStr,
    issuanceDate: w3c.validFrom || w3c.issuanceDate || new Date().toISOString(),
    recipient: subject.id || '',
    status: 'active',
    data,
    hiddenData,
  };
}

/**
 * Convert an internal Credential to W3C VC format.
 */
export function fromInternalCredential(credential: Credential, issuerDID?: string): W3CVerifiableCredential {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/ns/credentials/v2',
    ],
    id: `urn:credential:${credential.id}`,
    type: ['VerifiableCredential', credential.type],
    issuer: issuerDID || credential.issuer,
    validFrom: credential.issuanceDate,
    issuanceDate: credential.issuanceDate,
    credentialSubject: {
      id: credential.recipient,
      ...credential.data,
    },
  };
}

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

/**
 * Get or generate an issuer's key pair.
 */
export async function getIssuerKeyPair(
  issuerDID: string,
  proofType: string = 'Ed25519Signature2020'
): Promise<VCKeyPair> {
  let keyPair = issuerKeyStore.get(issuerDID);
  if (!keyPair) {
    keyPair = await generateKeyPairForProof(issuerDID, proofType as any);
    issuerKeyStore.set(issuerDID, keyPair);
  }
  return keyPair;
}

/**
 * Register an externally-created key pair for an issuer.
 */
export function registerIssuerKeyPair(issuerDID: string, keyPair: VCKeyPair): void {
  issuerKeyStore.set(issuerDID, keyPair);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
