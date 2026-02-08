/**
 * W3C Verifiable Credentials Service Layer - Barrel Exports
 *
 * Single import point for all VC functionality:
 *   import { vcFacade, W3CVerifiableCredential, ... } from './services/vc';
 */

// Main facade (primary API for pages/components)
export { VCFacade, vcFacade } from './vcFacade';

// Types
export type {
  W3CVerifiableCredential,
  W3CVerifiablePresentation,
  W3CVerificationResult,
  W3CVerificationCheck,
  IssueCredentialParams,
  IssuanceResult,
  CreatePresentationParams,
  CredentialFormat,
  ProofType,
  CryptoSuite,
  Proof,
  CredentialSubject,
  CredentialSchemaRef,
  CredentialStatusRef,
  Evidence,
  TermsOfUse,
  IssuerObject,
  EBSICredential,
  EBSITrustedIssuer,
  TrustTriangleParticipant,
  EngineStatus,
  VCKeyPair,
} from './types';

// Constants
export {
  VC_CONTEXT_V1,
  VC_CONTEXT_V2,
  DID_CONTEXT_V1,
  ED25519_CONTEXT,
  DATA_INTEGRITY_CONTEXT,
  SECURITY_CONTEXT,
  EBSI_CONTEXT,
} from './types';

// Credential Manager
export {
  issueCredential,
  signCredential,
  toInternalCredential,
  fromInternalCredential,
  getIssuerKeyPair,
  registerIssuerKeyPair,
} from './credentialManager';

// Verifier Service
export {
  verifyW3CCredential,
  verifyW3CPresentation,
} from './verifierService';

// Presentation Manager
export {
  createPresentation,
  derivePresentation,
  createZeroKnowledgePresentation,
  getHolderKeyPair,
} from './presentationManager';

// JWT-VC
export {
  credentialToJWT,
  jwtToCredential,
  presentationToJWT,
  jwtToPresentation,
} from './jwtCredentials';

// EBSI Adapter
export {
  toEBSICredential,
  createEBSIDiploma,
  createECTSTransfer,
  validateEBSIConformance,
  registerEBSITrustedIssuer,
  isEBSIAccredited,
  EBSI_CREDENTIAL_TYPES,
  EBSI_SCHEMA_IDS,
} from './ebsiAdapter';

// Selective Disclosure
export {
  prepareSelectiveDisclosure,
  createSelectivelyDisclosedCredential,
  verifyDisclosure,
  verifyAllDisclosures,
  createClaimRangeProof,
  processDisclosureRequest,
  createZKSelectiveDisclosure,
} from './selectiveDisclosure';
export type {
  Disclosure,
  SelectiveDisclosureResult,
  DisclosureRequest,
  RangeProofRequest,
} from './selectiveDisclosure';

// Crypto Suites
export {
  generateEd25519KeyPair,
  generateP256VCKeyPair,
  generateKeyPairForProof,
  signEd25519,
  verifyEd25519,
  createProof,
  verifyProof,
  bytesToHex,
  hexToBytes,
  bytesToBase58,
  base58ToBytes,
  keyPairToJWK,
} from './cryptoSuites';

// DID Resolver
export {
  resolveW3CDID,
  resolveVerificationMethod,
  createDIDResolver,
} from './didResolver';
export type {
  DIDResolutionResult,
  DIDDocumentMetadata,
  DIDResolutionMetadata,
} from './didResolver';

// Document Loader
export {
  createDocumentLoader,
  documentLoader,
  registerContext,
  hasContext,
  getAvailableContexts,
} from './documentLoader';

// Package Bridge
export {
  detectEngines,
  getEngineStatus,
  getEngineReport,
  resetEngineCache,
} from './packageBridge';
