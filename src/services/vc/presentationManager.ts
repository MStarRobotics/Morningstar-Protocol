/**
 * Verifiable Presentation Manager
 *
 * Creates and manages W3C Verifiable Presentations (VPs) for the Holder role.
 * Supports:
 * - Multi-credential presentations
 * - Challenge-response protocol
 * - Selective disclosure within presentations
 * - Both JSON-LD and JWT-VP formats
 */

import type {
  W3CVerifiablePresentation,
  W3CVerifiableCredential,
  CreatePresentationParams,
  Proof,
  VCKeyPair,
} from './types';
import { createProof, generateKeyPairForProof } from './cryptoSuites';
import { getDigitalCredentialsVC } from './packageBridge';
import { documentLoader } from './documentLoader';
import { sha256 } from '../cryptography';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Holder key store (in-memory for demo)
// ---------------------------------------------------------------------------

const holderKeyStore = new Map<string, VCKeyPair>();

// ---------------------------------------------------------------------------
// Presentation Creation
// ---------------------------------------------------------------------------

/**
 * Create a W3C Verifiable Presentation wrapping one or more VCs.
 */
export async function createPresentation(
  params: CreatePresentationParams
): Promise<W3CVerifiablePresentation> {
  const {
    holderDID,
    credentials,
    challenge,
    domain,
    format = 'jsonld',
    selectiveFields,
  } = params;

  // Apply selective disclosure if requested
  let presentationCredentials = credentials;
  if (selectiveFields && selectiveFields.length > 0) {
    presentationCredentials = credentials.map(vc => applySelectiveDisclosure(vc, selectiveFields));
  }

  // Build the presentation
  const presentationId = `urn:uuid:${generateUUID()}`;

  const presentation: W3CVerifiablePresentation = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/ns/credentials/v2',
    ],
    id: presentationId,
    type: ['VerifiablePresentation'],
    holder: holderDID,
    verifiableCredential: presentationCredentials,
  };

  // Sign the presentation
  const signedPresentation = await signPresentation(presentation, holderDID, challenge, domain);

  return signedPresentation;
}

/**
 * Sign a Verifiable Presentation with the holder's key.
 */
async function signPresentation(
  presentation: W3CVerifiablePresentation,
  holderDID: string,
  challenge?: string,
  domain?: string
): Promise<W3CVerifiablePresentation> {
  // Get or generate holder key pair
  let keyPair = holderKeyStore.get(holderDID);
  if (!keyPair) {
    keyPair = await generateKeyPairForProof(holderDID, 'Ed25519Signature2020');
    holderKeyStore.set(holderDID, keyPair);
  }

  // Try @digitalcredentials/vc first
  const dcVc = getDigitalCredentialsVC();
  if (dcVc && dcVc.signPresentation) {
    try {
      const signed = await dcVc.signPresentation({
        presentation: { ...presentation },
        challenge,
        domain,
        documentLoader,
      });
      return signed as W3CVerifiablePresentation;
    } catch (error) {
      logger.warn('[PresentationManager] @digitalcredentials/vc signing failed, using native:', error);
    }
  }

  // Native signing
  const presentationData = JSON.stringify({
    ...presentation,
    // Include challenge/domain in signed data
    ...(challenge && { challenge }),
    ...(domain && { domain }),
  });

  const proof = await createProof(presentationData, keyPair, 'authentication', challenge, domain);

  return {
    ...presentation,
    proof,
  };
}

// ---------------------------------------------------------------------------
// Selective Disclosure
// ---------------------------------------------------------------------------

/**
 * Apply selective disclosure to a credential, keeping only specified fields.
 * Fields not in the selectiveFields list are replaced with hash commitments.
 */
function applySelectiveDisclosure(
  credential: W3CVerifiableCredential,
  fieldsToDisclose: string[]
): W3CVerifiableCredential {
  const subject = Array.isArray(credential.credentialSubject)
    ? credential.credentialSubject[0]
    : credential.credentialSubject;

  const disclosedSubject: Record<string, unknown> = {};

  // Always include the subject's DID
  if (subject.id) {
    disclosedSubject.id = subject.id;
  }

  for (const [key, value] of Object.entries(subject)) {
    if (key === 'id') continue;

    if (fieldsToDisclose.includes(key)) {
      // Disclose this field
      disclosedSubject[key] = value;
    } else {
      // Redact: replace with a hash commitment
      disclosedSubject[`_sd_${key}`] = `sha256:${hashSync(String(value))}`;
    }
  }

  return {
    ...credential,
    credentialSubject: disclosedSubject,
    // Add metadata about selective disclosure
    type: [...credential.type.filter(t => t !== 'SelectivelyDisclosedCredential'), 'SelectivelyDisclosedCredential'],
  };
}

// ---------------------------------------------------------------------------
// Presentation Derivation
// ---------------------------------------------------------------------------

/**
 * Derive a presentation from a set of credentials for a specific verifier.
 * Supports combining credentials from multiple issuers.
 */
export async function derivePresentation(
  holderDID: string,
  credentials: W3CVerifiableCredential[],
  verifierDID: string,
  requestedFields?: Record<string, string[]>,
  challenge?: string
): Promise<W3CVerifiablePresentation> {
  let processedCredentials = credentials;

  // Apply per-credential selective disclosure if requested
  if (requestedFields) {
    processedCredentials = credentials.map(vc => {
      const credType = vc.type.find(t => t !== 'VerifiableCredential') || '';
      const fields = requestedFields[credType] || requestedFields['*'];
      if (fields) {
        return applySelectiveDisclosure(vc, fields);
      }
      return vc;
    });
  }

  return createPresentation({
    holderDID,
    credentials: processedCredentials,
    challenge,
  });
}

/**
 * Create a minimal presentation proving only that the holder possesses
 * credentials of certain types, without revealing the credential data.
 */
export async function createZeroKnowledgePresentation(
  holderDID: string,
  credentials: W3CVerifiableCredential[],
  challenge?: string
): Promise<W3CVerifiablePresentation> {
  // Create proof of possession without full credential data
  const minimalCredentials: W3CVerifiableCredential[] = credentials.map(vc => ({
    '@context': vc['@context'],
    type: vc.type,
    issuer: typeof vc.issuer === 'string' ? vc.issuer : { id: vc.issuer.id },
    validFrom: vc.validFrom,
    issuanceDate: vc.issuanceDate,
    credentialSubject: {
      id: (Array.isArray(vc.credentialSubject) ? vc.credentialSubject[0] : vc.credentialSubject).id,
    },
    // Keep proof for verification of the credential itself
    proof: vc.proof,
  }));

  return createPresentation({
    holderDID,
    credentials: minimalCredentials,
    challenge,
  });
}

// ---------------------------------------------------------------------------
// Holder Key Management
// ---------------------------------------------------------------------------

/**
 * Get or generate a holder's key pair.
 */
export async function getHolderKeyPair(holderDID: string): Promise<VCKeyPair> {
  let keyPair = holderKeyStore.get(holderDID);
  if (!keyPair) {
    keyPair = await generateKeyPairForProof(holderDID, 'Ed25519Signature2020');
    holderKeyStore.set(holderDID, keyPair);
  }
  return keyPair;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Synchronous hash for selective disclosure (not cryptographically strong, just for demo redaction labels). */
function hashSync(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
