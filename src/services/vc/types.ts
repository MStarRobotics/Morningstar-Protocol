/**
 * W3C Verifiable Credentials Data Model v2.0 Type Definitions
 * Implements the complete type system for the VC ecosystem.
 *
 * References:
 * - W3C VC Data Model v2.0: https://www.w3.org/TR/vc-data-model-2.0/
 * - W3C DID Core v1.0: https://www.w3.org/TR/did-core/
 * - W3C Data Integrity: https://www.w3.org/TR/vc-data-integrity/
 */

// ---------------------------------------------------------------------------
// Core VC Data Model v2.0
// ---------------------------------------------------------------------------

/**
 * W3C Verifiable Credential - the canonical format for issued credentials.
 * Supports both v1.1 and v2.0 fields for backward compatibility.
 */
export interface W3CVerifiableCredential {
  '@context': (string | Record<string, unknown>)[];
  id?: string;
  type: string[];
  issuer: string | IssuerObject;
  /** v2.0 field: replaces issuanceDate */
  validFrom: string;
  /** v2.0 field: replaces expirationDate */
  validUntil?: string;
  /** v1.1 backward compatibility */
  issuanceDate?: string;
  /** v1.1 backward compatibility */
  expirationDate?: string;
  credentialSubject: CredentialSubject | CredentialSubject[];
  credentialSchema?: CredentialSchemaRef | CredentialSchemaRef[];
  credentialStatus?: CredentialStatusRef;
  evidence?: Evidence[];
  termsOfUse?: TermsOfUse[];
  refreshService?: RefreshService;
  proof?: Proof | Proof[];
}

/** Issuer represented as an object with metadata. */
export interface IssuerObject {
  id: string;
  name?: string;
  description?: string;
  image?: string;
  [key: string]: unknown;
}

/** The entity described by a credential. */
export interface CredentialSubject {
  id?: string;
  [key: string]: unknown;
}

/** Reference to a credential schema for structural validation. */
export interface CredentialSchemaRef {
  id: string;
  type: string;
}

/** Reference to a credential status mechanism (revocation / suspension). */
export interface CredentialStatusRef {
  id: string;
  type: string;
  statusPurpose: 'revocation' | 'suspension';
  statusListIndex: string;
  statusListCredential: string;
}

/** Evidence supporting the claims in the credential. */
export interface Evidence {
  id?: string;
  type: string[];
  verifier?: string;
  evidenceDocument?: string;
  subjectPresence?: string;
  documentPresence?: string;
}

/** Terms of use governing the credential. */
export interface TermsOfUse {
  id?: string;
  type: string;
  profile?: string;
  prohibition?: TermsProhibition[];
}

export interface TermsProhibition {
  assigner: string;
  assignee: string;
  target: string;
  action: string[];
}

/** Service for refreshing a credential's data. */
export interface RefreshService {
  id: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Proof Types
// ---------------------------------------------------------------------------

/** Cryptographic proof attached to a credential or presentation. */
export interface Proof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  /** Data Integrity proof value (multibase-encoded) */
  proofValue?: string;
  /** JWS-based proof */
  jws?: string;
  /** Data Integrity cryptosuite identifier */
  cryptosuite?: string;
  challenge?: string;
  domain?: string;
  nonce?: string;
}

export type ProofType =
  | 'Ed25519Signature2020'
  | 'EcdsaSecp256k1Signature2019'
  | 'DataIntegrityProof'
  | 'JsonWebSignature2020';

export type CryptoSuite = 'eddsa-rdfc-2022' | 'ecdsa-rdfc-2019';

// ---------------------------------------------------------------------------
// Verifiable Presentations
// ---------------------------------------------------------------------------

/** W3C Verifiable Presentation - wraps one or more VCs for sharing. */
export interface W3CVerifiablePresentation {
  '@context': (string | Record<string, unknown>)[];
  id?: string;
  type: string[];
  holder: string;
  /** Credentials can be embedded objects or JWT strings */
  verifiableCredential: (W3CVerifiableCredential | string)[];
  proof?: Proof | Proof[];
}

// ---------------------------------------------------------------------------
// Credential Formats
// ---------------------------------------------------------------------------

export type CredentialFormat = 'jsonld' | 'jwt' | 'sd-jwt';

// ---------------------------------------------------------------------------
// Triangle of Trust
// ---------------------------------------------------------------------------

/** A participant in the Issuer-Holder-Verifier trust triangle. */
export interface TrustTriangleParticipant {
  did: string;
  role: 'issuer' | 'holder' | 'verifier';
  name?: string;
  publicKey?: string;
  trustedBy?: string[];
}

// ---------------------------------------------------------------------------
// EBSI Extensions
// ---------------------------------------------------------------------------

/** EBSI-compliant Verifiable Credential (European academic credentials). */
export interface EBSICredential extends W3CVerifiableCredential {
  credentialSchema: {
    id: string;
    type: 'FullJsonSchemaValidator2021';
  };
  termsOfUse: [{
    id: string;
    type: 'IssuanceCertificate';
  }];
}

/** EBSI Trusted Issuer metadata. */
export interface EBSITrustedIssuer {
  did: string;
  organizationInfo: {
    id: string;
    legalName: string;
    currentAddress: string;
    domainName: string;
  };
  issuerType: string[];
}

// ---------------------------------------------------------------------------
// Operation Parameters & Results
// ---------------------------------------------------------------------------

/** Parameters for issuing a new credential. */
export interface IssueCredentialParams {
  issuerDID: string;
  subjectDID: string;
  credentialType: string;
  credentialSubject: Record<string, unknown>;
  schemaId?: string;
  format?: CredentialFormat;
  proofType?: ProofType;
  evidence?: Evidence[];
  termsOfUse?: TermsOfUse[];
  validUntil?: string;
}

/** Result of a credential issuance operation. */
export interface IssuanceResult {
  credential: W3CVerifiableCredential;
  format: CredentialFormat;
  transactionHash?: string;
  ipfsCid?: string;
  statusListIndex?: number;
  jwt?: string;
}

/** Parameters for creating a Verifiable Presentation. */
export interface CreatePresentationParams {
  holderDID: string;
  credentials: W3CVerifiableCredential[];
  challenge?: string;
  domain?: string;
  format?: CredentialFormat;
  selectiveFields?: string[];
}

/** Multi-layer verification result. */
export interface W3CVerificationResult {
  valid: boolean;
  checks: W3CVerificationCheck[];
  errors: string[];
  warnings: string[];
  credentialType?: string;
  issuerName?: string;
  subjectName?: string;
}

export interface W3CVerificationCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  detail: string;
  layer: 'structural' | 'cryptographic' | 'status' | 'trust' | 'schema';
}

/** Engine availability status reported by the package bridge. */
export interface EngineStatus {
  digitalCredentialsVC: boolean;
  digitalCredentialsVerifier: boolean;
  nobleEd25519: boolean;
  didJwtVc: boolean;
  nativeWebCrypto: boolean;
}

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

/** A key pair used for signing credentials / presentations. */
export interface VCKeyPair {
  id: string;
  type: 'Ed25519' | 'EcdsaSecp256k1' | 'P-256';
  controller: string;
  publicKeyMultibase?: string;
  publicKeyHex?: string;
  publicKeyJwk?: JsonWebKey;
  privateKey?: CryptoKey | Uint8Array;
  publicKey?: CryptoKey | Uint8Array;
}

// ---------------------------------------------------------------------------
// JSON-LD Context Constants
// ---------------------------------------------------------------------------

export const VC_CONTEXT_V1 = 'https://www.w3.org/2018/credentials/v1';
export const VC_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2';
export const DID_CONTEXT_V1 = 'https://www.w3.org/ns/did/v1';
export const ED25519_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1';
export const DATA_INTEGRITY_CONTEXT = 'https://w3id.org/security/data-integrity/v2';
export const SECURITY_CONTEXT = 'https://w3id.org/security/v2';
export const EBSI_CONTEXT = 'https://ebsi.eu/credentials/v1';
