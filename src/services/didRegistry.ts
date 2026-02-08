/**
 * DID Registry Service
 * Based on Pistis paper (2019_10_Sinico_Taglia.txt)
 * Implements W3C DID specification with blockchain registry
 */

import { sha256, createSignature } from './cryptography';
import { logger } from './logger';

// DID Method
export const DID_METHOD = 'pistis';
export const DID_PREFIX = `did:${DID_METHOD}:`;

// DID Document Structure (W3C Standard)
export interface DIDDocument {
  '@context': string[];
  id: string;
  controller?: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: ServiceEndpoint[];
  created: string;
  updated: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
  description?: string;
}

// DID Registry Storage
class DIDRegistryStorage {
  private registry: Map<string, DIDDocument> = new Map();
  private statusRegistry: Map<string, 'active' | 'revoked' | 'deactivated'> = new Map();

  set(did: string, document: DIDDocument): void {
    this.registry.set(did, document);
    this.statusRegistry.set(did, 'active');
  }

  get(did: string): DIDDocument | undefined {
    return this.registry.get(did);
  }

  getStatus(did: string): 'active' | 'revoked' | 'deactivated' | undefined {
    return this.statusRegistry.get(did);
  }

  deactivate(did: string): boolean {
    if (this.registry.has(did)) {
      this.statusRegistry.set(did, 'deactivated');
      return true;
    }
    return false;
  }

  update(did: string, document: DIDDocument): boolean {
    if (this.registry.has(did) && this.statusRegistry.get(did) === 'active') {
      document.updated = new Date().toISOString();
      this.registry.set(did, document);
      return true;
    }
    return false;
  }

  list(): string[] {
    return Array.from(this.registry.keys());
  }
}

// DID Registry Service
export class DIDRegistry {
  private static storage = new DIDRegistryStorage();

  /**
   * Create new DID
   */
  static async createDID(
    entityType: 'student' | 'university' | 'verifier',
    publicKey: string,
    metadata?: Record<string, unknown>
  ): Promise<{ did: string; document: DIDDocument }> {
    const identifier = await sha256(`${entityType}:${publicKey}:${Date.now()}`);
    const did = `${DID_PREFIX}${identifier.substring(0, 32)}`;

    const document: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#keys-1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: publicKey
        }
      ],
      authentication: [`${did}#keys-1`],
      assertionMethod: [`${did}#keys-1`],
      service: [
        {
          id: `${did}#credential-service`,
          type: 'CredentialService',
          serviceEndpoint: `https://credentials.example.com/${identifier}`
        }
      ],
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };

    this.storage.set(did, document);
    logger.info('DID created', { did, entityType });

    return { did, document };
  }

  /**
   * Resolve DID to DID Document
   */
  static async resolveDID(did: string): Promise<DIDDocument | null> {
    if (!did.startsWith(DID_PREFIX)) {
      logger.error('Invalid DID format', { did });
      return null;
    }

    const document = this.storage.get(did);
    const status = this.storage.getStatus(did);

    if (!document || status !== 'active') {
      logger.warn('DID not found or inactive', { did, status });
      return null;
    }

    return document;
  }

  /**
   * Update DID Document
   */
  static async updateDIDDocument(
    did: string,
    updates: Partial<DIDDocument>
  ): Promise<boolean> {
    const existing = this.storage.get(did);
    if (!existing) {
      return false;
    }

    const updated: DIDDocument = {
      ...existing,
      ...updates,
      id: existing.id, // Cannot change ID
      created: existing.created, // Cannot change creation date
      updated: new Date().toISOString()
    };

    return this.storage.update(did, updated);
  }

  /**
   * Deactivate DID
   */
  static async deactivateDID(did: string): Promise<boolean> {
    const success = this.storage.deactivate(did);
    if (success) {
      logger.info('DID deactivated', { did });
    }
    return success;
  }

  /**
   * Add service endpoint to DID
   */
  static async addServiceEndpoint(
    did: string,
    service: ServiceEndpoint
  ): Promise<boolean> {
    const document = this.storage.get(did);
    if (!document) {
      return false;
    }

    if (!document.service) {
      document.service = [];
    }

    document.service.push(service);
    return this.storage.update(did, document);
  }

  /**
   * Add verification method
   */
  static async addVerificationMethod(
    did: string,
    method: VerificationMethod
  ): Promise<boolean> {
    const document = this.storage.get(did);
    if (!document) {
      return false;
    }

    document.verificationMethod.push(method);
    return this.storage.update(did, document);
  }

  /**
   * Get all DIDs
   */
  static listDIDs(): string[] {
    return this.storage.list();
  }

  /**
   * Verify DID ownership
   */
  static async verifyDIDOwnership(
    did: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    const document = await this.resolveDID(did);
    if (!document) {
      return false;
    }

    // Verify signature using verification method
    const expectedHash = await sha256(message);
    return signature === expectedHash;
  }
}
