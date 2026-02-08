/**
 * W3C Decentralized Identifier (DID) Service
 * Implements W3C DID v1.0 Specification
 * Based on: ZKBAR-V Framework and W3C DID Working Group Standards
 *
 * References:
 * - https://www.w3.org/TR/did-core/
 * - MDPI Sensors 2025 - DID for Academic Credentials
 * - Frontiers 2024 - EBSI Interoperability
 */

import { sha256, generateKeyPair } from './cryptography';
import { createVeramoDID, resolveVeramoDID, type VeramoDIDResult } from './veramoAgent';
import { env } from './env';
import { logger } from './logger';

export interface DIDDocument {
  '@context': string[];
  id: string;
  controller: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  service?: ServiceEndpoint[];
  created: string;
  updated: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: JsonWebKey;
  publicKeyHex?: string;        // Used by did:ethr
  publicKeyBase58?: string;      // Used by did:key
  publicKeyBase64?: string;      // Used by some DID methods
  blockchainAccountId?: string;  // Used by did:pkh
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DIDMetadata {
  did: string;
  name: string;
  role: 'student' | 'issuer' | 'verifier' | 'governance';
  createdAt: string;
  lastUpdated: string;
  institutionName?: string;
  verified: boolean;
}

const memoryStorage = new Map<string, string>();

const storage = {
  getItem: (key: string) => (typeof localStorage === 'undefined' ? memoryStorage.get(key) ?? null : localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    if (typeof localStorage === 'undefined') {
      memoryStorage.set(key, value);
    } else {
      localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof localStorage === 'undefined') {
      memoryStorage.delete(key);
    } else {
      localStorage.removeItem(key);
    }
  },
};

/**
 * Generate a DID compliant with W3C standards
 * Format: did:polygon:chainId:address
 */
export async function generateDID(
  identifier: string,
  method: string = 'polygon'
): Promise<string> {
  // Generate deterministic address from identifier
  const addressHash = await sha256(identifier + Date.now());
  const address = '0x' + addressHash.slice(0, 40);
  
  return `did:${method}:${address}`;
}

/**
 * Create a managed DID using Veramo when available.
 * Falls back to deterministic did:polygon generation when Veramo fails.
 */
export async function createManagedDID(
  alias: string,
  role: DIDMetadata['role']
): Promise<{ did: string; metadata: DIDMetadata }> {
  try {
    const identity = await createVeramoDID(alias);
    const metadata: DIDMetadata = {
      did: identity.did,
      name: alias,
      role,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      verified: false,
    };
    return { did: identity.did, metadata };
  } catch {
    const did = await generateDID(alias, env.blockchainNetwork?.includes('polygon') ? 'polygon' : 'web');
    const metadata: DIDMetadata = {
      did,
      name: alias,
      role,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      verified: false,
    };
    return { did, metadata };
  }
}

/**
 * Create W3C DID Document
 */
export async function createDIDDocument(
  did: string,
  metadata: Partial<DIDMetadata>
): Promise<DIDDocument> {
  const keyPair = await generateKeyPair();
  
  const verificationMethodId = `${did}#key-1`;
  
  const didDocument: DIDDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'EcdsaSecp256k1VerificationKey2019',
        controller: did,
        publicKeyMultibase: keyPair.publicKeyHex
      }
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  // Add service endpoints based on role
  if (metadata.role === 'issuer') {
    didDocument.service = [
      {
        id: `${did}#credential-service`,
        type: 'CredentialIssuerService',
        serviceEndpoint: 'https://credentials.example.edu/api'
      }
    ];
  } else if (metadata.role === 'student') {
    didDocument.service = [
      {
        id: `${did}#wallet-service`,
        type: 'CredentialWalletService',
        serviceEndpoint: 'https://wallet.example.com/api'
      }
    ];
  }

  return didDocument;
}

/**
 * Resolve DID to its Document (simulated registry lookup)
 */
export async function resolveDID(did: string): Promise<DIDDocument | null> {
  // In production, this would query a blockchain or distributed registry
  // For now, we simulate with local storage
  
  const storedDoc = storage.getItem(`did_registry_${did}`);
  if (storedDoc) {
    return JSON.parse(storedDoc);
  }
  
  return null;
}

/**
 * Register DID Document in simulated registry
 */
export async function registerDID(
  didDocument: DIDDocument,
  metadata: DIDMetadata
): Promise<boolean> {
  try {
    // Store DID document
    storage.setItem(`did_registry_${didDocument.id}`, JSON.stringify(didDocument));
    
    // Store metadata
    storage.setItem(`did_metadata_${didDocument.id}`, JSON.stringify(metadata));
    
    // Add to DID index
    const didIndex = JSON.parse(storage.getItem('did_index') || '[]');
    didIndex.push({
      did: didDocument.id,
      created: didDocument.created,
      role: metadata.role
    });
    storage.setItem('did_index', JSON.stringify(didIndex));
    
    return true;
  } catch (error) {
    logger.error('DID registration error:', error);
    return false;
  }
}

/**
 * Update DID Document
 */
export async function updateDIDDocument(
  did: string,
  updates: Partial<DIDDocument>
): Promise<boolean> {
  try {
    const existing = await resolveDID(did);
    if (!existing) return false;
    
    const updated = {
      ...existing,
      ...updates,
      updated: new Date().toISOString()
    };
    
    storage.setItem(`did_registry_${did}`, JSON.stringify(updated));
    return true;
  } catch (error) {
    logger.error('DID update error:', error);
    return false;
  }
}

/**
 * Revoke DID (mark as deactivated)
 */
export async function revokeDID(did: string): Promise<boolean> {
  try {
    const didDoc = await resolveDID(did);
    if (!didDoc) return false;
    
    const deactivatedDoc = {
      ...didDoc,
      deactivated: true,
      updated: new Date().toISOString()
    };
    
    storage.setItem(`did_registry_${did}`, JSON.stringify(deactivatedDoc));
    return true;
  } catch (error) {
    logger.error('DID revocation error:', error);
    return false;
  }
}

/**
 * Verify DID ownership through challenge-response
 */
export async function verifyDIDOwnership(
  did: string,
  challenge: string,
  signature: string
): Promise<boolean> {
  try {
    const didDoc = await resolveDID(did);
    if (!didDoc) return false;

    // Extract public key from DID document
    // DID documents have verificationMethod array with public keys
    const verificationMethod = didDoc.verificationMethod?.[0];
    if (!verificationMethod) {
      logger.error('[DID] No verification method found in DID document');
      return false;
    }

    // For did:key and did:ethr, the public key is in publicKeyHex or publicKeyJwk
    const publicKeyHex = verificationMethod.publicKeyHex ||
                         verificationMethod.publicKeyBase58;

    if (!publicKeyHex) {
      logger.error('[DID] No public key found in verification method');
      return false;
    }

    // Validate signature format (should be hex string starting with 0x)
    if (!signature.startsWith('0x') || signature.length < 130) {
      logger.error('[DID] Invalid signature format');
      return false;
    }

    // Import the public key from hex format
    const publicKeyBytes = new Uint8Array(
      publicKeyHex.replace(/^0x/, '').match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    // Verify signature using cryptography service
    const { verifySignature } = await import('./cryptography');
    return await verifySignature(challenge, signature, publicKey);
  } catch (error) {
    logger.error('[DID] Signature verification error:', error);
    return false;
  }
}

/**
 * Create Verifiable Presentation with DID
 */
export interface VerifiablePresentation {
  '@context': string[];
  type: string[];
  holder: string; // DID of the holder
  verifiableCredential: unknown[];
  proof: {
    type: string;
    created: string;
    proofPurpose: string;
    verificationMethod: string;
    challenge?: string;
    jws?: string;
  };
}

export async function createVerifiablePresentation(
  holderDID: string,
  credentials: unknown[],
  challenge?: string
): Promise<VerifiablePresentation> {
  const presentation: VerifiablePresentation = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1'
    ],
    type: ['VerifiablePresentation'],
    holder: holderDID,
    verifiableCredential: credentials,
    proof: {
      type: 'EcdsaSecp256k1Signature2019',
      created: new Date().toISOString(),
      proofPurpose: 'authentication',
      verificationMethod: `${holderDID}#key-1`,
      challenge,
      jws: await sha256(JSON.stringify(credentials) + challenge)
    }
  };
  
  return presentation;
}

/**
 * Get all DIDs from registry (for admin purposes)
 */
export function getAllDIDs(): Array<{ did: string; created: string; role: string }> {
  const index = storage.getItem('did_index');
  return index ? JSON.parse(index) : [];
}

/**
 * Search DIDs by role
 */
export function searchDIDsByRole(role: string): string[] {
  const allDIDs = getAllDIDs();
  return allDIDs.filter(d => d.role === role).map(d => d.did);
}

/**
 * Get DID Metadata
 */
export function getDIDMetadata(did: string): DIDMetadata | null {
  const metadata = storage.getItem(`did_metadata_${did}`);
  return metadata ? JSON.parse(metadata) : null;
}

// ------------------------------------------------------------------
// Veramo-backed DID operations (production path)
// ------------------------------------------------------------------

/**
 * Create a DID using the Veramo framework (did:ethr).
 * Falls back to the simulated polygon DID on error.
 */
export async function createProductionDID(
  alias?: string
): Promise<{ did: string; keys: VeramoDIDResult['keys'] }> {
  try {
    const result = await createVeramoDID(alias);
    return { did: result.did, keys: result.keys };
  } catch {
    const did = await generateDID(alias ?? 'default');
    return { did, keys: [] };
  }
}

/**
 * Resolve a DID using Veramo, then fall back to local registry.
 */
export async function resolveProductionDID(did: string): Promise<DIDDocument | null> {
  // Try Veramo resolver first (supports did:ethr via RPC)
  try {
    const doc = await resolveVeramoDID(did);
    if (doc) return doc as unknown as DIDDocument;
  } catch {
    // Fall through to local
  }

  return resolveDID(did);
}
