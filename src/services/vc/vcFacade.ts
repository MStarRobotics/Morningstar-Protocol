/**
 * Unified VC Facade - Single Entry Point for All W3C VC Operations
 *
 * Implements the "Triangle of Trust" pattern:
 * - Issuer: Issue and sign credentials
 * - Holder: Store, present, and selectively disclose credentials
 * - Verifier: Verify credentials and presentations
 *
 * This facade orchestrates all VC services and provides a clean API for
 * the UI layer (pages/components) to interact with.
 */

import type {
  W3CVerifiableCredential,
  W3CVerifiablePresentation,
  W3CVerificationResult,
  IssueCredentialParams,
  IssuanceResult,
  CreatePresentationParams,
  CredentialFormat,
  EBSICredential,
  EngineStatus,
  VCKeyPair,
} from './types';
import {
  issueCredential,
  signCredential,
  toInternalCredential,
  fromInternalCredential,
  getIssuerKeyPair,
} from './credentialManager';
import { verifyW3CCredential, verifyW3CPresentation } from './verifierService';
import {
  createPresentation,
  derivePresentation,
  createZeroKnowledgePresentation,
} from './presentationManager';
import { credentialToJWT, jwtToCredential, presentationToJWT, jwtToPresentation } from './jwtCredentials';
import { toEBSICredential, createEBSIDiploma, validateEBSIConformance } from './ebsiAdapter';
import {
  createSelectivelyDisclosedCredential,
  processDisclosureRequest,
  createZKSelectiveDisclosure,
  type DisclosureRequest,
} from './selectiveDisclosure';
import { detectEngines, getEngineStatus, getEngineReport } from './packageBridge';

// ---------------------------------------------------------------------------
// VCFacade Class
// ---------------------------------------------------------------------------

export class VCFacade {
  private initialized = false;

  /**
   * Initialize the VC engine (detect available packages).
   * Call this once at application startup.
   */
  async initialize(): Promise<EngineStatus> {
    const status = await detectEngines();
    this.initialized = true;
    return status;
  }

  // =========================================================================
  // ISSUER Operations
  // =========================================================================

  /**
   * Issue a new W3C Verifiable Credential.
   * Full lifecycle: validate -> sign -> anchor -> store -> register.
   */
  async issueCredential(params: IssueCredentialParams): Promise<IssuanceResult> {
    await this.ensureInitialized();
    return issueCredential(params);
  }

  /**
   * Sign an existing credential without full lifecycle processing.
   */
  async signCredential(
    credential: W3CVerifiableCredential,
    issuerDID: string,
    proofType?: string
  ): Promise<W3CVerifiableCredential> {
    await this.ensureInitialized();
    return signCredential(credential, issuerDID, proofType);
  }

  /**
   * Issue an EBSI-compliant European diploma.
   */
  async issueEBSIDiploma(params: Parameters<typeof createEBSIDiploma>[0]): Promise<IssuanceResult> {
    await this.ensureInitialized();
    const ebsiCredential = createEBSIDiploma(params);
    const signed = await signCredential(ebsiCredential, params.issuerDID);
    return {
      credential: signed,
      format: 'jsonld',
    };
  }

  // =========================================================================
  // VERIFIER Operations
  // =========================================================================

  /**
   * Verify a W3C Verifiable Credential through all verification layers.
   */
  async verifyCredential(credential: W3CVerifiableCredential): Promise<W3CVerificationResult> {
    await this.ensureInitialized();
    return verifyW3CCredential(credential);
  }

  /**
   * Verify a Verifiable Presentation (including embedded credentials).
   */
  async verifyPresentation(presentation: W3CVerifiablePresentation): Promise<W3CVerificationResult> {
    await this.ensureInitialized();
    return verifyW3CPresentation(presentation);
  }

  /**
   * Validate EBSI conformance of a credential.
   */
  validateEBSIConformance(credential: W3CVerifiableCredential) {
    return validateEBSIConformance(credential);
  }

  // =========================================================================
  // HOLDER Operations
  // =========================================================================

  /**
   * Create a Verifiable Presentation wrapping one or more credentials.
   */
  async createPresentation(params: CreatePresentationParams): Promise<W3CVerifiablePresentation> {
    await this.ensureInitialized();
    return createPresentation(params);
  }

  /**
   * Create a presentation with selective disclosure (only share chosen fields).
   */
  async createSelectivePresentation(
    credential: W3CVerifiableCredential,
    fieldsToDisclose: string[],
    holderDID: string,
    challenge?: string
  ): Promise<W3CVerifiablePresentation> {
    await this.ensureInitialized();

    const { credential: sdCredential } = await createSelectivelyDisclosedCredential(
      credential,
      fieldsToDisclose
    );

    return createPresentation({
      holderDID,
      credentials: [sdCredential],
      challenge,
    });
  }

  /**
   * Process a verifier's disclosure request and create a tailored presentation.
   */
  async respondToDisclosureRequest(
    credential: W3CVerifiableCredential,
    request: DisclosureRequest,
    holderDID: string
  ): Promise<{
    presentation: W3CVerifiablePresentation;
    disclosedClaims: string[];
    rangeProofsIncluded: number;
  }> {
    await this.ensureInitialized();

    const result = await processDisclosureRequest(credential, request);
    const presentation = await createPresentation({
      holderDID,
      credentials: [result.credential],
      challenge: request.challenge,
    });

    return {
      presentation,
      disclosedClaims: result.disclosures.filter(d => d.disclosed).map(d => d.claimName),
      rangeProofsIncluded: result.rangeProofs.length,
    };
  }

  /**
   * Create a zero-knowledge presentation (proves possession without data).
   */
  async createZKPresentation(
    holderDID: string,
    credentials: W3CVerifiableCredential[],
    challenge?: string
  ): Promise<W3CVerifiablePresentation> {
    await this.ensureInitialized();
    return createZeroKnowledgePresentation(holderDID, credentials, challenge);
  }

  /**
   * Derive a presentation for a specific verifier.
   */
  async derivePresentation(
    holderDID: string,
    credentials: W3CVerifiableCredential[],
    verifierDID: string,
    requestedFields?: Record<string, string[]>,
    challenge?: string
  ): Promise<W3CVerifiablePresentation> {
    await this.ensureInitialized();
    return derivePresentation(holderDID, credentials, verifierDID, requestedFields, challenge);
  }

  // =========================================================================
  // FORMAT CONVERSION
  // =========================================================================

  /**
   * Encode a credential as a JWT string.
   */
  async toJWT(credential: W3CVerifiableCredential, issuerDID: string): Promise<string> {
    await this.ensureInitialized();
    const keyPair = await getIssuerKeyPair(issuerDID);
    return credentialToJWT(credential, keyPair);
  }

  /**
   * Decode a JWT string back to a W3C Verifiable Credential.
   */
  async fromJWT(jwt: string): Promise<W3CVerifiableCredential | null> {
    return jwtToCredential(jwt);
  }

  /**
   * Encode a presentation as a JWT string.
   */
  async presentationToJWT(
    presentation: W3CVerifiablePresentation,
    holderDID: string,
    challenge?: string,
    domain?: string
  ): Promise<string> {
    await this.ensureInitialized();
    const { getHolderKeyPair } = await import('./presentationManager');
    const keyPair = await getHolderKeyPair(holderDID);
    return presentationToJWT(presentation, keyPair, challenge, domain);
  }

  /**
   * Decode a JWT string back to a Verifiable Presentation.
   */
  async presentationFromJWT(jwt: string): Promise<W3CVerifiablePresentation | null> {
    return jwtToPresentation(jwt);
  }

  /**
   * Convert a credential to EBSI-compliant format.
   */
  toEBSI(credential: W3CVerifiableCredential): EBSICredential {
    return toEBSICredential(credential);
  }

  /**
   * Convert between internal Credential type and W3C VC.
   */
  toInternalFormat(w3c: W3CVerifiableCredential) {
    return toInternalCredential(w3c);
  }

  fromInternalFormat(credential: Parameters<typeof fromInternalCredential>[0], issuerDID?: string) {
    return fromInternalCredential(credential, issuerDID);
  }

  // =========================================================================
  // ENGINE STATUS
  // =========================================================================

  /**
   * Get the current engine availability status.
   */
  async getAvailableEngines(): Promise<EngineStatus> {
    return getEngineStatus();
  }

  /**
   * Get a human-readable report of engine availability.
   */
  async getEngineReport(): Promise<string[]> {
    return getEngineReport();
  }

  // =========================================================================
  // INTERNAL
  // =========================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

export const vcFacade = new VCFacade();
