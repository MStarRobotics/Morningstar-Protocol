/**
 * Selective Disclosure Service
 *
 * Implements privacy-preserving credential presentation through:
 * - SD-JWT (Selective Disclosure JWT) patterns
 * - Per-claim hash commitments for redacted fields
 * - Integration with ZK proofs for range proofs on numeric claims
 * - Derived credential generation with only disclosed attributes
 *
 * Reference: https://www.ietf.org/archive/id/draft-ietf-oauth-selective-disclosure-jwt-08.html
 */

import type { W3CVerifiableCredential, CredentialSubject } from './types';
import { sha256 } from '../cryptography';
import { createSelectiveDisclosureProof, createRangeProof, ZKProof } from '../zkProof';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A disclosure object representing a single claim that may be revealed. */
export interface Disclosure {
  claimName: string;
  claimValue: unknown;
  salt: string;
  hash: string;
  disclosed: boolean;
}

/** The result of creating a selective disclosure credential. */
export interface SelectiveDisclosureResult {
  credential: W3CVerifiableCredential;
  disclosures: Disclosure[];
  sdHash: string;
}

/** Request for selective disclosure from a verifier. */
export interface DisclosureRequest {
  requestedClaims: string[];
  requiredClaims: string[];
  rangeProofs?: RangeProofRequest[];
  verifierDID: string;
  challenge?: string;
}

/** Request for a range proof on a numeric claim. */
export interface RangeProofRequest {
  claimName: string;
  minValue?: number;
  maxValue?: number;
}

// ---------------------------------------------------------------------------
// SD-JWT Style Selective Disclosure
// ---------------------------------------------------------------------------

/**
 * Prepare a credential for selective disclosure.
 * Creates hash commitments for all claims, allowing individual disclosure later.
 */
export async function prepareSelectiveDisclosure(
  credential: W3CVerifiableCredential
): Promise<SelectiveDisclosureResult> {
  const subject = Array.isArray(credential.credentialSubject)
    ? credential.credentialSubject[0]
    : credential.credentialSubject;

  const disclosures: Disclosure[] = [];

  for (const [key, value] of Object.entries(subject)) {
    if (key === 'id') continue; // Subject DID is always disclosed

    const salt = generateSalt();
    const hash = await sha256(`${salt}:${key}:${JSON.stringify(value)}`);

    disclosures.push({
      claimName: key,
      claimValue: value,
      salt,
      hash,
      disclosed: false,
    });
  }

  // Create the SD hash (commitment to all disclosures)
  const allHashes = disclosures.map(d => d.hash).join(':');
  const sdHash = await sha256(allHashes);

  // Build the credential with hash commitments
  const sdSubject: CredentialSubject = { id: subject.id };
  for (const disclosure of disclosures) {
    sdSubject[`_sd_${disclosure.claimName}`] = disclosure.hash;
  }

  const sdCredential: W3CVerifiableCredential = {
    ...credential,
    credentialSubject: sdSubject,
    type: [...credential.type.filter(t => t !== 'SelectiveDisclosureCredential'), 'SelectiveDisclosureCredential'],
  };

  return { credential: sdCredential, disclosures, sdHash };
}

/**
 * Create a derived credential by selectively disclosing specific claims.
 */
export async function createSelectivelyDisclosedCredential(
  original: W3CVerifiableCredential,
  claimsToDisclose: string[]
): Promise<{ credential: W3CVerifiableCredential; disclosures: Disclosure[] }> {
  const sdResult = await prepareSelectiveDisclosure(original);

  // Mark requested claims as disclosed
  const disclosedResult: Disclosure[] = sdResult.disclosures.map(d => ({
    ...d,
    disclosed: claimsToDisclose.includes(d.claimName),
  }));

  // Build the derived credential subject
  const subject = Array.isArray(original.credentialSubject)
    ? original.credentialSubject[0]
    : original.credentialSubject;

  const derivedSubject: CredentialSubject = { id: subject.id };

  for (const disclosure of disclosedResult) {
    if (disclosure.disclosed) {
      // Include the actual value
      derivedSubject[disclosure.claimName] = disclosure.claimValue;
    } else {
      // Include only the hash commitment
      derivedSubject[`_sd_${disclosure.claimName}`] = disclosure.hash;
    }
  }

  const derivedCredential: W3CVerifiableCredential = {
    ...original,
    credentialSubject: derivedSubject,
    type: [...original.type.filter(t => t !== 'SelectiveDisclosureCredential'), 'SelectiveDisclosureCredential'],
  };

  return { credential: derivedCredential, disclosures: disclosedResult };
}

// ---------------------------------------------------------------------------
// Disclosure Verification
// ---------------------------------------------------------------------------

/**
 * Verify that a disclosed claim matches its hash commitment.
 */
export async function verifyDisclosure(disclosure: Disclosure): Promise<boolean> {
  const expectedHash = await sha256(
    `${disclosure.salt}:${disclosure.claimName}:${JSON.stringify(disclosure.claimValue)}`
  );
  return expectedHash === disclosure.hash;
}

/**
 * Verify all disclosures in a selectively disclosed credential.
 */
export async function verifyAllDisclosures(
  disclosures: Disclosure[]
): Promise<{ allValid: boolean; results: Map<string, boolean> }> {
  const results = new Map<string, boolean>();

  for (const disclosure of disclosures) {
    if (disclosure.disclosed) {
      const valid = await verifyDisclosure(disclosure);
      results.set(disclosure.claimName, valid);
    }
  }

  const allValid = Array.from(results.values()).every(v => v);
  return { allValid, results };
}

// ---------------------------------------------------------------------------
// Range Proofs (via ZKP)
// ---------------------------------------------------------------------------

/**
 * Create a range proof for a numeric claim without revealing the exact value.
 * Example: Prove "GPA >= 3.0" without revealing the exact GPA.
 */
export async function createClaimRangeProof(
  credential: W3CVerifiableCredential,
  claimName: string,
  minValue?: number,
  maxValue?: number
): Promise<ZKProof> {
  const subject = Array.isArray(credential.credentialSubject)
    ? credential.credentialSubject[0]
    : credential.credentialSubject;

  const value = Number(subject[claimName]);
  if (isNaN(value)) {
    throw new Error(`Claim "${claimName}" is not numeric`);
  }

  const min = minValue ?? 0;
  const max = maxValue ?? 1000;

  return createRangeProof(value, min, max, claimName);
}

/**
 * Process a disclosure request from a verifier.
 * Returns a credential with only the requested/required claims disclosed,
 * plus range proofs where requested.
 */
export async function processDisclosureRequest(
  credential: W3CVerifiableCredential,
  request: DisclosureRequest
): Promise<{
  credential: W3CVerifiableCredential;
  disclosures: Disclosure[];
  rangeProofs: ZKProof[];
}> {
  // Combine required and requested claims
  const allClaimsToDisclose = [
    ...new Set([...request.requiredClaims, ...request.requestedClaims]),
  ];

  // Create selective disclosure
  const { credential: sdCredential, disclosures } = await createSelectivelyDisclosedCredential(
    credential,
    allClaimsToDisclose
  );

  // Generate range proofs if requested
  const rangeProofs: ZKProof[] = [];
  if (request.rangeProofs) {
    for (const rpRequest of request.rangeProofs) {
      try {
        const proof = await createClaimRangeProof(
          credential,
          rpRequest.claimName,
          rpRequest.minValue,
          rpRequest.maxValue
        );
        rangeProofs.push(proof);
      } catch (error) {
        logger.warn(`[SelectiveDisclosure] Range proof failed for ${rpRequest.claimName}:`, error);
      }
    }
  }

  return { credential: sdCredential, disclosures, rangeProofs };
}

// ---------------------------------------------------------------------------
// ZK-Based Selective Disclosure
// ---------------------------------------------------------------------------

/**
 * Create a zero-knowledge selective disclosure proof for credential attributes.
 * This uses the existing zkProof service for a deeper privacy guarantee.
 */
export async function createZKSelectiveDisclosure(
  credential: W3CVerifiableCredential,
  attributesToProve: string[]
): Promise<ZKProof> {
  const subject = Array.isArray(credential.credentialSubject)
    ? credential.credentialSubject[0]
    : credential.credentialSubject;

  const credentialData: Record<string, any> = { id: credential.id, ...subject };
  return createSelectiveDisclosureProof(credentialData, attributesToProve);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
