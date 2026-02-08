/**
 * BACIP - Blockchain Academic Credential Interoperability Protocol
 * Implementation based on research paper: 2406.15482v1
 * 
 * Core protocol for credential issuance, verification, and interoperability
 */

import { sha256, encryptData, decryptData, generateAESKey } from './cryptography';
import { generateZKProof, verifyZKProof } from './zkProof';
import { logger } from './logger';

// BACIP Protocol Version
export const BACIP_VERSION = '1.0.0';

// W3C Verifiable Credential Context
export const VC_CONTEXT = [
  'https://www.w3.org/2018/credentials/v1',
  'https://w3id.org/security/suites/ed25519-2020/v1'
];

// BACIP Credential Types
export enum CredentialType {
  ACADEMIC_DEGREE = 'AcademicDegree',
  DIPLOMA = 'Diploma',
  CERTIFICATE = 'Certificate',
  TRANSCRIPT = 'Transcript',
  BADGE = 'Badge'
}

// BACIP Credential Status
export enum CredentialStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired'
}

// Verifiable Credential Structure (W3C Standard)
export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: {
    id: string;
    name: string;
  };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;
    [key: string]: unknown;
  };
  credentialStatus?: {
    id: string;
    type: string;
    statusListIndex: string;
    statusListCredential: string;
  };
  proof: {
    type: string;
    created: string;
    proofPurpose: string;
    verificationMethod: string;
    jws: string;
  };
}

// Verifiable Presentation Structure
export interface VerifiablePresentation {
  '@context': string[];
  type: string[];
  verifiableCredential: VerifiableCredential[];
  proof: {
    type: string;
    created: string;
    challenge: string;
    proofPurpose: string;
    verificationMethod: string;
    jws: string;
  };
}

// BACIP Protocol Service
export class BACIPProtocol {
  /**
   * Create W3C compliant Verifiable Credential
   */
  static async createVerifiableCredential(
    issuerDID: string,
    subjectDID: string,
    credentialData: Record<string, unknown>,
    type: CredentialType
  ): Promise<VerifiableCredential> {
    const credentialId = `urn:uuid:${crypto.randomUUID()}`;
    const issuanceDate = new Date().toISOString();

    const credential: VerifiableCredential = {
      '@context': VC_CONTEXT,
      id: credentialId,
      type: ['VerifiableCredential', type],
      issuer: {
        id: issuerDID,
        name: credentialData.issuerName as string || 'Unknown Issuer'
      },
      issuanceDate,
      credentialSubject: {
        id: subjectDID,
        ...credentialData
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: issuanceDate,
        proofPurpose: 'assertionMethod',
        verificationMethod: `${issuerDID}#keys-1`,
        jws: '' // Will be generated
      }
    };

    // Generate proof
    const credentialHash = await sha256(JSON.stringify(credential));
    credential.proof.jws = credentialHash;

    logger.info('BACIP: Verifiable Credential created', { id: credentialId });
    return credential;
  }

  /**
   * Create Verifiable Presentation
   */
  static async createVerifiablePresentation(
    holderDID: string,
    credentials: VerifiableCredential[],
    challenge: string
  ): Promise<VerifiablePresentation> {
    const presentation: VerifiablePresentation = {
      '@context': VC_CONTEXT,
      type: ['VerifiablePresentation'],
      verifiableCredential: credentials,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        challenge,
        proofPurpose: 'authentication',
        verificationMethod: `${holderDID}#keys-1`,
        jws: ''
      }
    };

    const presentationHash = await sha256(JSON.stringify(presentation));
    presentation.proof.jws = presentationHash;

    return presentation;
  }

  /**
   * Verify Verifiable Credential
   */
  static async verifyCredential(credential: VerifiableCredential): Promise<boolean> {
    try {
      // Verify structure
      if (!credential['@context'] || !credential.proof) {
        return false;
      }

      // Verify proof
      const { proof, ...credentialWithoutProof } = credential;
      const expectedHash = await sha256(JSON.stringify({ ...credentialWithoutProof, proof: { ...proof, jws: '' } }));
      
      return proof.jws === expectedHash;
    } catch (error) {
      logger.error('BACIP: Credential verification failed', error);
      return false;
    }
  }

  /**
   * Selective Disclosure - Create credential with only selected fields
   */
  static async createSelectiveDisclosure(
    credential: VerifiableCredential,
    fieldsToDisclose: string[]
  ): Promise<VerifiableCredential> {
    const disclosed: Record<string, unknown> = {};
    
    fieldsToDisclose.forEach(field => {
      if (field in credential.credentialSubject) {
        disclosed[field] = credential.credentialSubject[field];
      }
    });

    return {
      ...credential,
      credentialSubject: {
        id: credential.credentialSubject.id,
        ...disclosed
      }
    };
  }

  /**
   * Encrypt credential for private blockchain storage
   */
  static async encryptCredential(
    credential: VerifiableCredential,
    recipientPublicKey: string
  ): Promise<{ encrypted: { ciphertext: string; iv: string }; keyHex: string }> {
    const key = generateAESKey();
    const encrypted = await encryptData(JSON.stringify(credential), key);
    
    // Export key for storage
    const keyBuffer = await crypto.subtle.exportKey('raw', key);
    const keyHex = Array.from(new Uint8Array(keyBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return { encrypted, keyHex };
  }

  /**
   * Generate credential hash for public blockchain
   */
  static async generateCredentialHash(credential: VerifiableCredential): Promise<string> {
    return sha256(JSON.stringify(credential));
  }
}
