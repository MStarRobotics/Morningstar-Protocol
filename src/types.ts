export type Role = 'guest' | 'student' | 'issuer' | 'verifier' | 'governance';

export interface UserProfile {
  did: string;
  role: Role;
  name: string;
  avatarUrl?: string;
  balance?: string; // ETH/MATIC
  institutionName?: string;
}

export interface Credential {
  id: string;
  type: string;
  issuer: string;
  issuanceDate: string;
  recipient: string;
  status: 'active' | 'revoked' | 'suspended';
  data: Record<string, string>;
  hiddenData?: Record<string, string>; // Private attributes only visible to holder
  cid?: string; // IPFS hash
  /** W3C Verifiable Credential representation (when available) */
  w3cCredential?: import('./services/vc/types').W3CVerifiableCredential;
  /** Credential format: json-ld, jwt, or internal */
  format?: 'jsonld' | 'jwt' | 'internal';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  hash: string;
  status: 'confirmed' | 'pending' | 'failed';
}

export interface SchemaTemplate {
  schemaName: string;
  fields: { name: string; type: string; required: boolean }[];
}

export interface Institution {
  id: string;
  address: string;
  name: string;
  role: 'ISSUER_ROLE' | 'NONE';
  kycStatus: 'verified' | 'pending' | 'rejected';
  addedDate: string;
  updatedAt?: string;
}

export const MOCK_DID = "did:polygon:0x123...abc";

// Re-export W3C VC types for convenient access
export type {
  W3CVerifiableCredential,
  W3CVerifiablePresentation,
  W3CVerificationResult,
  IssueCredentialParams,
  IssuanceResult as VCIssuanceResult,
  CredentialFormat,
} from './services/vc/types';
